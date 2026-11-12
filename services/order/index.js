// Starts the order service: loads tracing, checks settings,
// connects to Postgres, then serves the routes from app.js.
require('./tracing'); // must load first, so OpenTelemetry can wrap the libraries
const { Pool } = require('pg');
const logger = require('pino')();
const { createApp } = require('./app');

// Fail fast if any configuration is missing
const required = ['PORT', 'PRODUCT_SERVICE_URL', 'PGHOST', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  logger.error({ missing }, 'Missing environment variables');
  process.exit(1);
}

// pg reads PGHOST, PGPORT, PGUSER, PGPASSWORD and PGDATABASE automatically
const db = new Pool();
const app = createApp({ db, productServiceUrl: process.env.PRODUCT_SERVICE_URL });

async function start() {
  await db.query(`CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    total NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const server = app.listen(process.env.PORT, () => {
    logger.info({ port: process.env.PORT }, 'Order service listening');
  });

  // Graceful shutdown: stop new requests, finish current ones, close connections
  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutting down');
    setTimeout(() => process.exit(1), 8000).unref();
    server.close(async () => {
      await db.end();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  logger.error({ err }, 'Startup failed');
  process.exit(1);
});
