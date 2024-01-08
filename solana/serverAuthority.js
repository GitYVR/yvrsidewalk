const { createPrivateKeyFromBytes } = require('@solana/web3.js-experimental');
const {
  ed25519: { getPublicKey },
} = require('@noble/curves/ed25519');

let seedBytes;
async function getSeedBytes() {
  if (!seedBytes) {
    const arrayBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(process.env.SERVER_SECRET),
    );
    seedBytes = new Uint8Array(arrayBuffer);
  }
  return seedBytes;
}

async function getServerAuthorityPrivateKey() {
  return createPrivateKeyFromBytes(await getSeedBytes());
}

async function getServerAuthorityPublicKey() {
  const publicKeyBytes = getPublicKey(await getSeedBytes());
  return await crypto.subtle.importKey(
    'raw',
    publicKeyBytes,
    'Ed25519',
    true /* extractable */,
    ['verify'],
  );
}

let keyPair;
async function getServerAuthorityKeyPair() {
  const [privateKey, publicKey] = await Promise.all([
    getServerAuthorityPrivateKey(),
    getServerAuthorityPublicKey(),
  ]);
  return {
    privateKey,
    publicKey,
  };
}

module.exports = {
  getServerAuthorityKeyPair,
};
