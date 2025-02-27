/**
 * Coral Video Analysis JavaScript Module
 * 
 * This module handles:
 * 1. Form submission for coral analysis requests
 * 2. Status checking for pending analyses
 * 3. UI updates for status indicators
 */

// Initialize status checking when the results page loads
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on the results page
    if (document.querySelector('.status-badge')) {
        initStatusChecking();
    }
    
    // Check if we're on the request page
    const requestForm = document.getElementById('coralRequestForm');
    if (requestForm) {
        requestForm.addEventListener('submit', validateCoralRequest);
    }
});

/**
 * Validates the coral request form before submission
 */
function validateCoralRequest(event) {
    event.preventDefault();
    
    const form = event.target;
    const youtubeUrl = form.querySelector('input[name="youtube_url"]').value;
    
    // Basic YouTube URL validation
    if (!isValidYoutubeUrl(youtubeUrl)) {
        showFormError('Please enter a valid YouTube URL');
        return;
    }
    
    // Check if all required team numbers are provided
    const blueTeams = [
        form.querySelector('input[name="blue_team1"]').value,
        form.querySelector('input[name="blue_team2"]').value,
        form.querySelector('input[name="blue_team3"]').value
    ];
    
    const redTeams = [
        form.querySelector('input[name="red_team1"]').value,
        form.querySelector('input[name="red_team2"]').value,
        form.querySelector('input[name="red_team3"]').value
    ];
    
    // Check if any team numbers are missing
    if (blueTeams.some(team => !team) || redTeams.some(team => !team)) {
        showFormError('Please enter all team numbers');
        return;
    }
    
    // If validation passes, submit the form
    showFormStatus('Submitting request...');
    form.submit();
}

/**
 * Initializes periodic status checking for coral analysis requests
 */
function initStatusChecking() {
    const pendingRequests = document.querySelectorAll('[id^="request-"]');
    
    if (pendingRequests.length > 0) {
        // Check status immediately and then every 30 seconds
        checkAllRequestStatuses(pendingRequests);
        setInterval(() => checkAllRequestStatuses(pendingRequests), 30000);
    }
}

/**
 * Checks the status of all pending requests
 */
function checkAllRequestStatuses(requests) {
    requests.forEach(request => {
        const requestId = request.id.replace('request-', '');
        checkRequestStatus(requestId);
    });
}

/**
 * Checks the status of a single request and updates the UI
 */
function checkRequestStatus(requestId) {
    fetch(`/coral/status/${requestId}`)
        .then(response => response.json())
        .then(data => {
            updateRequestStatus(requestId, data);
        })
        .catch(error => {
            console.error('Error checking status:', error);
        });
}

/**
 * Updates the UI based on request status
 */
function updateRequestStatus(requestId, data) {
    const requestElement = document.getElementById(`request-${requestId}`);
    if (!requestElement) return;
    
    const statusBadge = requestElement.querySelector('.status-badge');
    if (!statusBadge) return;
    
    // Update status badge text
    statusBadge.textContent = data.status.charAt(0).toUpperCase() + data.status.slice(1);
    
    // Update status badge class based on status
    statusBadge.className = 'status-badge px-2 inline-flex text-xs leading-5 font-semibold rounded-full';
    
    switch (data.status) {
        case 'pending':
            statusBadge.classList.add('bg-blue-100', 'text-blue-800');
            break;
        case 'processing':
            statusBadge.classList.add('bg-yellow-100', 'text-yellow-800');
            break;
        case 'completed':
            statusBadge.classList.add('bg-green-100', 'text-green-800');
            // Refresh the page to show results
            window.location.reload();
            break;
        case 'failed':
            statusBadge.classList.add('bg-red-100', 'text-red-800');
            // Add error message if available
            if (data.error_message) {
                const row = requestElement.closest('tr');
                if (row) {
                    // Create error message cell if it doesn't exist
                    let errorCell = row.querySelector('.error-message');
                    if (!errorCell) {
                        errorCell = document.createElement('td');
                        errorCell.className = 'px-6 py-4 error-message';
                        row.appendChild(errorCell);
                    }
                    errorCell.textContent = data.error_message;
                }
            }
            break;
    }
}

/**
 * Shows error message on the form
 */
function showFormError(message) {
    const errorContainer = document.getElementById('formErrorContainer');
    if (!errorContainer) {
        const form = document.getElementById('coralRequestForm');
        const errorDiv = document.createElement('div');
        errorDiv.id = 'formErrorContainer';
        errorDiv.className = 'bg-red-50 border-l-4 border-red-400 p-4 mb-6';
        errorDiv.innerHTML = `
            <div class="flex">
                <div class="flex-shrink-0">
                    <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                    </svg>
                </div>
                <div class="ml-3">
                    <p class="text-sm text-red-700" id="formErrorMessage">${message}</p>
                </div>
            </div>
        `;
        form.parentNode.insertBefore(errorDiv, form);
    } else {
        const errorMessage = document.getElementById('formErrorMessage');
        errorMessage.textContent = message;
        errorContainer.style.display = 'block';
    }
}

/**
 * Shows status message on the form
 */
function showFormStatus(message) {
    const statusContainer = document.getElementById('formStatusContainer');
    if (!statusContainer) {
        const form = document.getElementById('coralRequestForm');
        const statusDiv = document.createElement('div');
        statusDiv.id = 'formStatusContainer';
        statusDiv.className = 'bg-blue-50 border-l-4 border-blue-400 p-4 mb-6';
        statusDiv.innerHTML = `
            <div class="flex">
                <div class="flex-shrink-0">
                    <svg class="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                    </svg>
                </div>
                <div class="ml-3">
                    <p class="text-sm text-blue-700" id="formStatusMessage">${message}</p>
                </div>
            </div>
        `;
        form.parentNode.insertBefore(statusDiv, form);
    } else {
        const statusMessage = document.getElementById('formStatusMessage');
        statusMessage.textContent = message;
        statusContainer.style.display = 'block';
        
        // Hide any existing error
        const errorContainer = document.getElementById('formErrorContainer');
        if (errorContainer) {
            errorContainer.style.display = 'none';
        }
    }
}

/**
 * Validates YouTube URL format
 */
function isValidYoutubeUrl(url) {
    const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
    return regex.test(url);
}

/**
 * Prefills form data based on URL parameters
 * Called when the request page loads
 */
function prefillFormData() {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Prefill YouTube URL if provided
    const youtubeUrl = urlParams.get('youtube_url');
    if (youtubeUrl) {
        const urlInput = document.querySelector('input[name="youtube_url"]');
        if (urlInput) urlInput.value = youtubeUrl;
    }
    
    // Prefill event code if provided
    const eventCode = urlParams.get('event_code');
    if (eventCode) {
        const eventInput = document.querySelector('input[name="event_code"]');
        if (eventInput) eventInput.value = eventCode;
    }
    
    // Prefill match number if provided
    const matchNumber = urlParams.get('match_number');
    if (matchNumber) {
        const matchInput = document.querySelector('input[name="match_number"]');
        if (matchInput) matchInput.value = matchNumber;
    }
}

// Call prefillFormData when the request page loads
document.addEventListener('DOMContentLoaded', function() {
    const requestForm = document.getElementById('coralRequestForm');
    if (requestForm) {
        prefillFormData();
    }
});
