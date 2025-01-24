class OfflineStorage {
  constructor() {
    this.dbName = 'ScoutingOfflineDB';
    this.dbVersion = 1;
    this.initDB();
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Store for pending API requests
        if (!db.objectStoreNames.contains('pendingRequests')) {
          db.createObjectStore('pendingRequests', { keyPath: 'id', autoIncrement: true });
        }
        
        // Store for cached scouting data
        if (!db.objectStoreNames.contains('scoutingData')) {
          db.createObjectStore('scoutingData', { keyPath: 'id' });
        }
      };
    });
  }

  async savePendingRequest(request) {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['pendingRequests'], 'readwrite');
      const store = transaction.objectStore('pendingRequests');

      const requestData = {
        url: request.url,
        method: request.method,
        headers: Array.from(request.headers.entries()),
        body: request.body,
        timestamp: new Date().toISOString()
      };

      const addRequest = store.add(requestData);
      addRequest.onsuccess = () => resolve(addRequest.result);
      addRequest.onerror = () => reject(addRequest.error);
    });
  }

  async getPendingRequests() {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['pendingRequests'], 'readonly');
      const store = transaction.objectStore('pendingRequests');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async removePendingRequest(id) {
    const db = await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['pendingRequests'], 'readwrite');
      const store = transaction.objectStore('pendingRequests');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Initialize offline storage
const offlineStorage = new OfflineStorage();

// Network status handler
function handleNetworkChange() {
  if (navigator.onLine) {
    console.log('Back online, syncing pending requests...');
    syncPendingRequests();
  } else {
    console.log('Offline mode activated');
  }
}

// Sync pending requests when back online
async function syncPendingRequests() {
  const pendingRequests = await offlineStorage.getPendingRequests();
  
  for (const request of pendingRequests) {
    try {
      const url = new URL(request.url, window.location.origin);

      if (url.origin !== window.location.origin) {
        console.error(`Invalid URL origin for request ${request.id}`);
        await offlineStorage.removePendingRequest(request.id);
        continue;
      }

      const response = await fetch(url.toString(), {
        method: request.method,
        headers: new Headers(request.headers),
        body: request.body
      });

      if (response.ok) {
        await offlineStorage.removePendingRequest(request.id);
        console.log(`Successfully synced request ${request.id}`);
      }
    } catch (error) {
      console.error(`Failed to sync request ${request.id}:`, error);
    }
  }
}

// Listen for network status changes
window.addEventListener('online', handleNetworkChange);
window.addEventListener('offline', handleNetworkChange); 

