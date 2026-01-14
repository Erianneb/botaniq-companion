const CACHE_NAME = 'botaniq-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/client.js',
  '/manifest.json' 
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});