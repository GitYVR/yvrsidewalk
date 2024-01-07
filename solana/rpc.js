const {
  createDefaultRpcTransport,
  createSolanaRpc,
} = require('@solana/web3.js-experimental');

let rpc;
function getRpc() {
  if (!rpc) {
    const transport = createDefaultRpcTransport({
      url: process.env.RPC_URL_SOLANA,
    });
    rpc = createSolanaRpc({ transport });
  }
  return rpc;
}

module.exports = {
  getRpc,
};
