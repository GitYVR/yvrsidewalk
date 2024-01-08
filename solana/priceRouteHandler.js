const asyncHandler = require('express-async-handler');

const { getPrice } = require('./tokenPriceOracles');

async function priceRouteHandler(req, res) {
  const token = req.query.token.toLowerCase();
  const price = await getPrice(token);
  res.json(price);
}

module.exports = asyncHandler(priceRouteHandler);
