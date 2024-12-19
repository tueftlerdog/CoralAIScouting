// Initialize offline storage
const offlineStorage = {
    async saveTeamData(data) {
        try {
            await localStorage.setItem('teamData', JSON.stringify(data));
        } catch (error) {
            console.error('Error saving team data:', error);
        }
    },

    async getPendingRequests() {
        try {
            const requests = await localStorage.getItem('pendingRequests');
            return requests ? JSON.parse(requests) : [];
        } catch (error) {
            console.error('Error getting pending requests:', error);
            return [];
        }
    },

    async savePendingRequest(request) {
        try {
            const requests = await this.getPendingRequests();
            requests.push({ ...request, id: Date.now() });
            await localStorage.setItem('pendingRequests', JSON.stringify(requests));
        } catch (error) {
            console.error('Error saving pending request:', error);
        }
    },

    async removePendingRequest(requestId) {
        try {
            const requests = await this.getPendingRequests();
            const updatedRequests = requests.filter(req => req.id !== requestId);
            await localStorage.setItem('pendingRequests', JSON.stringify(updatedRequests));
        } catch (error) {
            console.error('Error removing pending request:', error);
        }
    }
};

// Online/Offline status handling
let isOnline = navigator.onLine;

function showOfflineNotification(message) {
    const offlineAlert = document.getElementById('offlineAlert');
    if (offlineAlert) {
        offlineAlert.textContent = message;
        offlineAlert.classList.remove('hidden');
    }
}

function hideOfflineNotification() {
    const offlineAlert = document.getElementById('offlineAlert');
    if (offlineAlert) {
        offlineAlert.classList.add('hidden');
    }
}

// Main initialization
document.addEventListener('DOMContentLoaded', function() {
    initializeSearch();
    initializeAssignmentForm();
    initializeStatusHandlers();
    initializeOfflineSupport();
});

// Initialize search functionality
function initializeSearch() {
    const memberSearch = document.getElementById('memberSearch');
    const assignmentSearch = document.getElementById('assignmentSearch');

    if (memberSearch) {
        memberSearch.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const memberRows = document.querySelectorAll('.member-row');

            memberRows.forEach(row => {
                const username = row.children[0].textContent.toLowerCase();
                const email = row.children[1].textContent.toLowerCase();
                const role = row.children[2].textContent.toLowerCase();

                row.style.display = (username.includes(searchTerm) || 
                                   email.includes(searchTerm) || 
                                   role.includes(searchTerm)) ? '' : 'none';
            });
        });
    }

    if (assignmentSearch) {
        assignmentSearch.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const assignmentRows = document.querySelectorAll('.assignment-row');

            assignmentRows.forEach(row => {
                const title = row.querySelector('td:first-child').textContent.toLowerCase();
                const description = row.querySelector('td:nth-child(2)').textContent.toLowerCase();
                const assignedTo = row.querySelector('td:nth-child(3)').textContent.toLowerCase();

                row.style.display = (title.includes(searchTerm) || 
                                   description.includes(searchTerm) || 
                                   assignedTo.includes(searchTerm)) ? '' : 'none';
            });
        });
    }
}

// Initialize assignment form
function initializeAssignmentForm() {
    const form = document.getElementById('createAssignmentForm');
    if (form) {
        form.addEventListener('submit', handleAssignmentSubmit);
    }
}

// Initialize status handlers
function initializeStatusHandlers() {
    const statusSelects = document.querySelectorAll('select[name="status"]');
    statusSelects.forEach(select => {
        select.addEventListener('click', function() {
            this.setAttribute('data-previous-value', this.value);
        });
    });
}

// Initialize offline support
document.addEventListener('DOMContentLoaded', function() {
    const offlineAlert = document.getElementById('offlineAlert');
    
    function updateOnlineStatus() {
        isOnline = navigator.onLine;
        if (isOnline) {
            hideOfflineNotification();
            syncPendingTeamActions();
        } else {
            showOfflineNotification('You are currently offline. Actions will be synced when you\'re back online.');
        }
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    window.addEventListener('load', updateOnlineStatus);
    updateOnlineStatus();
});

// Handle assignment form submission
async function handleAssignmentSubmit(e) {
    e.preventDefault();
    
    const teamNumber = document.getElementById('teamData').dataset.teamNumber;
    const formData = {
        title: document.getElementById('title').value,
        description: document.getElementById('description').value,
        assigned_to: Array.from(document.getElementById('assigned_to').selectedOptions).map(option => option.value),
        due_date: document.getElementById('due_date').value
    };

    try {
        if (!navigator.onLine) {
            await offlineStorage.savePendingRequest({
                type: 'create_assignment',
                url: `/team/${teamNumber}/assignments`,
                method: 'POST',
                data: formData
            });
            showOfflineNotification('Assignment will be created when online');
            document.getElementById('createAssignmentModal').classList.add('hidden');
            return;
        }

        const response = await fetch(`/team/${teamNumber}/assignments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        
        if (data.success) {
            window.location.reload();
        } else {
            throw new Error(data.message || 'Failed to create assignment');
        }
    } catch (error) {
        console.error('Error:', error);
        alert(error.message || 'An error occurred while creating the assignment');
    }
}

// Cache current team data
async function cacheCurrentTeamData() {
    const teamData = {
        team_number: document.querySelector('[data-team-number]')?.dataset.teamNumber,
        team_join_code: document.querySelector('[data-team-join-code]')?.dataset.teamJoinCode,
        members: Array.from(document.querySelectorAll('.member-row')).map(row => ({
            username: row.children[0].textContent,
            email: row.children[1].textContent,
            role: row.children[2].textContent.trim()
        })),
        assignments: Array.from(document.querySelectorAll('.assignment-row')).map(row => ({
            id: row.dataset.assignmentId,
            title: row.querySelector('td:nth-child(1)').textContent,
            description: row.querySelector('td:nth-child(2)').textContent,
            assigned_to: row.querySelector('td:nth-child(3)').textContent.split(',').map(s => s.trim()),
            due_date: row.querySelector('td:nth-child(4)').textContent,
            status: row.querySelector('select[name="status"]')?.value || 
                   row.querySelector('.status-badge').textContent.trim()
        }))
    };

    await offlineStorage.saveTeamData(teamData);
}

// Sync pending actions
async function syncPendingTeamActions() {
    if (!navigator.onLine) return;

    const pendingRequests = await offlineStorage.getPendingRequests();
    if (pendingRequests.length === 0) return;

    let successfulSyncs = 0;
    const failedRequests = [];

    for (const request of pendingRequests) {
        try {
            const response = await fetch(request.url, {
                method: request.method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: request.data ? JSON.stringify(request.data) : undefined
            });

            const data = await response.json();
            if (data.success) {
                successfulSyncs++;
            } else {
                failedRequests.push({
                    ...request,
                    error: data.message
                });
            }
        } catch (error) {
            console.error('Sync error:', error);
            failedRequests.push({
                ...request,
                error: error.message
            });
        }
    }

    // Update localStorage with only failed requests
    localStorage.setItem('pendingRequests', JSON.stringify(failedRequests));

    // Show sync results
    if (successfulSyncs > 0) {
        alert(`Successfully synced ${successfulSyncs} pending actions`);
        window.location.reload();
    }
    if (failedRequests.length > 0) {
        alert(`Failed to sync ${failedRequests.length} actions. They will be retried later.`);
    }
}

// Handle assignment status updates
async function updateAssignmentStatus(selectElement, assignmentId) {
    const newStatus = selectElement.value;
    const previousValue = selectElement.getAttribute('data-previous-value');
    
    try {
        if (!navigator.onLine) {
            await offlineStorage.savePendingRequest({
                type: 'status_update',
                url: `/team/assignments/${assignmentId}/status`,
                method: 'PUT',
                data: { status: newStatus }
            });
            updateStatusBadge(selectElement, newStatus);
            showOfflineNotification('Status will be updated when online');
            return;
        }

        const response = await fetch(`/team/assignments/${assignmentId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (!response.ok) {
            throw new Error('Failed to update status');
        }
        
        updateStatusBadge(selectElement, newStatus);
    } catch (error) {
        console.error('Error:', error);
        selectElement.value = previousValue;
        alert('Failed to update status');
    }
}

// Helper functions
function updateStatusBadge(selectElement, newStatus) {
    const statusCell = selectElement.closest('tr').querySelector('.status-badge');
    const statusClasses = {
        'completed': 'bg-green-100 text-green-800',
        'in_progress': 'bg-yellow-100 text-yellow-800',
        'pending': 'bg-gray-100 text-gray-800'
    };
    
    const statusText = newStatus === 'in_progress' ? 'In Progress' : 
                      newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
    
    statusCell.textContent = statusText;
    statusCell.className = `px-2 inline-flex text-xs leading-5 font-semibold rounded-full status-badge ${statusClasses[newStatus]}`;
}

async function deleteAssignment(assignmentId) {
    if (!confirm('Are you sure you want to delete this assignment?')) {
        return;
    }

    try {
        if (!navigator.onLine) {
            await offlineStorage.savePendingRequest({
                type: 'delete_assignment',
                url: `/team/assignments/${assignmentId}/delete`,
                method: 'DELETE'
            });
            showOfflineNotification('Assignment will be deleted when online');
            return;
        }

        const response = await fetch(`/team/assignments/${assignmentId}/delete`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        const data = await response.json();
        if (data.success) {
            window.location.reload();
        } else {
            throw new Error(data.message || 'Failed to delete assignment');
        }
    } catch (error) {
        console.error('Error:', error);
        alert(error.message || 'An error occurred while deleting the assignment');
    }
}

async function clearAllAssignments() {
    if (!confirm('Are you sure you want to clear all assignments? This action cannot be undone.')) {
        return;
    }

    const teamNumber = document.getElementById('teamData').dataset.teamNumber;

    try {
        const response = await fetch(`/team/${teamNumber}/assignments/clear`, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        const data = await response.json();
        if (data.success) {
            window.location.reload();
        } else {
            alert(data.message || 'Failed to clear assignments');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred while clearing assignments');
    }
}

async function deleteTeam() {
    if (!confirm('Are you sure you want to delete this team? This action cannot be undone and will remove all team data, assignments, and members.')) {
        return;
    }

    const teamNumber = document.getElementById('teamData').dataset.teamNumber;

    try {
        const response = await fetch(`/team/${teamNumber}/delete`, {
            method: 'DELETE',
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        const data = await response.json();
        if (data.success) {
            window.location.href = '/team/join';
        } else {
            alert(data.message || 'Failed to delete team');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred while deleting the team');
    }
}