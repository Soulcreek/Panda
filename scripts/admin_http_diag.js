#!/usr/bin/env node
// scripts/admin_http_diag.js
// Fetches admin diagnostic endpoints and writes JSON outputs to tmp/.
// Usage:
//   node scripts/admin_http_diag.js --host=https://your-host [--cookie="session=..."] [--outDir=tmp]

const fs = require('fs');
const path = require('path');

function parseArgs(){
  const out = { outDir: 'tmp' };
  for(const a of process.argv.slice(2)){
    const m = a.match(/^--([^=]+)=(.*)$/);
    if(m){ out[m[1]] = m[2]; }
  }
  return out;
}

async function getFetch(){
  if(typeof fetch !== 'undefined') return fetch;
  const mod = await import('node-fetch');
  return mod.default;
}

(async function(){
  const { host, cookie, outDir } = parseArgs();
  if(!host){ console.error('Missing --host=https://your-host'); process.exit(2); }
  const base = host.replace(/\/$/, '');
  if(!fs.existsSync(outDir)) fs.mkdirSync(outDir,{ recursive:true });
  const endpoints = [
    { path: '/admin/tools/diag', name: 'diag' },
    { path: '/admin/tools/uploads', name: 'uploads' },
    { path: '/admin/tools/raw', name: 'raw' },
  ];
  const f = await getFetch();
  for(const ep of endpoints){
    const url = base + ep.path;
    try {
      const res = await f(url, { headers: cookie ? { Cookie: cookie } : undefined });
      const contentType = res.headers.get('content-type')||'';
      let data;
      if(contentType.includes('application/json')){
        data = await res.json();
      } else {
        const text = await res.text();
        try { data = JSON.parse(text); } catch { data = { text } }
      }
      fs.writeFileSync(path.join(outDir, ep.name + '.json'), JSON.stringify(data,null,2),'utf8');
      console.log('Saved', path.join(outDir, ep.name + '.json'));
    } catch(e){
      const errObj = { error: e.message };
      fs.writeFileSync(path.join(outDir, ep.name + '_error.json'), JSON.stringify(errObj,null,2),'utf8');
      console.warn('Error calling', url, e.message);
    }
  }
  console.log('Done. See', outDir);
})();
