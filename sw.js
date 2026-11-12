// Sonnenplan · Service Worker: macht die Web-App installierbar.
// Immer zuerst aus dem Netz laden (damit jede neue Version sofort da ist); nur ohne Netz die zuletzt geladene App-Seite zeigen.
// Daten (Supabase), KI und Bibliotheken gehen immer direkt ans Netz und werden nicht zwischengespeichert.
// v2: Die App-Seite wird beim Server immer neu nachgefragt (cache: 'no-cache' → bei unveränderter Datei nur eine kurze 304-Antwort).
//     Vorher konnte der Browser-Zwischenspeicher von GitHub Pages (bis 10 Minuten) nach einer Veröffentlichung noch die alte Seite liefern.
//     Die App besteht aus EINER Datei (index.html) – alte und neue Programmteile können sich daher nicht mischen.
const CACHE = 'sonnenplan-shell-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  // nur eigene, alte App-Zwischenspeicher entfernen – Anmeldung, Einstellungen und lokale Daten bleiben unberührt
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('sonnenplan-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // Supabase, KI, CDN: nicht anfassen
  const page = req.mode === 'navigate' || /\.html?$/.test(url.pathname) || url.pathname.endsWith('/');
  e.respondWith(
    fetch(page ? new Request(req, { cache: 'no-cache' }) : req).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
