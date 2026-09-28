/* AutoList AI service worker — makes the site installable as an app. Network-first: pages and data are always live;
 * only a tiny offline page is cached so the installed app shows a friendly message without internet. */
const CACHE = "al-shell-v1";
const OFFLINE = "/offline.html";
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/logo-mark.svg"])).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;            // everything else goes straight to the network
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
