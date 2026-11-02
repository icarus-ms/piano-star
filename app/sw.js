// 오프라인 캐시: 온라인이면 항상 최신 파일(네트워크 우선), 오프라인이면 캐시 사용
const CACHE = 'piano-star-v1';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/audio.js', 'js/score.js', 'js/game.js',
  'vendor/opensheetmusicdisplay.min.js', 'manifest.webmanifest', 'icons/icon.svg', 'scores/index.json'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request)
    .then((r) => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
