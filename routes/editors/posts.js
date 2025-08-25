const express = require('express');
const router = express.Router();
const { pool, isEditor, sanitizeWhatsNew } = require('./_shared');

// Stellt sicher, dass alle erwarteten Spalten in der posts Tabelle existieren (für Upgrades von älteren Installationen)
let postsColumnsChecked = false;
async function ensurePostsColumns() {
  if (postsColumnsChecked) return; // einmal pro Lauf
  try {
    const [rows] = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name='posts'"
    );
    const have = new Set(rows.map((r) => r.COLUMN_NAME || r.column_name));
    // benötigte Spalten laut aktuellem Schema (ausser id/created/updated etc.)
    const wanted = [
      ['title_en', 'ADD COLUMN title_en VARCHAR(255) NULL AFTER content'],
      ['content_en', 'ADD COLUMN content_en MEDIUMTEXT NULL AFTER title_en'],
      ['whatsnew', 'ADD COLUMN whatsnew VARCHAR(500) NULL AFTER content_en'],
      ['featured_image_id', 'ADD COLUMN featured_image_id INT NULL AFTER status'],
      ['tags', 'ADD COLUMN tags VARCHAR(500) NULL AFTER published_at'],
      ['seo_title', 'ADD COLUMN seo_title VARCHAR(255) NULL AFTER tags'],
      ['seo_description', 'ADD COLUMN seo_description VARCHAR(255) NULL AFTER seo_title'],
      ['meta_keywords', 'ADD COLUMN meta_keywords VARCHAR(255) NULL AFTER seo_description'],
      ['is_featured', 'ADD COLUMN is_featured TINYINT(1) NOT NULL DEFAULT 0 AFTER meta_keywords'],
      ['is_deleted', 'ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER is_featured'],
    ];
    let altered = false;
    for (const [col, ddl] of wanted) {
      if (!have.has(col)) {
        try {
          await pool.query('ALTER TABLE posts ' + ddl);
          altered = true;
          console.log('[POSTS] Spalte ergänzt:', col);
        } catch (e) {
          console.warn('[POSTS] Konnte Spalte nicht ergänzen', col, e.code);
        }
      }
    }
    // Ensure multi-tenant site_key column + index
    if (!have.has('site_key')) {
      try {
        await pool.query(
          'ALTER TABLE posts ADD COLUMN site_key VARCHAR(64) NOT NULL DEFAULT "default", ADD INDEX idx_posts_site (site_key)'
        );
        console.log('[POSTS] site_key ergänzt');
      } catch (e) {
        console.warn('[POSTS] site_key add fail', e.code);
      }
    } else {
      try {
        await pool.query('ALTER TABLE posts ADD INDEX idx_posts_site (site_key)');
      } catch (_) {}
    }
    // Adjust uniqueness: move from global slug uniqueness to per-site (site_key, slug). Drop old single-column index if exists.
    try {
      await pool.query('ALTER TABLE posts DROP INDEX slug');
    } catch (_) {}
    try {
      await pool.query('ALTER TABLE posts DROP INDEX uq_posts_site_slug');
    } catch (_) {}
    try {
      await pool.query('ALTER TABLE posts ADD UNIQUE INDEX uq_posts_site_slug (site_key, slug)');
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY') console.warn('[POSTS] composite unique add warn', e.code);
    }
    if (altered) console.log('[POSTS] Tabelle posts aktualisiert.');
  } catch (e) {
    console.warn('[POSTS] ensurePostsColumns Fehler', e.code);
  }
  postsColumnsChecked = true;
}

// Revisions-Tabelle sicherstellen
let revisionsTableChecked = false;
async function ensureRevisionsTable() {
  if (revisionsTableChecked) return;
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS post_revisions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      post_id INT NOT NULL,
      slug VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL,
      content MEDIUMTEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_post_rev_post (post_id),
      CONSTRAINT fk_post_rev_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  } catch (e) {
    console.warn('[POSTS] Revisions Tabelle Fehler', e.code);
  }
  revisionsTableChecked = true;
}

router.get('/posts', isEditor, async (req, res) => {
  try {
    const [posts] = await pool.query(
      'SELECT * FROM posts WHERE COALESCE(is_deleted,0)=0 AND site_key=? ORDER BY updated_at DESC',
      [req.siteKey]
    );
    res.render('editors_posts', { title: 'Beiträge', posts, archived: false });
  } catch (e) {
    res.status(500).send('Posts Fehler');
  }
});
router.get('/posts/new', isEditor, async (req, res) => {
  try {
    const [media] = await pool.query('SELECT * FROM media ORDER BY uploaded_at DESC');
    let tagsList = [],
      mediaCats = [],
      seoPrefix = '';
    try {
      const [catsRows] = await pool.query(
        'SELECT slug FROM media_categories WHERE site_key=? ORDER BY label ASC',
        [req.siteKey]
      );
      if (Array.isArray(catsRows) && catsRows.length) {
        mediaCats = catsRows.map((r) => r.slug);
      }
    } catch (e) {
      /* ignore and fallback below */
    }
    if (!mediaCats.length) {
      try {
        const [cfg] = await pool.query('SELECT prompts FROM ai_config WHERE id=1');
        if (cfg.length && cfg[0].prompts) {
          const p = JSON.parse(cfg[0].prompts || '{}');
          if (p.blog_tags)
            tagsList = p.blog_tags
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 50);
          if (p.media_categories)
            mediaCats = p.media_categories
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 50);
          if (p.seo_title_prefix) seoPrefix = p.seo_title_prefix;
        }
      } catch (_) {}
    }
    res.render('editors_edit_post', {
      title: 'Neuer Beitrag',
      post: null,
      media,
      tagsList,
      mediaCats,
      seoPrefix,
    });
  } catch (e) {
    res.status(500).send('Editor Fehler');
  }
});
router.post('/posts/new', isEditor, async (req, res) => {
  const {
    title,
    content,
    status,
    title_en,
    content_en,
    whatsnew,
    featured_image_id,
    published_at,
    tags,
    seo_title,
    seo_description,
    meta_keywords,
    slug_manual,
  } = req.body;
  if (!title) {
    return res.status(400).send('Titel fehlt');
  }
  await ensurePostsColumns();
  await ensureRevisionsTable();
  function baseSlug(str) {
    return (
      (str || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 190) || 'post'
    );
  }
  async function ensureUniqueSlug(base) {
    let slug = base;
    let i = 2;
    while (true) {
      try {
        const [rows] = await pool.query(
          'SELECT id FROM posts WHERE slug=? AND site_key=? LIMIT 1',
          [slug, req.siteKey]
        );
        if (!rows.length) return slug;
      } catch (e) {
        const [rows] = await pool.query('SELECT id FROM posts WHERE slug=? LIMIT 1', [slug]);
        if (!rows.length) return slug;
      }
      slug = base + '-' + i++;
    }
  }
  const wn = sanitizeWhatsNew(whatsnew);
  try {
    let slug;
    if (slug_manual && slug_manual.trim()) {
      slug = await ensureUniqueSlug(baseSlug(slug_manual));
    } else {
      slug = await ensureUniqueSlug(baseSlug(title));
    }
    const pub = published_at ? published_at.replace('T', ' ') : null;
    await pool.query(
      'INSERT INTO posts (title,slug,content,author_id,status,title_en,content_en,whatsnew,featured_image_id,published_at,tags,seo_title,seo_description,meta_keywords,site_key) VALUES (?,?,?,?, ?,?,?, ?,?,?, ?,?,?,?,?)',
      [
        title,
        slug,
        content || '',
        req.session.userId,
        status || 'draft',
        title_en,
        content_en,
        wn,
        featured_image_id || null,
        pub,
        tags || null,
        seo_title || null,
        seo_description || null,
        meta_keywords || null,
        req.siteKey,
      ]
    );
    res.redirect('/editors/posts');
  } catch (e) {
    console.error('[POSTS][CREATE] Fehler', e.code, e.message);
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).send('Slug bereits vorhanden');
    res.status(500).send('Speichern fehlgeschlagen (' + (e.code || 'DB-Error') + ')');
  }
});
router.get('/posts/edit/:id', isEditor, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT p.*, m.path featured_image_path FROM posts p LEFT JOIN media m ON p.featured_image_id=m.id WHERE p.id=?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).send('Nicht gefunden');
    const [media] = await pool.query('SELECT * FROM media ORDER BY uploaded_at DESC');
    let tagsList = [],
      mediaCats = [],
      seoPrefix = '';
    try {
      const [catsRows] = await pool.query(
        'SELECT slug FROM media_categories WHERE site_key=? ORDER BY label ASC',
        [req.siteKey]
      );
      if (Array.isArray(catsRows) && catsRows.length) {
        mediaCats = catsRows.map((r) => r.slug);
      }
    } catch (e) {}
    if (!mediaCats.length) {
      try {
        const [cfg] = await pool.query('SELECT prompts FROM ai_config WHERE id=1');
        if (cfg.length && cfg[0].prompts) {
          const p = JSON.parse(cfg[0].prompts || '{}');
          if (p.blog_tags)
            tagsList = p.blog_tags
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 50);
          if (p.media_categories)
            mediaCats = p.media_categories
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 50);
          if (p.seo_title_prefix) seoPrefix = p.seo_title_prefix;
        }
      } catch (_) {}
    }
    res.render('editors_edit_post', {
      title: 'Beitrag bearbeiten',
      post: rows[0],
      media,
      tagsList,
      mediaCats,
      seoPrefix,
    });
  } catch (e) {
    res.status(500).send('Editor Fehler');
  }
});
router.post('/posts/edit/:id', isEditor, async (req, res) => {
  const {
    title,
    content,
    status,
    title_en,
    content_en,
    whatsnew,
    featured_image_id,
    published_at,
    tags,
    seo_title,
    seo_description,
    meta_keywords,
    slug_manual,
  } = req.body;
  if (!title) {
    return res.status(400).send('Titel fehlt');
  }
  await ensurePostsColumns();
  await ensureRevisionsTable();
  function baseSlug(str) {
    return (
      (str || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 190) || 'post'
    );
  }
  async function ensureUniqueSlug(base, excludeId) {
    let slug = base;
    let i = 2;
    while (true) {
      try {
        const [rows] = await pool.query(
          'SELECT id FROM posts WHERE slug=? AND id<>? AND site_key=? LIMIT 1',
          [slug, excludeId, req.siteKey]
        );
        if (!rows.length) return slug;
      } catch (e) {
        const [rows] = await pool.query('SELECT id FROM posts WHERE slug=? AND id<>? LIMIT 1', [
          slug,
          excludeId,
        ]);
        if (!rows.length) return slug;
      }
      slug = base + '-' + i++;
    }
  }
  const wn = sanitizeWhatsNew(whatsnew);
  try {
    // Hole aktuelle Post um festzustellen ob Titel sich geändert hat und alter Slug behalten werden kann
    const [currentRows] = await pool.query(
      'SELECT slug,title,content FROM posts WHERE id=? AND site_key=?',
      [req.params.id, req.siteKey]
    );
    if (!currentRows.length) return res.status(404).send('Nicht gefunden');
    // Revision speichern (vor Änderung)
    try {
      await pool.query(
        'INSERT INTO post_revisions (post_id, slug, title, content) VALUES (?,?,?,?)',
        [req.params.id, currentRows[0].slug, currentRows[0].title, currentRows[0].content || '']
      );
    } catch (re) {
      console.warn('[POSTS] Revision Insert Fehler', re.code);
    }
    let slug = currentRows[0].slug;
    const newBase = baseSlug(title);
    if (slug_manual && slug_manual.trim()) {
      slug = await ensureUniqueSlug(baseSlug(slug_manual), req.params.id);
    } else if (!slug.startsWith(newBase)) {
      // Titel signifikant geändert -> neuen slug generieren (Heuristik)
      slug = await ensureUniqueSlug(newBase, req.params.id);
    }
    const pub = published_at ? published_at.replace('T', ' ') : null;
    await pool.query(
      'UPDATE posts SET title=?,slug=?,content=?,status=?,title_en=?,content_en=?,whatsnew=?,featured_image_id=?,published_at=?,tags=?,seo_title=?,seo_description=?,meta_keywords=? WHERE id=? AND site_key=?',
      [
        title,
        slug,
        content || '',
        status || 'draft',
        title_en,
        content_en,
        wn,
        featured_image_id || null,
        pub,
        tags || null,
        seo_title || null,
        seo_description || null,
        meta_keywords || null,
        req.params.id,
        req.siteKey,
      ]
    );
    res.redirect('/editors/posts');
  } catch (e) {
    console.error('[POSTS][UPDATE] Fehler', e.code, e.message);
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).send('Slug bereits vorhanden');
    res.status(500).send('Update fehlgeschlagen (' + (e.code || 'DB-Error') + ')');
  }
});

// Revisionsliste (JSON)
router.get('/posts/:id/revisions', isEditor, async (req, res) => {
  await ensureRevisionsTable();
  try {
    const [rows] = await pool.query(
      'SELECT id, slug, title, created_at FROM post_revisions WHERE post_id=? ORDER BY id DESC LIMIT 100',
      [req.params.id]
    );
    res.json({ revisions: rows });
  } catch (e) {
    res.apiError(500, { error: 'Revisions Fehler', code: 'REV_FETCH', detail: e.message });
  }
});

// Revision wiederherstellen
router.post('/posts/:id/revisions/:revId/restore', isEditor, async (req, res) => {
  await ensureRevisionsTable();
  try {
    const [revRows] = await pool.query(
      'SELECT * FROM post_revisions WHERE id=? AND post_id=? LIMIT 1',
      [req.params.revId, req.params.id]
    );
    if (!revRows.length)
      return res.apiError(404, { error: 'Revision nicht gefunden', code: 'REV_NOT_FOUND' });
    const rev = revRows[0];
    // Speichere aktuellen Stand ebenfalls als Revision (Chain)
    try {
      const [cur] = await pool.query('SELECT slug,title,content FROM posts WHERE id=?', [
        req.params.id,
      ]);
      if (cur.length) {
        await pool.query(
          'INSERT INTO post_revisions (post_id, slug, title, content) VALUES (?,?,?,?)',
          [req.params.id, cur[0].slug, cur[0].title, cur[0].content || '']
        );
      }
    } catch (_) {}
    await pool.query('UPDATE posts SET title=?, slug=?, content=? WHERE id=?', [
      rev.title,
      rev.slug,
      rev.content,
      req.params.id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.apiError(500, { error: 'Restore Fehler', code: 'REV_RESTORE', detail: e.message });
  }
});

module.exports = router;
