const { getBase64Encoder } = require('@solana/codecs-strings');
const {
  getAddressFromPublicKey,
  getTransactionDecoder,
} = require('@solana/web3.js-experimental');

const { getRpc, getRpcSubscriptions } = require('./solana/rpc');
const { getServerAuthorityKeyPair } = require('./solana/serverAuthority');

const MEMO_PROGRAM_ADDRESS = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

const queue = [];

// Display the next message in the queue on the sidewalk.
setInterval(
  () => {
    // Make sure queue is > 0
    if (queue.length === 0) {
      return;
    }

    // Shift
    const curString = queue.shift();

    // TODO:
    console.log(`Changing text to ${curString}`);
    fetch('http://192.168.1.51:3456/startshow', {
      headers: {
        accept: '*/*',
        'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
      body: `show=Banner&banner=${curString}&imgShow=orangeDot`,
      method: 'POST',
    })
      .then(() => {
        console.log('successfully changed text');
      })
      .catch(() => {
        console.log('failed to change text');
      });
  },
  1 * 60 * 1000,
);

let blockHeightAtWhichToShutDownSolanaTransactionDetector = null;
async function runSolanaTransactionDetector(lastValidBlockHeight) {
  if (blockHeightAtWhichToShutDownSolanaTransactionDetector != null) {
    console.info('The Solana transaction detector is already running.');
    if (
      lastValidBlockHeight >
      blockHeightAtWhichToShutDownSolanaTransactionDetector
    ) {
      blockHeightAtWhichToShutDownSolanaTransactionDetector =
        lastValidBlockHeight;
    }
    return;
  }
  console.info(
    `Starting the Solana transaction detector. Running until block height ${lastValidBlockHeight}`,
  );
  blockHeightAtWhichToShutDownSolanaTransactionDetector = lastValidBlockHeight;
  const { publicKey: serverAuthorityPublicKey } =
    await getServerAuthorityKeyPair();
  const serverAuthorityAddress = await getAddressFromPublicKey(
    serverAuthorityPublicKey,
  );
  const abortController = new AbortController();
  const logsNotifications = await getRpcSubscriptions()
    .logsNotifications({ mentions: [serverAuthorityAddress] })
    .subscribe({ abortSignal: abortController.signal });
  (async () => {
    for await (const logsNotification of logsNotifications) {
      const {
        value: { signature },
      } = logsNotification;
      console.log(
        `Received a transaction notification mentioning this server\'s public key: ${signature}`,
      );
      const {
        transaction: [base64EncodedTransaction],
      } = await getRpc()
        .getTransaction(signature, {
          commitment: 'confirmed',
          encoding: 'base64',
        })
        .send();
      const transactionBytes = getBase64Encoder().encode(
        base64EncodedTransaction,
      );
      const transaction = getTransactionDecoder().decode(transactionBytes);
      const memoProgramInstruction = transaction.instructions.find(
        ({ programAddress }) => programAddress === MEMO_PROGRAM_ADDRESS,
      );
      if (!memoProgramInstruction) {
        console.log('Found no memo program instruction');
        continue;
      }
      const memo = new TextDecoder('utf8').decode(memoProgramInstruction.data);
      if (!memo.startsWith('yvrsidewalk:')) {
        console.log(
          'Message in the memo did not start with "yvrsidewalk:"',
          memo,
        );
        continue;
      }
      const message = memo.replace(/^yvrsidewalk:/, '');
      console.log(`Adding a message to the queue: "${message}"`);
      queue.push(message);
    }
  })();
  (async () => {
    try {
      while (true) {
        const currentBlockHeight = await getRpc()
          .getBlockHeight({ commitment: 'confirmed' })
          .send();
        if (
          currentBlockHeight >
          blockHeightAtWhichToShutDownSolanaTransactionDetector
        ) {
          console.info(
            'Stopping the Solana transaction detector; the most recently vended transaction ' +
              'request has expired',
          );
          break;
        }
        await new Promise((resolve) => {
          setTimeout(resolve, 5000);
        });
      }
    } finally {
      blockHeightAtWhichToShutDownSolanaTransactionDetector = null;
      abortController.abort();
    }
  })();
}

module.exports = {
  queue,
  runSolanaTransactionDetector,
};
