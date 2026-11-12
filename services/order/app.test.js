// Unit tests for the order service. A fake database (mock) and a fake
// product service stand in for the real ones, so no setup is needed.
const request = require('supertest');
const { createApp } = require('./app');

const db = { query: jest.fn() };
const app = createApp({ db, productServiceUrl: 'http://product.test' });

beforeEach(() => db.query.mockReset());
afterEach(() => jest.restoreAllMocks());

describe('GET /health', () => {
  test('returns 200 when the database answers', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  test('returns 503 when the database is down', async () => {
    db.query.mockRejectedValue(new Error('connection refused'));
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

describe('POST /orders', () => {
  test('rejects a quantity of 0', async () => {
    const res = await request(app).post('/orders').send({ product_id: 1, quantity: 0 });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('rejects a product that does not exist', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ status: 404, ok: false });
    const res = await request(app).post('/orders').send({ product_id: 99, quantity: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Product does not exist');
  });

  test('returns 503 when the product service is down', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'));
    const res = await request(app).post('/orders').send({ product_id: 1, quantity: 1 });
    expect(res.status).toBe(503);
  });

  test('saves an order with the correct total', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ id: 1, price: '10.00' }),
    });
    db.query.mockResolvedValue({ rows: [{ id: 1, product_id: 1, quantity: 2, total: 20 }] });
    const res = await request(app).post('/orders').send({ product_id: 1, quantity: 2 });
    expect(res.status).toBe(201);
    expect(db.query.mock.calls[0][1]).toEqual([1, 2, 20]);
  });
});
