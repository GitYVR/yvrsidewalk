require('dotenv').config();
const cors = require('cors');
const ethers = require('ethers');
const asyncHandler = require('express-async-handler');
const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');

const priceRouteHandler = require('./solana/priceRouteHandler');
const { queue } = require('./messageQueue');

// **** Block listener ****

const ENV_VARS = [
  'RPC_URL',
  'RPC_URL_SOLANA',
  'MULTISIG_ADDRESS',
  'PYTH_BONK_PRICE_ORACLE_ACCOUNT_ADDRESS',
  'PYTH_SOL_PRICE_ORACLE_ACCOUNT_ADDRESS',
];
for (let i = 0; i < ENV_VARS.length; i++) {
  const envVar = ENV_VARS[i];
  if (process.env[envVar] === undefined) {
    console.log(`Missing ${envVar} environment variable`);
    process.exit(1);
  } else {
    console.log(`${envVar}: ${process.env[envVar]}`);
  }
}
const RPC_URL = process.env.RPC_URL;
const MULTISIG_ADDRESS = process.env.MULTISIG_ADDRESS.toLowerCase();

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

const onBlock = async (b) => {
  const block = await provider.getBlockWithTransactions(b);
  const relevantTxs = block.transactions
    .filter((x) => (x.to || '').toLowerCase() === MULTISIG_ADDRESS)
    .filter((x) =>
      (x.value || ethers.constants.Zero).gte(ethers.utils.parseUnits('1')),
    );

  console.log(b, 'Payment Txs', relevantTxs);

  // Add to the queue
  relevantTxs.forEach((x) => {
    // Max 64 characters
    const str = ethers.utils.toUtf8String(x.data).slice(0, 64);
    queue.push(str);
  });
};

provider.on('block', (b) => {
  onBlock(b);
});

// **** Server ****

const app = express();
const port = 4000;

app.use(cors());
app.options('*', cors());
app.use(morgan('combined'));
app.use(bodyParser.json());

app.get('/price', priceRouteHandler);
app.get(
  '/queue',
  asyncHandler(async (req, res) => {
    res.json({ queue });
  }),
);

app.listen(port, () => {
  console.log(`Express server running on port ${port}`);
});
