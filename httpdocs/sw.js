/* Purview Panda Service Worker (Progressive Enhancement)
 * Caches static assets + blog list + blog post JSON + media thumbnails.
 * Strategy:
 *  - Precache core shell on install
 *  - Network-first for HTML navigations (fallback to cache/offline)
 *  - Stale-while-revalidate for API + images
 */

const VERSION = 'pp-sw-v1';
const CORE_CACHE = VERSION + '-core';
const RUNTIME_CACHE = VERSION + '-rt';
const CORE_ASSETS = [
  '/',
  '/css/style.css',
  '/img/logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE).then(cache => cache.addAll(CORE_ASSETS)).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(()=>self.clients.claim())
  );
});

function isHtmlRequest(req){ return req.mode === 'navigate' || (req.headers.get('accept')||'').includes('text/html'); }
function isApiRequest(url){ return url.pathname.startsWith('/api/'); }
function isImage(url){ return /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(url.pathname); }

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only same-origin
  if(url.origin !== location.origin) return;

  if(isHtmlRequest(req)){
    // Network first
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(()=>caches.match(req).then(cached => cached || caches.match('/offline.html')))
    );
    return;
  }

  if(isApiRequest(url) || isImage(url)){
    // Stale-while-revalidate
    event.respondWith(
      caches.match(req).then(cached => {
        const networkPromise = fetch(req).then(res => {
          if(res && res.status === 200){
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
          }
          return res;
        }).catch(()=>cached);
        return cached || networkPromise;
      })
    );
    return;
  }

  // Default: try cache then network
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});
