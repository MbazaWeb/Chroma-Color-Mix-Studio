const CACHE_NAME = 'chroma-shell-v3';
const APP_FILES = [
  '/',
  '/index.html',
  '/assets/css/index.css',
  '/assets/js/index.js',
  '/assets/js/color-utils.js',
  '/manifest.webmanifest',
  '/assets/icons/favicon.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('chroma-shell-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (!response.ok) return response;

          return caches.open(CACHE_NAME)
            .then(cache => cache.put('/index.html', response.clone()))
            .then(() => response, error => {
              console.error('Unable to cache the app page.', error);
              return response;
            });
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        if (!response.ok || response.type !== 'basic') return response;

        return caches.open(CACHE_NAME)
          .then(cache => cache.put(request, response.clone()))
          .then(() => response, error => {
            console.error('Unable to cache an app resource.', error);
            return response;
          });
      })
      .catch(() => caches.match(request))
  );
});
