#!/usr/bin/env node
// scripts/optimize_assets.js
// Simple asset optimization without heavy build tools
// Minifies CSS and JS files in httpdocs/

const fs = require('fs');
const path = require('path');

const assetsDir = path.join(process.cwd(), 'httpdocs');
const cssDir = path.join(assetsDir, 'css');
const jsDir = path.join(assetsDir, 'js');

function minifyCSS(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/;\s*}/g, '}') // Remove trailing semicolons
    .replace(/{\s*/g, '{') // Clean brackets
    .replace(/}\s*/g, '}')
    .replace(/;\s*/g, ';')
    .replace(/,\s*/g, ',')
    .replace(/:\s*/g, ':')
    .trim();
}

function minifyJS(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
    .replace(/\/\/.*$/gm, '') // Remove line comments
    .replace(/\s*\n\s*/g, '\n') // Clean newlines
    .replace(/\s*{\s*/g, '{') // Clean brackets
    .replace(/\s*}\s*/g, '}')
    .replace(/\s*;\s*/g, ';')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*=\s*/g, '=')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .replace(/^\s+|\s+$/gm, '') // Trim lines
    .replace(/\n+/g, '\n') // Collapse empty lines
    .trim();
}

async function processFiles(dir, ext, minifier, label) {
  if (!fs.existsSync(dir)) {
    console.log(`${label} directory not found: ${dir}`);
    return;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith(ext) && !f.endsWith(`.min${ext}`));
  let processed = 0;
  let totalSaved = 0;

  for (const file of files) {
    try {
      const filePath = path.join(dir, file);
      const minPath = path.join(dir, file.replace(ext, `.min${ext}`));
      
      const originalContent = fs.readFileSync(filePath, 'utf8');
      const minifiedContent = minifier(originalContent);
      
      const originalSize = Buffer.byteLength(originalContent, 'utf8');
      const minifiedSize = Buffer.byteLength(minifiedContent, 'utf8');
      const saved = originalSize - minifiedSize;
      
      fs.writeFileSync(minPath, minifiedContent);
      
      console.log(`${label}: ${file} → ${file.replace(ext, `.min${ext}`)} (${saved} bytes saved, ${Math.round(saved/originalSize*100)}%)`);
      processed++;
      totalSaved += saved;
    } catch (e) {
      console.warn(`Failed to process ${file}: ${e.message}`);
    }
  }

  console.log(`${label} optimization: ${processed} files, ${totalSaved} total bytes saved\n`);
}

(async function() {
  console.log('🔧 Starting asset optimization...\n');
  
  try {
    await processFiles(cssDir, '.css', minifyCSS, 'CSS');
    await processFiles(jsDir, '.js', minifyJS, 'JavaScript');
    
    console.log('✅ Asset optimization completed!');
    console.log('💡 Tip: Update HTML templates to use .min.css and .min.js files for production.');
  } catch (e) {
    console.error('❌ Optimization failed:', e.message);
    process.exit(1);
  }
})();
