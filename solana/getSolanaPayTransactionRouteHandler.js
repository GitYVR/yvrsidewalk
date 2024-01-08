const { getStructEncoder } = require('@solana/codecs-data-structures');
const {
  getU8Encoder,
  getU32Encoder,
  getU64Encoder,
} = require('@solana/codecs-numbers');
const { getAssociatedTokenAddressSync } = require('@solana/spl-token');
const {
  AccountRole,
  appendTransactionInstruction,
  createTransaction,
  getAddressFromPublicKey,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionLifetimeUsingBlockhash,
  setTransactionFeePayer,
  partiallySignTransaction,
} = require('@solana/web3.js-experimental');
const asyncHandler = require('express-async-handler');

const { runSolanaTransactionDetector } = require('../messageQueue');
const { createShamPublicKey } = require('./publicKey');
const { getRpc } = require('./rpc');
const { getServerAuthorityKeyPair } = require('./serverAuthority');
const { getPrice, getTokenDecimals } = require('./tokenPriceOracles');

const MEMO_PROGRAM_ADDRESS = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

function validateParams(params) {
  const message = validateMessage(params.message);
  return {
    message,
    token: params.token,
  };
}

function validateMessage(message) {
  if (/[A-Za-z ]{0,64}/.test(message) === false) {
    throw new Error(
      `Invalid message \`${message}\`. Max 64 characters, alphabets and spaces only.`,
    );
  }
  return message;
}

async function getDonationAmount(token) {
  const tokenDecimals = getTokenDecimals(token);
  const price = await getPrice(token);
  return Math.floor((1 / price) * Math.pow(10, tokenDecimals));
}

function getTokenMint(token) {
  switch (token) {
    case 'bonk':
      return process.env.MINT_ADDRESS_BONK_SOLANA;
    case 'usdc':
      return process.env.MINT_ADDRESS_USDC_SOLANA;
    default:
      throw new Error(`Mint account unknown for token \`${token}\``);
  }
}

function getTokenAccountAddress(ownerAddress, token) {
  const mintAddress = getTokenMint(token);
  return getAssociatedTokenAddressSync(
    createShamPublicKey(mintAddress),
    createShamPublicKey(ownerAddress),
    false /* allowOwnerOffCurve */,
  ).toBase58();
}

function getTakeDonationInstruction(payerAddress, token, donationAmount) {
  const treasuryAddress = process.env.MULTISIG_ADDRESS_SOLANA;
  if (token === 'sol') {
    // Return a native token transfer instruction.
    return {
      accounts: [
        { address: payerAddress, role: AccountRole.WRITABLE_SIGNER },
        { address: treasuryAddress, role: AccountRole.WRITABLE },
      ],
      data: getStructEncoder([
        ['instruction', getU32Encoder()],
        ['lamports', getU64Encoder()],
      ]).encode({
        lamports: donationAmount,
        instruction: 2 /* transfer */,
      }),
      programAddress: '11111111111111111111111111111111' /* System Program */,
    };
  } else {
    // Return an SPL token transfer instruction.
    const source = getTokenAccountAddress(payerAddress, token);
    const destination = getTokenAccountAddress(treasuryAddress, token);
    return {
      accounts: [
        { address: source, role: AccountRole.WRITABLE },
        { address: destination, role: AccountRole.WRITABLE },
        { address: payerAddress, role: AccountRole.READONLY_SIGNER },
      ],
      data: getStructEncoder([
        ['instruction', getU8Encoder()],
        ['amount', getU64Encoder()],
      ]).encode({
        amount: donationAmount,
        instruction: 3 /* transfer */,
      }),
      programAddress:
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' /* Token Program */,
    };
  }
}

function getSidewalkMessageMemoInstruction(message, serverAuthorityAddress) {
  return {
    accounts: [
      { address: serverAuthorityAddress, role: AccountRole.READONLY_SIGNER },
    ],
    data: new TextEncoder().encode(`yvrsidewalk:${message}`),
    programAddress: MEMO_PROGRAM_ADDRESS,
  };
}

function getLabel(message) {
  return `Set the YVR Sidewalk message to \u201C${message}\u201D`;
}

function solanaPayTransactionInfoRouteHandler(req, res) {
  const message = validateMessage(req.params.message);
  res.status(200).send({
    label: getLabel(message),
  });
}

async function solanaPayTransactionRouteHandler(req, res) {
  const feePayerAddress = req.body.account;
  if (!feePayerAddress) {
    throw new Error('Missing fee payer account address');
  }
  const { message, token } = validateParams(req.params);
  const [
    { value: latestBlockhash },
    donationAmount,
    { serverAuthorityAddress, serverAuthorityKeyPair },
  ] = await Promise.all([
    getRpc().getLatestBlockhash({ commitment: 'confirmed' }).send(),
    getDonationAmount(token),
    (async () => {
      const serverAuthorityKeyPair = await getServerAuthorityKeyPair();
      const serverAuthorityAddress = await getAddressFromPublicKey(
        serverAuthorityKeyPair.publicKey,
      );
      return { serverAuthorityAddress, serverAuthorityKeyPair };
    })(),
  ]);

  const transaction = pipe(
    createTransaction({ version: 'legacy' }),
    (tx) => setTransactionFeePayer(feePayerAddress, tx),
    (tx) => setTransactionLifetimeUsingBlockhash(latestBlockhash, tx),
    // Charge the user in their chosen token.
    (tx) =>
      appendTransactionInstruction(
        getTakeDonationInstruction(feePayerAddress, token, donationAmount),
        tx,
      ),
    // Record the message on-chain to be picked up by the queue.
    (tx) =>
      appendTransactionInstruction(
        getSidewalkMessageMemoInstruction(message, serverAuthorityAddress),
        tx,
      ),
    // TODO: We could add an instruction here that fails the transaction if token price has dropped
    //       too much. See https://solana.stackexchange.com/q/9056/75
  );
  const signedTransaction = await partiallySignTransaction(
    [serverAuthorityKeyPair],
    transaction,
  );

  await runSolanaTransactionDetector(latestBlockhash.lastValidBlockHeight);

  res.json({
    message: getLabel(message),
    transaction: getBase64EncodedWireTransaction(signedTransaction),
  });
}

module.exports = {
  solanaPayTransactionInfoRouteHandler,
  solanaPayTransactionRouteHandler: asyncHandler(
    solanaPayTransactionRouteHandler,
  ),
};
