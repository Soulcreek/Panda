const request = require('supertest');
const express = require('express');
const adminRoutes = require('../routes/admin');

function buildApp() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  // Provide empty session object so auth middleware finds nothing
  app.use((req, res, next) => {
    req.session = {};
    next();
  });
  app.use('/admin', adminRoutes);
  return app;
}

const app = buildApp();

describe('Admin unauthenticated access', () => {
  const protectedPaths = [
    '/admin/',
    '/admin/blog-config',
    '/admin/ai-usage',
    '/admin/tools',
    '/admin/tools/raw',
    '/admin/tools/tables',
  ];
  test.each(protectedPaths)('redirects %s to /login', async (p) => {
    const res = await request(app).get(p);
    expect([301, 302, 303]).toContain(res.status);
    expect(res.headers.location).toBe('/login');
  });
});
