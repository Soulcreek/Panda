#!/usr/bin/env node
// scripts/regenerate_thumbnails.js
// Scans httpdocs/uploads for image files and ensures thumbnails exist under httpdocs/uploads/thumbnails
// If `sharp` is available it will generate a 320x240 thumbnail; otherwise it will copy the original or create a placeholder link.

const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(process.cwd(), 'httpdocs', 'uploads');
const thumbsDir = path.join(uploadsDir, 'thumbnails');
const placeholder = path.join(uploadsDir, 'placeholders', 'placeholder.svg');

function isImage(n) {
  return /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(n);
}

(async function () {
  try {
    if (!fs.existsSync(uploadsDir)) {
      console.error('uploads dir not found:', uploadsDir);
      process.exit(1);
    }
    if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });
    const files = fs.readdirSync(uploadsDir).filter((n) => isImage(n));
    if (!files.length) {
      console.log('No image files found in uploads.');
      process.exit(0);
    }

    let hasSharp = false;
    let sharp;
    try {
      sharp = require('sharp');
      hasSharp = true;
    } catch (e) {
      hasSharp = false;
    }

    for (const f of files) {
      const src = path.join(uploadsDir, f);
      const dst = path.join(thumbsDir, f);
      if (fs.existsSync(dst)) {
        continue;
      }
      try {
        if (hasSharp) {
          await sharp(src).resize(320, 240, { fit: 'cover' }).toFile(dst);
          console.log('thumb created', f);
        } else {
          // try to copy small file; otherwise link placeholder
          const st = fs.statSync(src);
          if (st.size < 1024 * 1024) {
            // copy if <1MB
            fs.copyFileSync(src, dst);
            console.log('copied as thumb', f);
          } else {
            fs.copyFileSync(placeholder, dst);
            console.log('placeholder used for', f);
          }
        }
      } catch (e) {
        console.warn('failed on', f, e.message);
        try {
          fs.copyFileSync(placeholder, dst);
        } catch (_) {}
      }
    }
    console.log('done.');
  } catch (e) {
    console.error('fatal:', e.message);
    process.exit(1);
  }
})();
