/**
 * IndexedDB utility functions for offline storage
 */

// idb is a tiny library that makes IndexedDB usable
// https://github.com/jakearchibald/idb
const idbScript = document.createElement('script');
idbScript.src = 'https://cdn.jsdelivr.net/npm/idb@7/build/umd.js';
document.head.appendChild(idbScript);

// Track offline status globally
let isOffline = !navigator.onLine;
let pendingEntries = 0;
let offlineInitialized = false;

// Wait for idb to load
const idbReady = new Promise((resolve) => {
  if (window.idb) {
    resolve(window.idb);
  } else {
    idbScript.onload = () => resolve(window.idb);
  }
});

// Open connection to the database
const dbPromise = idbReady.then(() => 
  idb.openDB('scout-offline-db', 1, {
    upgrade(db) {
      // Create a store for offline scout data
      if (!db.objectStoreNames.contains('scout-data')) {
        db.createObjectStore('scout-data', { keyPath: 'id', autoIncrement: true });
      }
      
      // Create a store for tracking sync status
      if (!db.objectStoreNames.contains('sync-status')) {
        db.createObjectStore('sync-status', { keyPath: 'id' });
      }
    }
  })
);

/**
 * Store scouting data when offline
 * @param {FormData} formData - The form data to store
 * @param {string} url - The submission URL
 * @returns {Promise<number>} - ID of the stored entry
 */
async function storeScoutingData(formData, url) {
  // Convert FormData to a plain object
  const data = {};
  formData.forEach((value, key) => {
    data[key] = value;
  });
  
  // Add metadata
  data.timestamp = Date.now();
  data.url = url;
  data.synced = false;
  
  // Store in IndexedDB
  const db = await dbPromise;
  const tx = db.transaction('scout-data', 'readwrite');
  const store = tx.objectStore('scout-data');
  const id = await store.add(data);
  await tx.complete;
  
  // Update the pending count
  await updatePendingCount();
  
  return id;
}

/**
 * Get all pending scouting data entries
 * @returns {Promise<Array>} - Array of pending entries
 */
async function getPendingScoutingData() {
  const db = await dbPromise;
  const tx = db.transaction('scout-data', 'readonly');
  const store = tx.objectStore('scout-data');
  const entries = await store.getAll();
  await tx.complete;
  
  return entries.filter(entry => !entry.synced);
}

/**
 * Mark entry as synced
 * @param {number} id - Entry ID to mark as synced
 * @returns {Promise<boolean>} - Success status
 */
async function markScoutingDataSynced(id) {
  const db = await dbPromise;
  const tx = db.transaction('scout-data', 'readwrite');
  const store = tx.objectStore('scout-data');
  
  const entry = await store.get(id);
  if (!entry) return false;
  
  entry.synced = true;
  await store.put(entry);
  await tx.complete;
  
  // Update the pending count
  await updatePendingCount();
  
  return true;
}

/**
 * Delete entry from the database
 * @param {number} id - Entry ID to delete
 * @returns {Promise<boolean>} - Success status
 */
async function deleteScoutingData(id) {
  const db = await dbPromise;
  const tx = db.transaction('scout-data', 'readwrite');
  const store = tx.objectStore('scout-data');
  
  await store.delete(id);
  await tx.complete;
  
  // Update the pending count
  await updatePendingCount();
  
  return true;
}

/**
 * Count pending offline entries
 * @returns {Promise<number>} - Number of pending entries
 */
async function countPendingEntries() {
  const entries = await getPendingScoutingData();
  pendingEntries = entries.length;
  return pendingEntries;
}

/**
 * Update the pending count cache
 * @private
 */
async function updatePendingCount() {
  // Update our global count variable
  const count = await countPendingEntries();
  pendingEntries = count;
  
  // Update UI
  await updateOfflineIndicator();
  
  return count;
}

/**
 * Attempt to sync offline data
 * @returns {Promise<{success: number, failed: number}>} - Sync results
 */
async function syncOfflineData() {
  if (!navigator.onLine) {
    return { success: 0, failed: 0, offline: true };
  }
  
  const entries = await getPendingScoutingData();
  
  if (entries.length === 0) {
    return { success: 0, failed: 0 };
  }
  
  const results = { success: 0, failed: 0 };
  
  // Try to use the service worker sync first if available
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    try {
      return new Promise((resolve) => {
        // Set up a one-time message handler to get results
        const messageHandler = (event) => {
          if (event.data && event.data.type === 'SYNC_RESULT') {
            navigator.serviceWorker.removeEventListener('message', messageHandler);
            resolve(event.data.result);
          }
        };
        
        navigator.serviceWorker.addEventListener('message', messageHandler);
        
        // Ask the service worker to sync
        navigator.serviceWorker.controller.postMessage({
          type: 'SYNC_NOW'
        });
        
        // Set a timeout in case the service worker doesn't respond
        setTimeout(() => {
          navigator.serviceWorker.removeEventListener('message', messageHandler);
          resolve({ success: 0, failed: 0, timeout: true });
        }, 10000);
      });
    } catch (error) {
      console.error('Error requesting sync from service worker:', error);
      // Fall back to manual sync
    }
  }
  
  // Manual sync logic as fallback
  for (const entry of entries) {
    try {
      // Create FormData from stored object
      const formData = new FormData();
      for (const [key, value] of Object.entries(entry)) {
        if (!['id', 'timestamp', 'url', 'synced'].includes(key)) {
          formData.append(key, value);
        }
      }
      
      // Send to server
      const response = await fetch(entry.url, {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        await deleteScoutingData(entry.id);
        results.success++;
      } else {
        await markScoutingDataSynced(entry.id, false);
        results.failed++;
      }
    } catch (error) {
      console.error('Error syncing entry:', error);
      results.failed++;
    }
  }
  
  // Notify user about sync results
  if (results.success > 0 || results.failed > 0) {
    showSyncNotification(results);
  }
  
  // Update the UI
  await updateOfflineIndicator();
  
  return results;
}

/**
 * Show notification about sync results
 * @param {Object} results - Sync results
 */
function showSyncNotification(results) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Scouting Data Synced', {
      body: `Successfully synced ${results.success} entries. ${results.failed > 0 ? `Failed to sync ${results.failed} entries.` : ''}`,
      icon: '/static/images/logo.png'
    });
  } else {
    // Fallback for browsers without notification support
    const container = document.querySelector('.container');
    if (!container) return;
    
    const notification = document.createElement('div');
    notification.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 sm:left-auto sm:right-6 sm:-translate-x-0 z-50 w-[90%] sm:w-full max-w-xl min-h-[60px] sm:min-h-[80px] mx-auto sm:mx-0 animate-fade-in-up';
    
    notification.innerHTML = `
      <div class="flex items-center p-6 rounded-lg shadow-xl bg-green-50 text-green-800 border-2 border-green-200">
        <svg class="w-6 h-6 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
        </svg>
        <p class="text-base font-medium">
          Successfully synced ${results.success} entries. ${results.failed > 0 ? `Failed to sync ${results.failed} entries.` : ''}
        </p>
        <button class="ml-auto -mx-1.5 -my-1.5 rounded-lg p-1.5 inline-flex h-8 w-8 text-green-500 hover:bg-green-100" onclick="this.parentNode.parentNode.remove()">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
          </svg>
        </button>
      </div>
    `;
    
    container.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode === container) {
        notification.remove();
      }
    }, 5000);
  }
}

/**
 * Update offline indicator element
 */
async function updateOfflineIndicator() {
  const indicator = document.getElementById('offline-indicator');
  if (!indicator) return;
  
  const currentOffline = !navigator.onLine;
  isOffline = currentOffline;
  
  if (!offlineInitialized) {
    pendingEntries = await countPendingEntries();
    offlineInitialized = true;
  }
  
  // Show indicator if offline or if there are pending entries
  indicator.style.display = (currentOffline || pendingEntries > 0) ? 'block' : 'none';
  
  const statusText = indicator.querySelector('.offline-status-text');
  if (statusText) {
    if (currentOffline) {
      statusText.textContent = 'You are offline. Data will be saved locally.';
    } else if (pendingEntries > 0) {
      statusText.textContent = `${pendingEntries} ${pendingEntries === 1 ? 'entry' : 'entries'} waiting to sync.`;
    }
  }
  
  const syncButton = indicator.querySelector('.sync-now-button');
  if (syncButton) {
    syncButton.style.display = (!currentOffline && pendingEntries > 0) ? 'block' : 'none';
  }
}

// Initialize offline detection and service worker communication
async function initOfflineSupport() {
  // Set up service worker message listener
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SYNC_COMPLETE') {
        // Update our UI when the service worker reports a sync
        updatePendingCount();
        
        // Show notification if there were results
        if (event.data.success > 0 || event.data.failed > 0) {
          showSyncNotification({
            success: event.data.success,
            failed: event.data.failed
          });
        }
      }
    });
  }
  
  // Create offline indicator if it doesn't exist
  if (!document.getElementById('offline-indicator')) {
    const indicator = document.createElement('div');
    indicator.id = 'offline-indicator';
    indicator.className = 'fixed bottom-0 left-0 right-0 bg-yellow-100 text-yellow-800 px-4 py-2 hidden border-t border-yellow-200 z-50';
    
    indicator.innerHTML = `
      <div class="container mx-auto flex items-center justify-between">
        <div class="flex items-center">
          <svg class="w-5 h-5 mr-2 pulse-animation" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
          </svg>
          <span class="offline-status-text">You are offline. Data will be saved locally.</span>
        </div>
        <button class="sync-now-button bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-1 rounded text-sm transition-colors duration-200" style="display: none;" onclick="syncOfflineData()">
          Sync Now
        </button>
      </div>
    `;
    
    document.body.appendChild(indicator);
  }
  
  // Initial check for pending entries
  await updatePendingCount();
  
  // Handle online/offline events
  function handleOnlineEvent() {
    console.log('Back online');
    isOffline = false;
    updateOfflineIndicator();
    
    // Auto-sync data when coming back online
    if (pendingEntries > 0) {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // Try to use background sync
        try {
          navigator.serviceWorker.ready.then(registration => {
            registration.sync.register('offline-scout-queue')
              .catch(err => {
                // If background sync fails, do manual sync
                console.error('Background sync registration failed:', err);
                syncOfflineData();
              });
          });
        } catch (err) {
          // If background sync not supported, do it manually
          console.error('Background sync error:', err);
          syncOfflineData();
        }
      } else {
        // Fallback if service worker not available
        syncOfflineData();
      }
    }
  }
  
  function handleOfflineEvent() {
    console.log('Gone offline');
    isOffline = true;
    updateOfflineIndicator();
  }
  
  // Set up online/offline event listeners
  window.addEventListener('online', handleOnlineEvent);
  window.addEventListener('offline', handleOfflineEvent);
  
  // Check for failed initial service worker registration
  if ('serviceWorker' in navigator && !navigator.serviceWorker.controller) {
    navigator.serviceWorker.register('/static/js/service-worker.js')
      .then(registration => {
        console.log('Service Worker registered with scope:', registration.scope);
      })
      .catch(error => {
        console.error('Service Worker registration failed:', error);
      });
  }
}

// Check if page is already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOfflineSupport);
} else {
  initOfflineSupport();
}

// Add a flag to the fetch API to indicate when offline
const originalFetch = window.fetch;
window.fetch = function(resource, options) {
  if (!navigator.onLine) {
    // If we're offline and it's a GET request, let it try - it will be caught by the service worker
    if (!options || options.method === 'GET' || options.method === undefined) {
      return originalFetch(resource, options);
    }
    
    // For POST/PUT/DELETE, reject with a specific offline error
    return Promise.reject(new Error('OFFLINE_ERROR'));
  }
  
  // Otherwise, pass through to the original fetch
  return originalFetch(resource, options);
};

// Export functions to window
window.isOfflineMode = () => isOffline;
window.hasPendingData = () => pendingEntries > 0;
window.storeScoutingData = storeScoutingData;
window.getPendingScoutingData = getPendingScoutingData;
window.syncOfflineData = syncOfflineData;
window.countPendingEntries = countPendingEntries; 