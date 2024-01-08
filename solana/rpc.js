const {
  createDefaultRpcTransport,
  createDefaultRpcSubscriptionsTransport,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
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

let rpcSubscriptions;
function getRpcSubscriptions() {
  if (!rpcSubscriptions) {
    const transport = createDefaultRpcSubscriptionsTransport({
      url: process.env.RPC_URL_SOLANA.replace(/^http/, 'ws'),
    });
    rpcSubscriptions = createSolanaRpcSubscriptions({ transport });
  }
  return rpcSubscriptions;
}

module.exports = {
  getRpc,
  getRpcSubscriptions,
};
