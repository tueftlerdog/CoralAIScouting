/**
 * Scouting List JavaScript Module
 * 
 * Keep all existing functionality and add these modifications to integrate coral analysis features.
 * Insert these functions at the appropriate places in your existing list.js file.
 */

document.addEventListener('DOMContentLoaded', function() {
    // Keep existing initialization code
    
    // Add this line to the existing DOMContentLoaded handler
    setupCoralRequestButtons();
    
    // Keep any other existing initialization code
});

/**
 * Sets up the coral request buttons
 * Add this function to your list.js file
 */
function setupCoralRequestButtons() {
    // Setup coral request buttons in the match list view
    const coralRequestButtons = document.querySelectorAll('.coral-request-btn');
    
    coralRequestButtons.forEach(button => {
        button.addEventListener('click', function(event) {
            event.preventDefault();
            
            // Get data attributes from the button or parent row
            const eventCode = this.getAttribute('data-event-code');
            const matchNumber = this.getAttribute('data-match-number');
            const youtubeUrl = this.getAttribute('data-youtube-url');
            
            // Redirect to the coral request page with pre-filled data
            let requestUrl = `/coral/request?event_code=${eventCode}&match_number=${matchNumber}`;
            
            if (youtubeUrl) {
                requestUrl += `&youtube_url=${encodeURIComponent(youtubeUrl)}`;
            }
            
            window.location.href = requestUrl;
        });
    });
    
    // Set up the global "Scout Coral for Me" button if it exists
    const globalCoralButton = document.getElementById('globalCoralButton');
    if (globalCoralButton) {
        globalCoralButton.addEventListener('click', function(event) {
            event.preventDefault();
            window.location.href = '/coral/request';
        });
    }
}

/**
 * Add this function to your showAutoPath function (if it doesn't exist already)
 * This handles displaying the auto path modal
 */
function showAutoPath(pathData, notes, deviceType) {
    // Open modal
    const modal = document.getElementById('autoPathModal');
    if (!modal) return;
    
    modal.classList.remove('hidden');
    
    // Set auto notes
    const notesElement = document.getElementById('modalAutoNotes');
    if (notesElement) {
        notesElement.textContent = notes || 'No notes available';
    }
    
    // Draw the path on canvas
    const canvas = document.getElementById('modalAutoPath');
    if (!canvas) return;
    
    // Get the canvas context and clear it
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set up canvas dimensions
    setupCanvasDimensions(canvas);
    
    // Draw the path data
    drawPathOnCanvas(canvas, pathData);
}

/**
 * Add this function to close the auto path modal (if it doesn't exist already)
 */
function closeAutoPathModal() {
    const modal = document.getElementById('autoPathModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Helper function to extract team number, match number, and event code
 * from the current row or context
 * 
 * This is used by coral request buttons to get match information
 */
function getMatchInfoFromContext(element) {
    // Try to get info from the button's data attributes first
    let teamNumber = element.getAttribute('data-team-number');
    let matchNumber = element.getAttribute('data-match-number');
    let eventCode = element.getAttribute('data-event-code');
    
    // If not found, try to get from the parent row
    if (!teamNumber || !matchNumber || !eventCode) {
        const row = element.closest('tr');
        if (row) {
            teamNumber = teamNumber || row.getAttribute('data-team-number');
            
            // Try to get match number from the third column
            if (!matchNumber) {
                const matchCell = row.querySelector('td:nth-child(3)');
                matchNumber = matchCell ? matchCell.textContent.trim() : '';
            }
            
            // Try to get event code from parent section
            if (!eventCode) {
                const section = row.closest('.event-section');
                eventCode = section ? section.getAttribute('data-event-code') : '';
            }
        }
    }
    
    return {
        teamNumber: teamNumber || '',
        matchNumber: matchNumber || '',
        eventCode: eventCode || ''
    };
}

/**
 * Enhance the existing search/filter functionality to also search for YouTube URLs
 * Add this to your existing filterTeamRows function if you have one
 */
function enhanceFilterTeamRows() {
    // This assumes you have an existing filterTeamRows function
    // that handles filtering based on search input
    
    // Add 'youtube' as an option to the filter type dropdown
    const filterType = document.getElementById('filterType');
    if (filterType && !filterType.querySelector('option[value="youtube"]')) {
        const youtubeOption = document.createElement('option');
        youtubeOption.value = 'youtube';
        youtubeOption.textContent = 'YouTube URL';
        filterType.appendChild(youtubeOption);
    }
    
    // Then in your existing filter logic, add a case for 'youtube'
    // Example:
    /*
    switch (filter) {
        case 'team':
            // existing code
            break;
        case 'youtube':
            textToSearch = row.getAttribute('data-youtube-url') || '';
            break;
        // other cases
    }
    */
}
