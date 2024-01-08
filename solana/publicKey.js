const { getAddressEncoder } = require('@solana/web3.js-experimental');

function createShamPublicKey(address) {
  return {
    toBase58() {
      return address;
    },
    toBuffer() {
      return Buffer.from(getAddressEncoder().encode(address));
    },
  };
}

module.exports = {
  createShamPublicKey,
};
