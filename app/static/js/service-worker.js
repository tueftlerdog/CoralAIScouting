const CACHE_NAME = 'scouting-app-v1';
const STATIC_CACHE_NAME = 'scouting-app-static-v1';
const DYNAMIC_CACHE_NAME = 'scouting-app-dynamic-v1';
const DATA_CACHE_NAME = 'scouting-app-data-v1';
const OFFLINE_QUEUE_NAME = 'offline-scout-queue';

// Core routes that should be available offline
const CORE_ROUTES = [
  '/',
  '/scouting',
  '/scouting/add',
  '/scouting/list'
];

const STATIC_ASSETS = [
  '/static/css/global.css',
  '/static/css/index.css',
  '/static/js/Canvas.js',
  '/static/images/field-2025.png',
  '/static/images/default_profile.png',
  '/static/js/notifications.js',
  '/static/js/offline-storage.js',
  '/static/images/logo.png',
  '/static/images/offline.html'
];

// Import idb from CDN if necessary
self.importScripts('https://cdn.jsdelivr.net/npm/idb@7/build/umd.js');

// Open the IndexedDB database
let dbPromise = idb.openDB('scout-offline-db', 1, {
  upgrade(db) {
    // Create a store for the offline scout data
    if (!db.objectStoreNames.contains('scout-data')) {
      db.createObjectStore('scout-data', { keyPath: 'id', autoIncrement: true });
    }
    // Create a store for tracking pending sync requests
    if (!db.objectStoreNames.contains('sync-queue')) {
      db.createObjectStore('sync-queue', { keyPath: 'id', autoIncrement: true });
    }
  }
});

// Install event - cache core routes and static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE_NAME)
        .then((cache) => cache.addAll(STATIC_ASSETS)),
      caches.open(DYNAMIC_CACHE_NAME)
        .then((cache) => cache.addAll(CORE_ROUTES))
    ])
    .then(() => self.skipWaiting())  // Force the waiting service worker to become the active service worker
  );
});

// Helper function to determine if a request is a navigation request
function isNavigationRequest(request) {
  return request.mode === 'navigate' || 
         (request.method === 'GET' && 
          request.headers.get('accept')?.includes('text/html'));
}

// Helper function to determine if a URL is in the list of core routes
function isCoreRoute(url) {
  const urlPath = new URL(url).pathname;
  return CORE_ROUTES.some(route => urlPath === route || urlPath.startsWith(route + '/'));
}

// Fetch event handler - with improved offline handling
self.addEventListener('fetch', (event) => {
  const {request} = event;
  const url = new URL(request.url);

  // Handle same-origin requests only
  if (url.origin !== self.location.origin) {
    return;
  }

  // Don't cache POST requests
  if (request.method === 'POST') {
    // Handle scouting form submissions
    if (url.pathname.includes('/scouting/add') || url.pathname.includes('/scouting/edit/')) {
      // If offline, store the form data and register for sync
      if (!navigator.onLine) {
        event.respondWith(
          (async () => {
            try {
              // Clone the request to get the form data
              const formData = await request.formData();
              const formDataObj = {};
              
              // Convert FormData to Object
              for (const [key, value] of formData.entries()) {
                formDataObj[key] = value;
              }
              
              // Store in IndexedDB for later sync
              const db = await dbPromise;
              const tx = db.transaction('scout-data', 'readwrite');
              const store = tx.objectStore('scout-data');
              
              // Add timestamp for ordering
              formDataObj.timestamp = Date.now();
              formDataObj.url = request.url;
              await store.add(formDataObj);
              await tx.complete;
              
              // Register for background sync if supported
              if ('sync' in self.registration) {
                await self.registration.sync.register(OFFLINE_QUEUE_NAME);
              }
              
              // Return success response
              return Response.redirect('/scouting?offline=true');
            } catch (error) {
              console.error('Failed to save offline data:', error);
              return Response.redirect('/scouting?error=true');
            }
          })()
        );
        return;
      }
      
      // If online, let the network request happen normally
      return;
    }
  }

  // For navigation requests to HTML pages
  if (isNavigationRequest(request)) {
    event.respondWith(
      // Try network first
      fetch(request)
        .then(response => {
          // Clone the response before caching it
          const responseToCache = response.clone();
          
          caches.open(DYNAMIC_CACHE_NAME)
            .then(cache => {
              cache.put(request, responseToCache);
            });
            
          return response;
        })
        .catch(() => {
          // If network fails, try to get from cache
          return caches.match(request)
            .then(cachedResponse => {
              if (cachedResponse) {
                return cachedResponse;
              }
              
              // If the route is one of our core routes, serve the cached index
              if (isCoreRoute(request.url)) {
                return caches.match('/');
              }
              
              // Otherwise serve the offline page
              return caches.match('/static/images/offline.html');
            });
        })
    );
    return;
  }

  // Handle static assets (cache-first strategy)
  if (STATIC_ASSETS.some(asset => request.url.includes(asset)) || request.url.includes('/static/')) {
    event.respondWith(
      caches.match(request)
        .then(cachedResponse => {
          return cachedResponse || fetch(request)
            .then(response => {
              return caches.open(STATIC_CACHE_NAME)
                .then(cache => {
                  cache.put(request, response.clone());
                  return response;
                });
            })
            .catch(err => {
              console.error('Failed to fetch static asset:', err);
              return new Response('Failed to fetch static asset', { status: 503 });
            });
        })
    );
    return;
  }

  // For API requests and other dynamic content (network-first strategy)
  if (request.method === 'GET') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Only cache successful responses
          if (!response || response.status !== 200) {
            return response;
          }
          
          // Clone the response before caching it
          const responseToCache = response.clone();
          
          caches.open(DYNAMIC_CACHE_NAME)
            .then(cache => {
              cache.put(request, responseToCache);
            });
            
          return response;
        })
        .catch(() => {
          // If network fails, try to get from cache
          return caches.match(request).then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // For API requests, return a JSON with offline indicator
            if (request.url.includes('/api/') || request.headers.get('Accept')?.includes('application/json')) {
              return new Response(JSON.stringify({ 
                offline: true, 
                message: 'You are offline. This data will be available when you reconnect.' 
              }), {
                headers: new Headers({
                  'Content-Type': 'application/json'
                })
              });
            }
            
            return new Response('Network error, unable to fetch resource', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
        })
    );
    return;
  }

  // For other requests (PUT, DELETE), don't cache but still handle offline
  event.respondWith(
    fetch(request).catch(error => {
      console.error('Network error for:', request.url, error);
      
      if (request.headers.get('Accept')?.includes('application/json')) {
        return new Response(JSON.stringify({
          offline: true,
          error: 'You are offline and this operation requires a network connection'
        }), {
          status: 503,
          headers: new Headers({
            'Content-Type': 'application/json'
          })
        });
      }
      
      return new Response('You are offline and this operation requires a network connection', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({
          'Content-Type': 'text/plain'
        })
      });
    })
  );
});

// Background sync handler
self.addEventListener('sync', (event) => {
  if (event.tag === OFFLINE_QUEUE_NAME) {
    event.waitUntil(syncOfflineData());
  }
});

// Function to sync offline data
async function syncOfflineData() {
  try {
    const db = await dbPromise;
    const tx = db.transaction('scout-data', 'readonly');
    const store = tx.objectStore('scout-data');
    
    // Get all offline data
    const offlineData = await store.getAll();
    await tx.complete;
    
    if (offlineData.length === 0) {
      console.log('No offline data to sync');
      return;
    }
    
    // Process each offline data entry
    const successfulSync = [];
    const failedSync = [];
    
    for (const data of offlineData) {
      try {
        // Create form data from stored object
        const formData = new FormData();
        for (const [key, value] of Object.entries(data)) {
          if (key !== 'id' && key !== 'timestamp' && key !== 'url') {
            formData.append(key, value);
          }
        }
        
        // Send to server
        const response = await fetch(data.url, {
          method: 'POST',
          body: formData,
          credentials: 'same-origin'
        });
        
        if (response.ok) {
          successfulSync.push(data.id);
        } else {
          console.error('Failed to sync data:', data.id, response.status);
          failedSync.push(data.id);
        }
      } catch (error) {
        console.error('Error syncing data entry:', data.id, error);
        failedSync.push(data.id);
      }
    }
    
    // Remove successfully synced data
    if (successfulSync.length > 0) {
      const deleteTx = db.transaction('scout-data', 'readwrite');
      const deleteStore = deleteTx.objectStore('scout-data');
      
      for (const id of successfulSync) {
        await deleteStore.delete(id);
      }
      await deleteTx.complete;
      
      // Show notification that data has been synced
      self.registration.showNotification('Scout Data Synced', {
        body: `Successfully synced ${successfulSync.length} scouting entries`,
        icon: '/static/images/logo.png'
      });
      
      // Broadcast a message to any open clients about the sync
      const clients = await self.clients.matchAll();
      for (const client of clients) {
        client.postMessage({
          type: 'SYNC_COMPLETE',
          success: successfulSync.length,
          failed: failedSync.length
        });
      }
    }
    
    return { success: successfulSync.length, failed: failedSync.length };
  } catch (error) {
    console.error('Error in syncOfflineData:', error);
    return { success: 0, failed: -1, error: error.message };
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Clear old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (![STATIC_CACHE_NAME, DYNAMIC_CACHE_NAME, DATA_CACHE_NAME].includes(cacheName)) {
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Claim clients immediately
      self.clients.claim()
    ])
  );
});

// Message handler for communication with the page
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'SYNC_NOW') {
    syncOfflineData()
      .then(result => {
        event.source.postMessage({
          type: 'SYNC_RESULT',
          result
        });
      });
  }
});

// Cache for tracking dismissed notifications
const dismissedNotifications = new Set();

self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Push event received', {
    data: event.data ? 'Has data' : 'No data',
    timestamp: new Date().toISOString()
  });
  
  try {
    if (!event.data) {
      console.warn('[ServiceWorker] Push event has no data');
      return;
    }
    
    // Parse the notification data
    let data;
    try {
      data = event.data.json();
      console.log('[ServiceWorker] Push data received:', {
        data,
        type: typeof data,
        hasTitle: !!data.title,
        hasBody: !!data.body,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[ServiceWorker] Failed to parse push data as JSON:', error);
      const text = event.data.text();
      console.log('[ServiceWorker] Push data as text:', text);
      data = { title: 'New Notification', body: text };
    }

    // Check if this notification has been dismissed
    const notificationId = data.data?.assignment_id || 'general';
    if (dismissedNotifications.has(notificationId)) {
      console.log('[ServiceWorker] Notification was previously dismissed:', notificationId);
      return;
    }
    
    // Show the notification
    const title = data.title || 'New Notification';
    const options = {
      body: data.body || 'You have a new notification',
      icon: '/static/images/logo.png',  // Your app logo
      badge: '/static/images/logo.png',  // Small monochrome version of your logo
      data: {
        ...data.data || {},
        notificationId: notificationId
      },
      actions: data.data?.type === 'new_assignment' ? [
        {
          action: 'view',
          title: 'View Assignment'
        },
        {
          action: 'dismiss',
          title: 'Dismiss'
        }
      ] : [
        {
          action: 'view',
          title: 'View'
        },
        {
          action: 'complete',
          title: 'Marked as Complete'
        },
        {
          action: 'dismiss',
          title: 'Dismiss'
        }
      ],
      vibrate: [100, 50, 100],
      tag: notificationId,
      renotify: false,
      requireInteraction: false,
      timestamp: data.timestamp || Date.now(),
      silent: false,
      dir: 'auto',
      lang: 'en-US',
      badge: '/static/images/badge.png',
      image: '/static/images/logo.png',
      applicationName: 'Castle',
    };
    
    console.log('[ServiceWorker] Showing notification:', { 
      title, 
      options,
      timestamp: new Date().toISOString()
    });
    
    event.waitUntil(
      self.registration.showNotification(title, options)
        .then(() => {
          console.log('[ServiceWorker] Notification shown successfully');
        })
        .catch(error => {
          console.error('[ServiceWorker] Failed to show notification:', error);
        })
    );
  } catch (error) {
    console.error('[ServiceWorker] Error handling push event:', error);
  }
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('Notification click received', event);
  
  const {notificationId} = event.notification.data;
  
  // Close the notification
  event.notification.close();
  
  // Add to dismissed set for ALL actions
  dismissedNotifications.add(notificationId);
  
  // Handle action buttons
  const url = event.notification.data.url || '/team/manage';
  const assignmentId = event.notification.data.assignment_id;
  
  // Default action (clicking the notification body) or View action
  if (!event.action || event.action === 'view') {
    // Open or focus on the application window
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // Check if there's already a window/tab open with the target URL
          for (const client of clientList) {
            if (client.url.includes(url) && 'focus' in client) {
              return client.focus();
            }
          }
          // If no existing window/tab, open a new one
          return clients.openWindow(url);
        })
    );
  } 
  // Complete action - mark the assignment as completed
  else if (event.action === 'complete' && assignmentId) {
    event.waitUntil(
      fetch(`/team/assignments/${assignmentId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'completed' })
      })
      .then(response => {
        if (response.ok) {
          // Show a confirmation notification
          return self.registration.showNotification('Assignment Completed', {
            body: 'The assignment has been marked as completed',
            icon: '/static/images/logo.png',
            tag: 'status-update-' + assignmentId
          });
        } else {
          return self.registration.showNotification('Action Failed', {
            body: 'Could not mark assignment as completed. Please try again.',
            icon: '/static/images/logo.png',
            tag: 'status-update-error-' + assignmentId
          });
        }
      })
      .catch(error => {
        console.error('Error updating status:', error);
        return self.registration.showNotification('Network Error', {
          body: 'Could not connect to the server. Please try again later.',
          icon: '/static/images/logo.png',
          tag: 'network-error'
        });
      })
    );
  }
});
