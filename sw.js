/* Treeni-app service worker – caches app shell for offline use */
const CACHE = 'treeni-shell-v32';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './plan.js',
  './exercises.js',
  './garmin.js',
  './progress.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Valmentajan suunnitelma: aina verkosta ensin, välimuisti varalla (offline)
  if (url.origin === self.location.origin && url.pathname.endsWith('/coach-plan.json')) {
    const key = new Request(url.origin + url.pathname);
    event.respondWith(
      fetch(req, { cache: 'no-store' }).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(key, clone));
        }
        return res;
      }).catch(() => caches.match(key).then((hit) => hit || new Response('{"days":[]}', {
        status: 503, headers: { 'Content-Type': 'application/json' }
      })))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req).then((res) => {
        if (res && res.ok && new URL(req.url).origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
