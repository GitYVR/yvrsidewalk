const { parsePriceData } = require('@pythnetwork/client');

const { getRpc } = require('./rpc');

const ACCEPTABLE_PRICE_STALENESS_MS = 10_000;
const TOKEN_TO_USDC_PRICE_ORACLE_ADDRESS = {
  bonk: process.env.PYTH_BONK_PRICE_ORACLE_ACCOUNT_ADDRESS,
  sol: process.env.PYTH_SOL_PRICE_ORACLE_ACCOUNT_ADDRESS,
};
const TOKEN_DECIMALS = {
  bonk: 5,
  sol: 9,
  usdc: 6,
};

function assertTokenIsSupported(token) {
  if (!(token in TOKEN_TO_USDC_PRICE_ORACLE_ADDRESS)) {
    throw new Error(`Unsupported token $${token}`);
  }
}

async function getPrice(priceOracleAddress) {
  const { value: priceAccountInfo } = await getRpc()
    .getAccountInfo(priceOracleAddress, {
      commitment: 'confirmed',
      encoding: 'base64',
    })
    .send();
  const { price } = parsePriceData(
    Buffer.from(priceAccountInfo.data[0], 'base64'),
  );
  return { price };
}

const priceGetters = {};
Object.entries(TOKEN_TO_USDC_PRICE_ORACLE_ADDRESS).forEach(
  ([token, priceOracleAddress]) => {
    let lastFetchTime;
    let lastPrice;
    priceGetters[token] = async function () {
      const currentTime = Date.now();
      if (
        lastPrice == null ||
        lastFetchTime == null ||
        currentTime - lastFetchTime >= ACCEPTABLE_PRICE_STALENESS_MS
      ) {
        lastFetchTime = currentTime;
        const { price } = await getPrice(priceOracleAddress);
        lastPrice = price;
      }
      return lastPrice;
    };
  },
);

module.exports = {
  TOKEN_TO_USDC_PRICE_ORACLE_ADDRESS,
  async getPrice(token) {
    if (token === 'usdc') {
      return 1;
    }
    assertTokenIsSupported(token);
    return await priceGetters[token]();
  },
  getTokenDecimals(token) {
    if (token !== 'usdc') {
      assertTokenIsSupported(token);
    }
    return TOKEN_DECIMALS[token];
  },
};
