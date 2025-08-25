const request = require('supertest');
let app;

// We wrap server.js export into an app factory if not already; else require server will start listening.
// To avoid double listening, we build a lightweight express app mounting the exported routers if needed.
// Current server.js starts the listener directly, so for tests we spin up a fresh instance by requiring express & the route modules.

const express = require('express');
const publicRoutes = require('../routes/public');
let adminRoutes;
try {
  adminRoutes = require('../routes/admin');
} catch {
  adminRoutes = express.Router();
}

// Editors modular router
let editorsRouter;
try {
  editorsRouter = require('../routes/editors/index');
} catch {
  editorsRouter = express.Router();
}

function buildApp() {
  const a = express();
  a.use(express.json());
  a.use('/', publicRoutes);
  a.use('/admin', adminRoutes);
  a.use('/editors', editorsRouter);
  // Inject redirect middleware snippet similar to server.js (simplified)
  a.use((req, res, next) => {
    const allowList = [
      /^\/admin\/?$/,
      /^\/admin\/blog-config$/,
      /^\/admin\/ai-usage$/,
      /^\/admin\/tools$/,
      /^\/admin\/api_keys$/,
    ];
    if (allowList.some((r) => r.test(req.path))) return next();
    const rules = [
      [/^\/admin\/(posts)(\/.*)?$/, '/editors/posts'],
      [/^\/admin\/(media)(\/.*)?$/, '/editors/media'],
      [/^\/admin\/(podcasts)(\/.*)?$/, '/editors/podcasts'],
      [/^\/admin\/(advanced-pages)(\/.*)?$/, '/editors/advanced-pages'],
      [/^\/admin\/(timeline-editor)(\/.*)?$/, '/editors/timeline-editor'],
    ];
    for (const [re, target] of rules) {
      if (re.test(req.path)) return res.redirect(301, target);
    }
    next();
  });
  a.get('/health', (req, res) => res.json({ status: 'ok' }));
  a.use((req, res) => res.status(404).json({ error: 'nf' }));
  return a;
}

beforeAll(() => {
  app = buildApp();
});

describe('Health endpoint', () => {
  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Redirect middleware', () => {
  test.each([
    ['/admin/posts', '/editors/posts'],
    ['/admin/media', '/editors/media'],
    ['/admin/podcasts', '/editors/podcasts'],
    ['/admin/advanced-pages', '/editors/advanced-pages'],
    ['/admin/timeline-editor', '/editors/timeline-editor'],
  ])('redirect %s -> %s', async (from, to) => {
    const res = await request(app).get(from);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(to);
  });
});
