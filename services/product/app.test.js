// Unit tests for the product service. A fake database and a fake Redis
// cache stand in for the real ones, so no setup is needed.
const request = require('supertest');
const { createApp } = require('./app');

const db = { query: jest.fn() };
const cache = { ping: jest.fn(), get: jest.fn(), setEx: jest.fn(), del: jest.fn() };
const app = createApp({ db, cache, cacheTtl: 60 });

beforeEach(() => {
  db.query.mockReset();
  Object.values(cache).forEach((fn) => fn.mockReset());
});

describe('GET /health', () => {
  test('returns 200 when Postgres and Redis answer', async () => {
    db.query.mockResolvedValue({ rows: [] });
    cache.ping.mockResolvedValue('PONG');
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  test('returns 503 when Redis is down', async () => {
    db.query.mockResolvedValue({ rows: [] });
    cache.ping.mockRejectedValue(new Error('connection refused'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
  });
});

describe('GET /metrics', () => {
  test('exposes Prometheus metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('http_request_duration_seconds');
  });
});

describe('GET /products', () => {
  const rows = [{ id: 1, name: 'Pen', price: '2.50' }];

  test('serves from the cache when a copy exists', async () => {
    cache.get.mockResolvedValue(JSON.stringify(rows));
    const res = await request(app).get('/products');
    expect(res.body.source).toBe('cache');
    expect(db.query).not.toHaveBeenCalled();
  });

  test('falls back to the database and saves a copy', async () => {
    cache.get.mockResolvedValue(null);
    db.query.mockResolvedValue({ rows });
    const res = await request(app).get('/products');
    expect(res.body.source).toBe('database');
    expect(cache.setEx).toHaveBeenCalledWith('products:all', 60, JSON.stringify(rows));
  });
});

describe('GET /products/:id', () => {
  test('returns 404 for a product that does not exist', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/products/99');
    expect(res.status).toBe(404);
  });
});

describe('POST /products', () => {
  test('rejects a product without a price', async () => {
    const res = await request(app).post('/products').send({ name: 'Pen' });
    expect(res.status).toBe(400);
  });

  test('creates a product and clears the cache', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 2, name: 'Book', price: '12.00' }] });
    const res = await request(app).post('/products').send({ name: 'Book', price: 12 });
    expect(res.status).toBe(201);
    expect(cache.del).toHaveBeenCalledWith('products:all');
  });
});
