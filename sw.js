// Ancien service worker de Nokk : il se retire et envoie l'app vers https://nokkapp.fr.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var ks = await caches.keys(); await Promise.all(ks.map(function (k) { return caches.delete(k); }));
    await self.registration.unregister();
    var cs = await self.clients.matchAll({ type: 'window' });
    cs.forEach(function (c) { var u = new URL(c.url); c.navigate('https://nokkapp.fr' + (u.pathname.replace(/^\/nokk/, '') || '/') + u.search + u.hash); });
  })());
});
