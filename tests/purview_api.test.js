const request = require('supertest');
const app = require('../server');

describe.skip('Public Purview API (skipped by default - requires DB)', () => {
  it('responds with ok and data', async () => {
    const res = await request(app).get('/api/public/purview');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
    expect(res.body).toHaveProperty('data');
  });
});
