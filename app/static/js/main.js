// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/static/js/service-worker.js')
      .then(registration => {
        console.log('ServiceWorker registration successful');
      })
      .catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
  });
}


// Handle offline status
let syncTimeout;
function updateOfflineStatus() {
  const offlineAlert = document.getElementById('offlineAlert');
  const syncAlert = document.getElementById('syncAlert');
  
  if (!navigator.onLine) {
    offlineAlert.classList.remove('hidden');
    syncAlert.classList.add('hidden');
  } else {
    offlineAlert.classList.add('hidden');
    // Debounce the sync call
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      syncPendingScoutingData();
    }, 1000); // Wait 1 second before syncing
  }
}


// Initialize
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('scoutingForm');
  if (form) {
    form.addEventListener('submit', handleScoutingSubmit);
  }

  window.addEventListener('online', updateOfflineStatus);
  window.addEventListener('offline', updateOfflineStatus);
  updateOfflineStatus();
}); 


// In the syncPendingScoutingData function, update the fetch response handling:
if (response.ok) {
    const result = await response.json();
    await offlineStorage.removePendingRequest(request.id);
    console.log(`Successfully synced request ${request.id}`);
    syncSuccessful = true;
    
    // If the server provides a redirect URL, use it
    if (result.redirect) {
        window.location.href = result.redirect;
        return; // Stop processing other requests
    }
} 