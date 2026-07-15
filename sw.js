const CACHE_NAME = 'border-guide-v3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install — cache static assets
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE_NAME; })
            .map(function(k){ return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', function(e){
  // Skip non-GET and cross-origin (flagcdn, github, nominatim)
  if(e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if(url.origin !== self.location.origin) return;

  // Do NOT intercept /api/ calls
  if(url.pathname.startsWith('/api/')) return;

  e.respondWith(
    fetch(e.request)
      .then(function(response){
        // Cache fresh responses
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache){
          cache.put(e.request, clone);
        });
        return response;
      })
      .catch(function(){
        // Offline fallback
        return caches.match(e.request).then(function(cached){
          if (cached) return cached;
          // Only fallback to index.html for HTML navigation requests
          const accept = e.request.headers.get('accept');
          if (accept && accept.includes('text/html')) {
            return caches.match('./index.html');
          }
          return new Response('Not found', { status: 404, statusText: 'Not Found' });
        });
      })
  );
});
