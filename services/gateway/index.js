// Starts the gateway: loads tracing, checks settings,
// then serves the routes from app.js.
require('./tracing'); // must load first, so OpenTelemetry can wrap the libraries
const logger = require('pino')();
const { createApp } = require('./app');

// Fail fast if any configuration is missing
const required = ['PORT', 'PRODUCT_SERVICE_URL', 'ORDER_SERVICE_URL'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  logger.error({ missing }, 'Missing environment variables');
  process.exit(1);
}

const app = createApp({
  productServiceUrl: process.env.PRODUCT_SERVICE_URL,
  orderServiceUrl: process.env.ORDER_SERVICE_URL,
});

const server = app.listen(process.env.PORT, () => {
  logger.info({ port: process.env.PORT }, 'Gateway listening');
});

// Graceful shutdown: stop new requests, finish current ones
const shutdown = (signal) => {
  logger.info({ signal }, 'Shutting down');
  setTimeout(() => process.exit(1), 8000).unref();
  server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
