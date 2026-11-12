// Routes for the order service. The database and product URL are passed in,
// so tests can supply a fake database instead of a real one.
const express = require('express');
const { instrument } = require('./observability');

function createApp({ db, productServiceUrl }) {
  const app = express();
  instrument(app);
  app.use(express.json());

  // Readiness check: healthy only if Postgres answers
  app.get('/health', async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'healthy' });
    } catch (err) {
      res.status(503).json({ status: 'unhealthy', error: err.message });
    }
  });

  app.get('/orders', async (req, res) => {
    const { rows } = await db.query('SELECT id, product_id, quantity, total, created_at FROM orders ORDER BY id');
    res.json(rows);
  });

  app.post('/orders', async (req, res) => {
    const { product_id, quantity } = req.body || {};
    if (!Number.isInteger(product_id) || !Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'product_id and quantity must be positive whole numbers' });
    }

    // Ask the product service whether the product exists, and its price
    let product;
    try {
      const response = await fetch(`${productServiceUrl}/products/${product_id}`, {
        signal: AbortSignal.timeout(3000), // give up after 3 seconds
      });
      if (response.status === 404) {
        return res.status(400).json({ error: 'Product does not exist' });
      }
      if (!response.ok) {
        throw new Error(`Product service returned ${response.status}`);
      }
      product = await response.json();
    } catch (err) {
      return res.status(503).json({ error: 'Product service unavailable', detail: err.message });
    }

    const total = Number(product.price) * quantity;
    const { rows } = await db.query(
      'INSERT INTO orders (product_id, quantity, total) VALUES ($1, $2, $3) RETURNING id, product_id, quantity, total, created_at',
      [product_id, quantity, total]
    );
    res.status(201).json(rows[0]);
  });

  return app;
}

module.exports = { createApp };
