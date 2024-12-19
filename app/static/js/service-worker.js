const CACHE_NAME = 'scouting-cache-v1';
const API_CACHE_NAME = 'scouting-api-cache-v1';


// Files to cache for offline access
const FILES_TO_CACHE = [
  '/',
  '/static/css/global.css',
  '/static/css/lamp.css',
  '/static/css/register.css',
  '/static/js/main.js',
  '/static/js/offline-storage.js',
  // Add other static assets here
];


self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(FILES_TO_CACHE))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) {
    event.respondWith(handleAPIRequest(event.request));
  } else {
    event.respondWith(
      caches.match(event.request)
        .then((response) => response || fetch(request))
    );
  }
});

async function handleAPIRequest(request) {
  // Try to fetch from network first
  try {
    const response = await fetch(request);
    if (response.ok) {
      return response;
    }
  } catch (error) {
    console.log('Network request failed, falling back to cache');
  }

  // If network fails, return cached response
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  // If no cached response, check IndexedDB for pending requests
  return new Response(JSON.stringify({
    error: 'Currently offline',
    offline: true
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
} 


async function syncPendingData() {
  try {
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_REQUIRED'
      });
    });
  } catch (error) {
    console.error('Sync failed:', error);
  }
} 
