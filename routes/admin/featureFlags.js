const express = require('express');
const router = express.Router();
const pool = require('../../db');
const { isAdmin } = require('../../lib/auth');
const { ensureTable, listFlags, upsertFlag, deleteFlag, recentAudit } = require('../../lib/featureFlags');

// Basic page
router.get('/feature-flags', isAdmin, async (req,res)=>{
  await ensureTable();
  const flags = await listFlags(req.siteKey);
  res.render('admin_feature_flags', { title:'Feature Flags', flags });
});

// API list
router.get('/api/feature-flags', isAdmin, async (req,res)=>{
  const flags = await listFlags(req.siteKey);
  res.json({ flags });
});

// Audit list
router.get('/api/feature-flags/audit', isAdmin, async (req,res)=>{
  const audit = await recentAudit(req.siteKey, 50);
  res.json({ audit });
});

// Create / Update
router.post('/api/feature-flags', isAdmin, async (req,res)=>{
  const { flag_key, enabled, variant, description } = req.body;
  if(!flag_key || !flag_key.trim()) return res.apiError(400,{ error:'flag_key fehlt', code:'FLAG_KEY_MISSING' });
  const key = flag_key.trim().toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,100);
  const ok = await upsertFlag(req.siteKey, key, enabled==='1' || enabled===1 || enabled===true, variant?variant.trim().slice(0,64):null, description?description.trim().slice(0,255):null);
  if(!ok) return res.apiError(500,{ error:'Speichern fehlgeschlagen', code:'FLAG_UPSERT_FAIL' });
  const flags = await listFlags(req.siteKey);
  res.apiOk({ flags });
});

// Delete
router.post('/api/feature-flags/delete', isAdmin, async (req,res)=>{
  const { flag_key } = req.body;
  if(!flag_key) return res.apiError(400,{ error:'flag_key fehlt', code:'FLAG_KEY_MISSING' });
  await deleteFlag(req.siteKey, flag_key);
  const flags = await listFlags(req.siteKey);
  res.apiOk({ flags });
});

module.exports = router;
