const request = require('supertest');
const express = require('express');

// Build minimal app mounting new modular admin without starting full server (session mocking simplified)
const adminRoutes = require('../routes/admin');
const publicRoutes = require('../routes/public');

function fakeSession(req, res, next) {
  // Simulate logged-in admin
  req.session = { isLoggedIn: true, userId: 1, adminTokenValid: true };
  next();
}

function buildApp() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(fakeSession);
  app.use('/', publicRoutes);
  app.use('/admin', adminRoutes);
  app.use((req, res) => res.status(404).json({ nf: true }));
  return app;
}

const app = buildApp();

describe('Modular Admin Routes', () => {
  test('blog-config page responds (HTML)', async () => {
    const res = await request(app).get('/admin/blog-config');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Blog Konfiguration');
  });
  test('tools structured view', async () => {
    const res = await request(app).get('/admin/tools');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Admin Tools');
  });
  test('legacy redirect advanced-pages -> editors', async () => {
    const res = await request(app).get('/admin/advanced-pages');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/editors/advanced-pages');
  });
});
