// Starts the product service: loads tracing, checks settings, connects to
// Postgres and Redis, then serves the routes from app.js.
require('./tracing'); // must load first, so OpenTelemetry can wrap the libraries
const { Pool } = require('pg');
const { createClient } = require('redis');
const logger = require('pino')();
const { createApp } = require('./app');

// Fail fast if any configuration is missing
const required = ['PORT', 'REDIS_URL', 'CACHE_TTL_SECONDS', 'PGHOST', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  logger.error({ missing }, 'Missing environment variables');
  process.exit(1);
}

// pg reads PGHOST, PGPORT, PGUSER, PGPASSWORD and PGDATABASE automatically
const db = new Pool();
const cache = createClient({ url: process.env.REDIS_URL });
cache.on('error', (err) => logger.error({ err }, 'Redis error'));

const app = createApp({ db, cache, cacheTtl: Number(process.env.CACHE_TTL_SECONDS) });

async function start() {
  await cache.connect();
  await db.query(`CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL
  )`);

  const server = app.listen(process.env.PORT, () => {
    logger.info({ port: process.env.PORT }, 'Product service listening');
  });

  // Graceful shutdown: stop new requests, finish current ones, close connections
  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutting down');
    setTimeout(() => process.exit(1), 8000).unref(); // force exit before the 10 second limit
    server.close(async () => {
      await db.end();
      await cache.close();
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
