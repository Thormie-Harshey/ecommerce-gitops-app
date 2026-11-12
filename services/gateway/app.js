// Routes for the gateway. The service addresses are passed in,
// so tests can point them at fakes instead of real services.
const express = require('express');
const { instrument } = require('./observability');

function createApp({ productServiceUrl, orderServiceUrl }) {
  // Which service owns which path
  const routes = {
    '/products': productServiceUrl,
    '/orders': orderServiceUrl,
  };

  const app = express();
  instrument(app);
  app.use(express.json());

  // Liveness check: the gateway has no dependencies of its own
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
  });

  // Request routing: forward each path to the service that owns it
  for (const [path, target] of Object.entries(routes)) {
    app.use(path, async (req, res) => {
      try {
        const hasBody = !['GET', 'HEAD'].includes(req.method);
        const response = await fetch(`${target}${req.originalUrl}`, {
          method: req.method,
          headers: { 'Content-Type': 'application/json' },
          body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
          signal: AbortSignal.timeout(5000), // give up after 5 seconds
        });
        const data = await response.text();
        res.status(response.status).type('application/json').send(data);
      } catch (err) {
        res.status(502).json({ error: `Could not reach ${path.slice(1)} service`, detail: err.message });
      }
    });
  }

  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  return app;
}

module.exports = { createApp };
