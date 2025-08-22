const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(process.cwd(),'httpdocs','uploads');
const thumbsDir = path.join(uploadsDir,'thumbnails');
const placeholder = path.join(uploadsDir,'placeholders','placeholder.svg');

function ensureThumbDir(){ if(!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir,{ recursive:true }); }

async function generateThumbnail(srcPath, filename){
  ensureThumbDir();
  const dst = path.join(thumbsDir, filename);
  try {
    const sharp = require('sharp');
    await sharp(srcPath).resize(320,240,{ fit:'cover' }).toFile(dst);
    return dst;
  } catch(e){
    // sharp not available or failed — fallback
    try {
      const st = fs.statSync(srcPath);
      if(st.size < 1024*1024){ // copy small files
        fs.copyFileSync(srcPath,dst);
        return dst;
      }
    } catch(_){ }
    // final fallback: copy placeholder if exists
    try { fs.copyFileSync(placeholder,dst); return dst; } catch(_){ return null; }
  }
}

module.exports = { generateThumbnail };
