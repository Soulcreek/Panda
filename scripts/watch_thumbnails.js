#!/usr/bin/env node
// scripts/watch_thumbnails.js
// Watch `httpdocs/uploads` for new/changed images and generate thumbnails under `httpdocs/uploads/thumbnails`.
// If run with `--once` it will scan existing files, create missing thumbs, and exit.

const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(process.cwd(),'httpdocs','uploads');
const thumbsDir = path.join(uploadsDir,'thumbnails');
const placeholder = path.join(uploadsDir,'placeholders','placeholder.svg');

function isImage(n){ return /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(n); }

async function ensureThumbFor(file, sharp){
  const src = path.join(uploadsDir,file);
  const dst = path.join(thumbsDir,file);
  try {
    if(!fs.existsSync(src)) return; // deleted or not a file
    const st = fs.statSync(src);
    if(!st.isFile()) return;
    if(!isImage(file)) return;
    if(!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir,{ recursive:true });
    if(fs.existsSync(dst)){
      const dstSt = fs.statSync(dst);
      if(dstSt.mtimeMs >= st.mtimeMs) return; // up-to-date
    }

    if(sharp){
      await sharp(src).resize(320,240,{ fit:'cover' }).toFile(dst);
      console.log('thumb created', file);
    } else {
      if(st.size < 1024*1024){
        fs.copyFileSync(src,dst);
        console.log('copied as thumb', file);
      } else {
        fs.copyFileSync(placeholder,dst);
        console.log('placeholder used for', file);
      }
    }
  } catch(e){
    console.warn('thumb failed for', file, e.message);
    try { fs.copyFileSync(placeholder,dst); } catch(_){ }
  }
}

async function runOnce(){
  try {
    if(!fs.existsSync(uploadsDir)){ console.error('uploads dir not found:', uploadsDir); process.exit(1); }
    const files = fs.readdirSync(uploadsDir).filter(n=> isImage(n) );
    let sharpMod = null;
    try { sharpMod = require('sharp'); } catch(e){ sharpMod = null; }
    for(const f of files){ await ensureThumbFor(f, sharpMod); }
    console.log('one-shot done');
  } catch(e){ console.error('fatal:', e.message); process.exit(1); }
}

function watch(){
  let sharpMod = null;
  try { sharpMod = require('sharp'); console.log('using sharp for thumbnails'); } catch(e){ sharpMod = null; console.log('sharp not found, will fallback to copy/placeholder'); }

  if(!fs.existsSync(uploadsDir)){
    console.error('uploads dir not found:', uploadsDir);
    process.exit(1);
  }
  if(!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir,{ recursive:true });

  const pending = new Map();
  function schedule(file){
    if(!isImage(file)) return;
    pending.set(file, Date.now());
  }

  setInterval(async ()=>{
    const now = Date.now();
    for(const [file, ts] of Array.from(pending.entries())){
      if(now - ts > 200){ // debounce 200ms
        pending.delete(file);
        await ensureThumbFor(file, sharpMod);
      }
    }
  }, 250);

  fs.watch(uploadsDir, { persistent: true }, (evt, file) => {
    if(!file) return;
    // ignore thumbnails folder events
    if(file.startsWith('thumbnails') || file.startsWith('placeholders')) return;
    schedule(file);
  });

  console.log('watching', uploadsDir);
}

(async function(){
  const args = process.argv.slice(2);
  if(args.includes('--once')){
    await runOnce();
    process.exit(0);
  }
  await runOnce();
  watch();
})();
