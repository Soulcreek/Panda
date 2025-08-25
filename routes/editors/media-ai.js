const express = require('express');
const router = express.Router();
const { pool, isEditor } = require('./_shared');
const {
  analyzeImage,
  generateAltText,
  extractImageKeywords,
  batchAnalyzeMedia,
} = require('../../lib/aiHelpers');
const fs = require('fs');
const path = require('path');

// AI-Enhanced Media Analysis
router.post('/api/media/analyze/:id', isEditor, async (req, res) => {
  try {
    const mediaId = req.params.id;

    // Get media file info
    const [[media]] = await pool.query(
      'SELECT id, name, path, type FROM media WHERE id = ? AND site_key = ?',
      [mediaId, req.siteKey]
    );

    if (!media) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    // Skip non-image files
    if (!media.type.startsWith('image/')) {
      return res.status(400).json({ error: 'AI analysis only supports image files' });
    }

    // Perform AI analysis
    const imagePath = path.join(__dirname, '../../httpdocs', media.path);
    const analysis = await analyzeImage(imagePath, media.name);

    if (analysis.success) {
      // Store AI analysis results
      await pool.query(
        `
                UPDATE media SET 
                    ai_alt_text = ?, 
                    ai_tags = ?, 
                    ai_keywords = ?, 
                    ai_confidence = ?, 
                    ai_processed_at = NOW()
                WHERE id = ? AND site_key = ?
            `,
        [
          analysis.data.alt_text || '',
          JSON.stringify(analysis.data.tags || []),
          analysis.data.keywords || '',
          analysis.data.confidence || 0,
          mediaId,
          req.siteKey,
        ]
      );

      res.json({
        success: true,
        mediaId,
        analysis: analysis.data,
      });
    } else {
      res.status(500).json({
        success: false,
        error: analysis.error,
        mediaId,
      });
    }
  } catch (error) {
    console.error('[MEDIA AI] Analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'AI analysis failed',
      detail: error.message,
    });
  }
});

// Generate Alt Text for specific media
router.post('/api/media/generate-alt/:id', isEditor, async (req, res) => {
  try {
    const mediaId = req.params.id;

    const [[media]] = await pool.query(
      'SELECT id, name, path, type, alt_text FROM media WHERE id = ? AND site_key = ?',
      [mediaId, req.siteKey]
    );

    if (!media || !media.type.startsWith('image/')) {
      return res.status(400).json({ error: 'Invalid media file for alt text generation' });
    }

    const imagePath = path.join(__dirname, '../../httpdocs', media.path);
    const result = await generateAltText(imagePath, media.name, media.alt_text);

    if (result.success) {
      // Update the media record with AI-generated alt text
      await pool.query(
        'UPDATE media SET ai_alt_text = ?, ai_processed_at = NOW() WHERE id = ? AND site_key = ?',
        [result.alt_text, mediaId, req.siteKey]
      );

      res.json({
        success: true,
        mediaId,
        alt_text: result.alt_text,
        confidence: result.confidence,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        fallback_alt: result.alt_text,
      });
    }
  } catch (error) {
    console.error('[MEDIA AI] Alt text generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Alt text generation failed',
      detail: error.message,
    });
  }
});

// Batch analyze multiple media files
router.post('/api/media/batch-analyze', isEditor, async (req, res) => {
  try {
    const { mediaIds } = req.body;

    if (!Array.isArray(mediaIds) || mediaIds.length === 0) {
      return res.status(400).json({ error: 'Invalid media IDs provided' });
    }

    // Limit batch size to prevent timeouts
    const maxBatch = 10;
    const limitedIds = mediaIds.slice(0, maxBatch);

    // Get media files
    const [mediaFiles] = await pool.query(
      `
            SELECT id, name, path, type 
            FROM media 
            WHERE id IN (${limitedIds.map(() => '?').join(',')}) 
                AND site_key = ? 
                AND type LIKE 'image/%'
        `,
      [...limitedIds, req.siteKey]
    );

    if (mediaFiles.length === 0) {
      return res.status(400).json({ error: 'No valid image files found' });
    }

    // Perform batch analysis
    const results = await batchAnalyzeMedia(mediaFiles);

    // Update database with results
    const updatePromises = results.map((result) => {
      if (result.analysis.success) {
        return pool.query(
          `
                    UPDATE media SET 
                        ai_alt_text = ?, 
                        ai_tags = ?, 
                        ai_keywords = ?, 
                        ai_confidence = ?, 
                        ai_processed_at = NOW()
                    WHERE id = ? AND site_key = ?
                `,
          [
            result.analysis.data.alt_text || '',
            JSON.stringify(result.analysis.data.tags || []),
            result.analysis.data.keywords || '',
            result.analysis.data.confidence || 0,
            result.id,
            req.siteKey,
          ]
        );
      }
      return Promise.resolve();
    });

    await Promise.all(updatePromises);

    res.json({
      success: true,
      processed: results.length,
      results: results.map((r) => ({
        id: r.id,
        success: r.analysis.success,
        error: r.analysis.error,
      })),
    });
  } catch (error) {
    console.error('[MEDIA AI] Batch analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Batch analysis failed',
      detail: error.message,
    });
  }
});

// Get AI analysis status for media library
router.get('/api/media/ai-status', isEditor, async (req, res) => {
  try {
    const [stats] = await pool.query(
      `
            SELECT 
                COUNT(*) as total_images,
                COUNT(ai_processed_at) as analyzed_images,
                AVG(ai_confidence) as avg_confidence
            FROM media 
            WHERE site_key = ? AND type LIKE 'image/%'
        `,
      [req.siteKey]
    );

    const [recentAnalysis] = await pool.query(
      `
            SELECT id, name, ai_confidence, ai_processed_at
            FROM media 
            WHERE site_key = ? AND ai_processed_at IS NOT NULL
            ORDER BY ai_processed_at DESC 
            LIMIT 5
        `,
      [req.siteKey]
    );

    res.json({
      success: true,
      stats: stats[0] || { total_images: 0, analyzed_images: 0, avg_confidence: 0 },
      recent_analysis: recentAnalysis,
    });
  } catch (error) {
    console.error('[MEDIA AI] Status check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get AI analysis status',
      detail: error.message,
    });
  }
});

// Bulk operations for media management
router.post('/api/media/bulk-update', isEditor, async (req, res) => {
  try {
    const { mediaIds, updates } = req.body;

    if (!Array.isArray(mediaIds) || mediaIds.length === 0) {
      return res.status(400).json({ error: 'No media IDs provided' });
    }

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    // Build dynamic update query
    const allowedFields = [
      'category_id',
      'alt_text',
      'description',
      'seo_alt',
      'seo_description',
      'meta_keywords',
    ];
    const updateFields = [];
    const updateValues = [];

    for (const [field, value] of Object.entries(updates)) {
      if (allowedFields.includes(field)) {
        updateFields.push(`${field} = ?`);
        updateValues.push(value);
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid update fields provided' });
    }

    // Add WHERE clause values
    updateValues.push(...mediaIds);
    updateValues.push(req.siteKey);

    const sql = `
            UPDATE media 
            SET ${updateFields.join(', ')} 
            WHERE id IN (${mediaIds.map(() => '?').join(',')}) 
                AND site_key = ?
        `;

    const [result] = await pool.query(sql, updateValues);

    res.json({
      success: true,
      updated: result.affectedRows,
      mediaIds,
    });
  } catch (error) {
    console.error('[MEDIA] Bulk update error:', error);
    res.status(500).json({
      success: false,
      error: 'Bulk update failed',
      detail: error.message,
    });
  }
});

module.exports = router;
