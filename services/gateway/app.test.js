// Unit tests for the gateway. A fake fetch stands in for the product
// and order services, so no other service needs to run.
const request = require('supertest');
const { createApp } = require('./app');

const app = createApp({
  productServiceUrl: 'http://product.test',
  orderServiceUrl: 'http://order.test',
});

afterEach(() => jest.restoreAllMocks());

test('GET /health returns 200', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
});

test('GET /metrics exposes Prometheus metrics', async () => {
  const res = await request(app).get('/metrics');
  expect(res.status).toBe(200);
  expect(res.text).toContain('http_request_duration_seconds');
});

test('forwards GET /products to the product service', async () => {
  const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ status: 200, text: async () => '[]' });
  const res = await request(app).get('/products');
  expect(res.status).toBe(200);
  expect(fetchSpy.mock.calls[0][0]).toBe('http://product.test/products');
});

test('forwards POST /orders to the order service with its body', async () => {
  const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ status: 201, text: async () => '{}' });
  const res = await request(app).post('/orders').send({ product_id: 1, quantity: 2 });
  expect(res.status).toBe(201);
  const [url, options] = fetchSpy.mock.calls[0];
  expect(url).toBe('http://order.test/orders');
  expect(options.method).toBe('POST');
  expect(JSON.parse(options.body)).toEqual({ product_id: 1, quantity: 2 });
});

test('returns 502 when a service cannot be reached', async () => {
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('connection refused'));
  const res = await request(app).get('/products');
  expect(res.status).toBe(502);
});

test('returns 404 for an unknown path', async () => {
  const res = await request(app).get('/unknown');
  expect(res.status).toBe(404);
});
