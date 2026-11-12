// Routes for the product service. The database, cache and cache lifetime
// are passed in, so tests can supply fakes instead of real ones.
const express = require('express');
const { instrument } = require('./observability');

const CACHE_KEY = 'products:all';

function createApp({ db, cache, cacheTtl }) {
  const app = express();
  instrument(app);
  app.use(express.json());

  // Readiness check: healthy only if Postgres and Redis both answer
  app.get('/health', async (req, res) => {
    try {
      await db.query('SELECT 1');
      await cache.ping();
      res.json({ status: 'healthy' });
    } catch (err) {
      res.status(503).json({ status: 'unhealthy', error: err.message });
    }
  });

  // Cache-aside: try Redis first, fall back to Postgres
  app.get('/products', async (req, res) => {
    const cached = await cache.get(CACHE_KEY);
    if (cached) {
      return res.json({ source: 'cache', products: JSON.parse(cached) });
    }
    const { rows } = await db.query('SELECT id, name, price FROM products ORDER BY id');
    await cache.setEx(CACHE_KEY, cacheTtl, JSON.stringify(rows));
    res.json({ source: 'database', products: rows });
  });

  app.get('/products/:id', async (req, res) => {
    const { rows } = await db.query('SELECT id, name, price FROM products WHERE id = $1', [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(rows[0]);
  });

  app.post('/products', async (req, res) => {
    const { name, price } = req.body || {};
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'name and price are required' });
    }
    const { rows } = await db.query(
      'INSERT INTO products (name, price) VALUES ($1, $2) RETURNING id, name, price',
      [name, price]
    );
    await cache.del(CACHE_KEY); // cache invalidation
    res.status(201).json(rows[0]);
  });

  return app;
}

module.exports = { createApp };
