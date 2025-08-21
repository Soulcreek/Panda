const express = require('express');
const session = require('express-session');
const request = require('supertest');
const pool = require('../db');

// Build minimal app mounting only the timeline editor route to test permission scoping.
function buildApp(){
  const app = express();
  app.use(express.urlencoded({extended:true}));
  app.use(express.json());
  app.use(session({ secret:'test', resave:false, saveUninitialized:true }));
  // Inject siteKey resolution stub (simulate middleware)
  app.use((req,res,next)=>{ req.siteKey = (req.query.__site || 'tenant_a'); next(); });
  const timelineRouter = require('../routes/editors/timeline');
  app.use('/editors', (req,res,next)=>{ // simple role simulation
    // If test sets req.session.role it persists
    if(!req.session.role && req.query.__as){ req.session.role = req.query.__as; }
    next();
  }, timelineRouter);
  app.use((req,res)=> res.status(404).end());
  return app;
}

describe('Timeline editor tenant access', ()=>{
  let app;
  beforeAll(()=>{ app = buildApp(); });
  test('non-admin forced to own tenant despite query override', async()=>{
    // First request sets role=editor with tenant_a
    const agent = request.agent(app);
    await agent.get('/editors/timeline-editor?__as=editor&site=tenant_a');
    // Attempt to access another tenant via query
    const res = await agent.get('/editors/timeline-editor?site=tenant_b');
    expect(res.status).toBe(200);
    // Should render page containing hidden input or site indicator with tenant_a not tenant_b
    expect(res.text).toContain('tenant_a');
    // heuristic: Ensure not switched
    expect(res.text).not.toContain('tenant_b Level');
  });
});
