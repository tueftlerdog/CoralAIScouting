// Add this at the top of your file
const offlineStorage = {
    getPendingRequests() {
        const requests = localStorage.getItem('pendingRequests');
        return requests ? JSON.parse(requests) : [];
    },

    savePendingRequest(request) {
        const requests = this.getPendingRequests();
        request.id = Date.now().toString();
        requests.push(request);
        localStorage.setItem('pendingRequests', JSON.stringify(requests));
        return request.id;
    },

    removePendingRequest(requestId) {
        const requests = this.getPendingRequests();
        const filtered = requests.filter(r => r.id !== requestId);
        localStorage.setItem('pendingRequests', JSON.stringify(filtered));
    }
};

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