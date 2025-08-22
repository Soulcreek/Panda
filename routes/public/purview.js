const express = require('express');
const pool = require('../../db');
const router = express.Router();

// Public Purview knowledge page (informational)
router.get('/purview', async (req,res)=>{
  try {
    // Get cached aggregates for KPI display
    const [aggregates] = await pool.query('SELECT payload, generated_at FROM purview_aggregates ORDER BY generated_at DESC LIMIT 1');
    let data = {};
    
    if (aggregates.length) {
      try {
        data = JSON.parse(aggregates[0].payload);
        data.last_updated = aggregates[0].generated_at;
      } catch (e) {
        console.warn('[PURVIEW] Failed to parse aggregates:', e.message);
      }
    }
    
    // Fallback: get fresh counts if no aggregates exist
    if (!data.counts) {
      try {
        const [postCount] = await pool.query(`SELECT COUNT(*) as count FROM posts WHERE status='published' AND is_deleted=0`);
        const [mediaCount] = await pool.query(`SELECT COUNT(*) as count FROM media WHERE 1=1`);
        const [podcastCount] = await pool.query(`SELECT COUNT(*) as count FROM podcasts WHERE 1=1`);
        
        data.counts = {
          posts: postCount[0]?.count || 0,
          media: mediaCount[0]?.count || 0,
          podcasts: podcastCount[0]?.count || 0
        };
        data.last_updated = new Date().toISOString();
      } catch (e) {
        console.warn('[PURVIEW] Failed to get fallback counts:', e.message);
        data.counts = { posts: 0, media: 0, podcasts: 0 };
      }
    }
    
    res.render('public_purview', { 
      title: 'Microsoft Purview – Knowledge Center',
      data: data 
    });
  } catch(e){
    console.error('Render purview error', e);
    res.status(500).render('public_purview', { 
      title: 'Microsoft Purview – Knowledge Center',
      data: { counts: { posts: 0, media: 0, podcasts: 0 } },
      error: 'Unable to load data at this time' 
    });
  }
});

// Purview Glossary
router.get('/purview/glossary', (req, res) => {
  const glossary = [
    {
      term: 'Data Catalog',
      definition: 'A centralized repository that contains metadata about your data assets, making them discoverable and understandable.'
    },
    {
      term: 'Data Classification',
      definition: 'The process of organizing data by relevant categories so that it can be used and protected more efficiently.'
    },
    {
      term: 'Data Lineage', 
      definition: 'The tracking of data flow from its origin to destination, including all transformations along the way.'
    },
    {
      term: 'Sensitivity Labels',
      definition: 'Tags that classify and protect your organization\'s data based on its sensitivity level.'
    },
    {
      term: 'Data Governance',
      definition: 'The overall management of data availability, usability, integrity, and security in an organization.'
    }
  ];
  
  res.render('public_purview_glossary', { 
    title: 'Microsoft Purview Glossary',
    glossary: glossary 
  });
});

// Purview FAQ
router.get('/purview/faq', (req, res) => {
  const faqs = [
    {
      question: 'What is Microsoft Purview?',
      answer: 'Microsoft Purview is a comprehensive data governance solution that helps organizations discover, classify, and protect their data across on-premises, cloud, and hybrid environments.'
    },
    {
      question: 'How does it help with compliance?',
      answer: 'Purview provides automated data discovery, classification, and policy enforcement to help meet regulatory requirements like GDPR, HIPAA, and industry standards.'
    },
    {
      question: 'Can I see what data we have?',
      answer: 'Yes, the data catalog provides a searchable inventory of your data assets with metadata, schema information, and usage patterns.'
    },
    {
      question: 'How do I tag content for better discoverability?',
      answer: 'Use the media library and content editor to add descriptive tags, categories, and metadata that align with your organization\'s taxonomy.'
    }
  ];
  
  res.render('public_purview_faq', { 
    title: 'Microsoft Purview FAQ',
    faqs: faqs 
  });
});

// Lightweight public API that serves cached aggregates (populated by scheduled job)
router.get('/api/public/purview', async (req,res)=>{
  try {
    const [rows] = await pool.query('SELECT payload, generated_at FROM purview_aggregates ORDER BY generated_at DESC LIMIT 1');
    if(rows && rows[0]) return res.json({ ok:true, data: rows[0].payload, generated_at: rows[0].generated_at });
    // fallback sample response when no aggregates exist
    const sample = { counts: { posts: 0, podcasts: 0, media: 0 }, last_run: null, notes: 'No aggregates available yet' };
    return res.json({ ok:true, data: sample, generated_at: null });
  } catch(e){
    console.error('Purview API error', e);
    return res.status(500).json({ ok:false, error: e.message });
  }
});

module.exports = router;
