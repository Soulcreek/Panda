const express = require('express');
const pool = require('../../db');
const router = express.Router();

// Panda's Way core page
router.get('/pandas-way', async (req, res) => {
  try {
    const [levels] = await pool.query('SELECT * FROM pandas_way_levels ORDER BY display_order ASC');
    res.render('pandas_way', { title: "Panda's Way", levels });
  } catch (err) {
    console.error("Fehler Panda's Way:", err);
    res.status(500).send('Interner Fehler');
  }
});

// Static alternative preview routes
router.get('/pandas-way-alt1', (req, res) =>
  res.render('pandas_way_alt1', { title: "Panda's Way – ALT 1" })
);
router.get('/pandas-way-alt2', (req, res) =>
  res.render('pandas_way_alt2', { title: "Panda's Way – ALT 2" })
);
router.get('/pandas-way-alt3', (req, res) =>
  res.render('pandas_way_alt3', { title: "Panda's Way – ALT 3" })
);
router.get('/pandas-way-alt4', (req, res) =>
  res.render('pandas_way_alt4', { title: "Panda's Way – ALT 4" })
);

// ALT5 dynamic timeline
router.get('/pandas-way-alt5', async (req, res) => {
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS timeline_entries (id INT AUTO_INCREMENT PRIMARY KEY, site_key VARCHAR(64) NOT NULL, position INT NOT NULL DEFAULT 0, title VARCHAR(255) NOT NULL, phase VARCHAR(100) NULL, content_html MEDIUMTEXT NULL, is_active TINYINT(1) NOT NULL DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX (site_key), INDEX(position)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS timeline_site_config (site_key VARCHAR(64) PRIMARY KEY, level_count INT NOT NULL DEFAULT 3, design_theme VARCHAR(32) NOT NULL DEFAULT 'glass', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS timeline_levels (id INT AUTO_INCREMENT PRIMARY KEY, site_key VARCHAR(64) NOT NULL, level_index INT NOT NULL, title VARCHAR(255) NOT NULL DEFAULT '', content_html MEDIUMTEXT NULL, image_path VARCHAR(255) NULL, UNIQUE KEY uniq_level (site_key, level_index), INDEX(site_key)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
    try {
      await pool.query(
        'ALTER TABLE timeline_entries ADD COLUMN level INT NOT NULL DEFAULT 1 AFTER site_key'
      );
    } catch (_) {}
    let [rows] = await pool.query(
      'SELECT id, position, title, phase, content_html, level FROM timeline_entries WHERE site_key=? AND is_active=1 ORDER BY position ASC, id ASC',
      ['pandas_way_5']
    );
    if (!rows.length) {
      const seed = [
        {
          position: 0,
          level: 1,
          title: 'Bewusstsein',
          phase: 'Initiate',
          html: '<p>Warum Schutz? Stories & Risiken sichtbar machen.</p>',
        },
        {
          position: 1,
          level: 1,
          title: 'Inventar',
          phase: 'Foundation',
          html: '<p>Systeme & Datenquellen katalogisieren.</p>',
        },
        {
          position: 2,
          level: 2,
          title: 'Kontrollen',
          phase: 'Foundation',
          html: '<p>Passwörter, MFA, Verschlüsselung etablieren.</p>',
        },
        {
          position: 3,
          level: 2,
          title: 'Klassifizierung',
          phase: 'Evolve',
          html: '<p>Labels & Schutzprofile definieren.</p>',
        },
        {
          position: 4,
          level: 3,
          title: 'Detektion',
          phase: 'Evolve',
          html: '<p>Logging + Baselines für Anomalien.</p>',
        },
      ];
      for (const s of seed) {
        await pool.query(
          'INSERT INTO timeline_entries (site_key, position, level, title, phase, content_html) VALUES (?,?,?,?,?,?)',
          ['pandas_way_5', s.position, s.level, s.title, s.phase, s.html]
        );
      }
      [rows] = await pool.query(
        'SELECT id, position, title, phase, content_html, level FROM timeline_entries WHERE site_key=? AND is_active=1 ORDER BY position ASC, id ASC',
        ['pandas_way_5']
      );
    }
    let [cfgRows] = await pool.query('SELECT * FROM timeline_site_config WHERE site_key=?', [
      'pandas_way_5',
    ]);
    if (!cfgRows.length) {
      await pool.query(
        'INSERT INTO timeline_site_config (site_key, level_count, design_theme) VALUES (?,?,?)',
        ['pandas_way_5', 3, 'glass']
      );
      [cfgRows] = await pool.query('SELECT * FROM timeline_site_config WHERE site_key=?', [
        'pandas_way_5',
      ]);
    }
    const siteCfg = cfgRows[0];
    for (let i = 1; i <= siteCfg.level_count; i++) {
      const [exists] = await pool.query(
        'SELECT id FROM timeline_levels WHERE site_key=? AND level_index=?',
        ['pandas_way_5', i]
      );
      if (!exists.length) {
        await pool.query(
          'INSERT INTO timeline_levels (site_key, level_index, title) VALUES (?,?,?)',
          ['pandas_way_5', i, 'Level ' + i]
        );
      }
    }
    const [levelRows] = await pool.query(
      'SELECT level_index, title, image_path, icon FROM timeline_levels WHERE site_key=? ORDER BY level_index ASC',
      ['pandas_way_5']
    );
    res.render('pandas_way_alt5', {
      title: "Panda's Way – ALT 5",
      entries: rows,
      timelineSiteConfig: siteCfg,
      timelineLevels: levelRows,
    });
  } catch (e) {
    console.error('Fehler ALT5:', e);
    res.status(500).render('partials/error_500', { title: 'Fehler', error: e });
  }
});

module.exports = router;
