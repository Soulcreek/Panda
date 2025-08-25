const express = require('express');
const router = express.Router();
const { pool, isEditor } = require('./_shared');
const fs = require('fs');
const path = require('path');
const { generateThumbnail } = require('../../lib/thumbnail');
const multer = require('multer');
const { validateUploadedFile } = require('../../lib/uploadValidation');

// Helper: fetch categories
async function fetchCategories(siteKey) {
  try {
    const [cats] = await pool.query(
      'SELECT slug,label FROM media_categories WHERE site_key=? ORDER BY label ASC',
      [siteKey]
    );
    return cats;
  } catch (e) {
    return [];
  }
}

// Medienbibliothek
router.get('/media', isEditor, async (req, res) => {
  try {
    console.log('[MEDIA] Loading media library for site:', req.siteKey);
    try {
      await pool.query(
        'ALTER TABLE media ADD COLUMN site_key VARCHAR(64) NOT NULL DEFAULT "default", ADD INDEX idx_media_site (site_key)'
      );
    } catch (_) {}
    try {
      await pool.query(
        'ALTER TABLE media_categories ADD COLUMN site_key VARCHAR(64) NOT NULL DEFAULT "default", ADD INDEX idx_media_cat_site (site_key)'
      );
    } catch (_) {}
    const [rows] = await pool.query(
      'SELECT m.id,m.name,m.path,m.type,m.alt_text,m.description,m.seo_alt,m.seo_description,m.meta_keywords,m.uploaded_at,m.category_id, mc.label AS category_label FROM media m LEFT JOIN media_categories mc ON m.category_id=mc.id AND mc.site_key=? WHERE m.site_key=? ORDER BY m.uploaded_at DESC',
      [req.siteKey, req.siteKey]
    );
    const cats = await fetchCategories(req.siteKey);
    console.log('[MEDIA] Found', rows.length, 'media files and', cats.length, 'categories');
    res.render('editors_media_library', { title: 'Medien', files: rows, mediaCategories: cats });
  } catch (e) {
    console.error('[MEDIA] Error loading media library:', e);
    res.status(500).send('Medien Fehler: ' + e.message);
  }
});
router.get('/media/edit/:id', isEditor, async (req, res) => {
  try {
    const [[file]] = await pool.query(
      'SELECT m.id,m.name,m.path,m.type,m.alt_text,m.description,m.seo_alt,m.seo_description,m.meta_keywords,m.category_id, mc.label AS category_label FROM media m LEFT JOIN media_categories mc ON m.category_id=mc.id AND mc.site_key=? WHERE m.id=? AND m.site_key=?',
      [req.siteKey, req.params.id, req.siteKey]
    );
    if (!file) return res.status(404).send('Nicht gefunden');
    res.render('editors_edit_media', { title: 'Medien bearbeiten', file });
  } catch (e) {
    res.status(500).send('Medien Edit Fehler');
  }
});
router.post('/media/edit/:id', isEditor, async (req, res) => {
  const { name, alt_text, description, seo_alt, seo_description, meta_keywords, category } =
    req.body;
  try {
    let catSlug = category || null;
    let catId = null;
    if (catSlug) {
      try {
        const [c] = await pool.query(
          'SELECT id,slug FROM media_categories WHERE (slug=? OR label=?) AND site_key=? LIMIT 1',
          [catSlug, catSlug, req.siteKey]
        );
        if (c.length) {
          catId = c[0].id;
          catSlug = c[0].slug || catSlug;
        } else {
          return res.status(400).send('Ungültige Kategorie');
        }
      } catch (_) {}
    }
    await pool.query(
      'UPDATE media SET name=?, alt_text=?, description=?, seo_alt=?, seo_description=?, meta_keywords=?, category_id=? WHERE id=? AND site_key=?',
      [
        name,
        alt_text,
        description,
        seo_alt,
        seo_description,
        meta_keywords,
        catId,
        req.params.id,
        req.siteKey,
      ]
    );
    res.redirect('/editors/media');
  } catch (e) {
    res.status(500).send('Medien Update Fehler');
  }
});

// Media API
router.get('/api/media', isEditor, async (req, res) => {
  try {
    const { category, type } = req.query;
    let sql =
      'SELECT m.id,m.name,m.path,m.type,m.alt_text,m.description,m.category_id,m.uploaded_at, mc.label AS category_label FROM media m LEFT JOIN media_categories mc ON m.category_id=mc.id AND mc.site_key=? WHERE m.site_key=?';
    const cond = [];
    const vals = [req.siteKey, req.siteKey];
    if (category) {
      cond.push('mc.slug=?');
      vals.push(category);
    }
    if (type) {
      cond.push('m.type LIKE ?');
      vals.push(type + '%');
    }
    if (cond.length) sql += ' AND ' + cond.join(' AND ');
    sql += ' ORDER BY m.uploaded_at DESC LIMIT 500';
    const [rows] = await pool.query(sql, vals);
    res.json(rows);
  } catch (e) {
    res.apiError(500, { error: 'Media Liste Fehler', code: 'MEDIA_LIST', detail: e.message });
  }
});

// Media Categories API (site-scoped)
router.get('/api/media-categories', isEditor, async (req, res) => {
  try {
    try {
      await pool.query(
        'ALTER TABLE media_categories ADD COLUMN site_key VARCHAR(64) NOT NULL DEFAULT "default", ADD INDEX idx_media_cat_site (site_key)'
      );
    } catch (_) {}
    const [cats] = await pool.query(
      'SELECT slug,label FROM media_categories WHERE site_key=? ORDER BY label ASC',
      [req.siteKey]
    );
    res.json({ categories: cats });
  } catch (e) {
    res.apiError(500, {
      error: 'Media Kategorien Fehler',
      code: 'MEDIA_CAT_LIST',
      detail: e.message,
    });
  }
});
router.post('/api/media-categories', isEditor, async (req, res) => {
  try {
    const label = ((req.body && req.body.label) || '').trim();
    if (!label) return res.apiError(400, { error: 'Label fehlt', code: 'CAT_LABEL_REQUIRED' });
    // ensure table/columns
    try {
      await pool.query(
        'CREATE TABLE IF NOT EXISTS media_categories (id INT AUTO_INCREMENT PRIMARY KEY, slug VARCHAR(190) NOT NULL, label VARCHAR(190) NOT NULL, site_key VARCHAR(64) NOT NULL DEFAULT "default", UNIQUE KEY uq_site_slug (site_key, slug)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
      );
    } catch (_) {}
    // slugify
    const slug =
      label
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 190) || 'cat';
    // upsert per site
    await pool.query(
      'INSERT INTO media_categories (slug,label,site_key) VALUES (?,?,?) ON DUPLICATE KEY UPDATE label=VALUES(label)',
      [slug, label, req.siteKey]
    );
    const [cats] = await pool.query(
      'SELECT slug,label FROM media_categories WHERE site_key=? ORDER BY label ASC',
      [req.siteKey]
    );
    res.json({ ok: true, categories: cats });
  } catch (e) {
    res.apiError(500, {
      error: 'Media Kategorie speichern fehlgeschlagen',
      code: 'MEDIA_CAT_SAVE',
      detail: e.message,
    });
  }
});

// Uploads
const uploadDir = path.join(__dirname, '..', '..', 'httpdocs', 'uploads');
try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch (_) {}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + ext);
  },
});
// Increase limit to align with validation config (8MB) but still protect server
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

router.post('/api/upload-inline-image', isEditor, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.apiError(400, { error: 'Datei fehlt', code: 'NO_FILE' });
    const problems = await validateUploadedFile(req.file);
    if (problems.length) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (_) {}
      return res.apiError(400, {
        error: 'Upload Validierung fehlgeschlagen',
        code: 'UPLOAD_INVALID',
        detail: problems.join('; '),
      });
    }
    const filename = req.file.filename;
    const relPath = '/uploads/' + filename;
    try {
      await pool.query(
        'INSERT INTO media (name,path,type,alt_text,description,category_id,site_key) VALUES (?,?,?,?,?,?,?)',
        [filename, relPath, req.file.mimetype, '', '', null, req.siteKey]
      );
    } catch (_) {}
    // generate thumbnail for immediate availability
    try {
      await generateThumbnail(req.file.path, filename);
    } catch (_) {}
    res.json({ path: relPath, name: filename });
  } catch (e) {
    res.apiError(500, { error: 'Upload fehlgeschlagen', code: 'UPLOAD_FAIL', detail: e.message });
  }
});
router.post('/upload', isEditor, upload.array('mediaFiles', 25), async (req, res) => {
  try {
    if (!req.files || !req.files.length) return res.redirect('/editors/media');
    const { base_name, alt_text, description, category } = req.body;
    for (const f of req.files) {
      const problems = await validateUploadedFile(f);
      if (problems.length) {
        try {
          fs.unlinkSync(f.path);
        } catch (_) {}
        continue; // silently skip invalid file; could collect and flash later
      }
      let storedName = f.filename;
      if (base_name) {
        const ext = path.extname(f.originalname).toLowerCase();
        const baseSafe = base_name.replace(/[^a-zA-Z0-9_-]+/g, '-');
        const seq = req.files.length > 1 ? '-' + (req.files.indexOf(f) + 1) : '';
        const newName = Date.now() + '-' + baseSafe + seq + ext;
        try {
          fs.renameSync(path.join(uploadDir, storedName), path.join(uploadDir, newName));
          storedName = newName;
        } catch (_) {}
      }
      const relPath = '/uploads/' + storedName;
      // Validate category existence (best-effort)
      let catVal = category || null;
      if (catVal) {
        try {
          const [c] = await pool.query(
            'SELECT 1 FROM media_categories WHERE (slug=? OR label=?) AND site_key=? LIMIT 1',
            [catVal, catVal, req.siteKey]
          );
          if (!c.length) catVal = null;
        } catch (_) {
          catVal = null;
        }
      }
      // Resolve category_id
      let catId = null;
      if (catVal) {
        try {
          const [c] = await pool.query(
            'SELECT id,slug FROM media_categories WHERE (slug=? OR label=?) AND site_key=? LIMIT 1',
            [catVal, catVal, req.siteKey]
          );
          if (c.length) {
            catId = c[0].id;
            catVal = c[0].slug;
          }
        } catch (_) {
          catId = null;
        }
      }
      try {
        await pool.query(
          'INSERT INTO media (name,path,type,alt_text,description,category_id,site_key) VALUES (?,?,?,?,?,?,?)',
          [storedName, relPath, f.mimetype, alt_text || '', description || '', catId, req.siteKey]
        );
      } catch (_) {}
      // generate thumbnail
      try {
        await generateThumbnail(path.join(uploadDir, storedName), storedName);
      } catch (_) {}
    }
    res.redirect('/editors/media');
  } catch (e) {
    res.apiError(500, {
      error: 'Bulk Upload fehlgeschlagen',
      code: 'UPLOAD_BULK_FAIL',
      detail: e.message,
    });
  }
});

module.exports = router;
