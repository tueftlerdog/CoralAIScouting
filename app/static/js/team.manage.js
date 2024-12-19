// Initialize offline storage
const offlineStorage = {
    saveTeamData(data) {
        try {
            localStorage.setItem('teamData', JSON.stringify(data));
        } catch (error) {
            console.error('Error saving team data:', error);
        }
    },

    getPendingRequests() {
        try {
            const requests = localStorage.getItem('pendingRequests');
            return requests ? JSON.parse(requests) : [];
        } catch (error) {
            console.error('Error getting pending requests:', error);
            return [];
        }
    },

    savePendingRequest(request) {
        try {
            const requests = this.getPendingRequests();
            requests.push({ ...request, id: Date.now() });
            localStorage.setItem('pendingRequests', JSON.stringify(requests));
        } catch (error) {
            console.error('Error saving pending request:', error);
        }
    },

    removePendingRequest(requestId) {
        try {
            const requests = this.getPendingRequests();
            const updatedRequests = requests.filter(req => req.id !== requestId);
            localStorage.setItem('pendingRequests', JSON.stringify(updatedRequests));
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
    initializeEditAssignment();
    const teamData = document.getElementById('teamData');
    if (teamData) {
        currentUserId = teamData.dataset.currentUserId;
    }
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
    const teamNumber = document.getElementById('teamData').dataset.teamNumber;
    e.preventDefault();
    
    // Get the selected users' names
    const assignedToSelect = document.getElementById('assigned_to');
    const assignedToNames = Array.from(assignedToSelect.selectedOptions).map(option => option.text);
    
    const formData = {
        title: document.getElementById('title').value,
        description: document.getElementById('description').value,
        assigned_to: Array.from(document.getElementById('assigned_to').selectedOptions).map(option => option.value),
        assigned_to_names: assignedToNames,
        due_date: document.getElementById('due_date').value,
        id: Date.now() // Temporary ID for offline assignments
    };

    try {
        if (!navigator.onLine) {
            // Save to pending requests
            offlineStorage.savePendingRequest({
                type: 'create_assignment',
                url: `/team/${teamNumber}/assignments`,
                method: 'POST',
                data: formData
            });

            // Add the new row to the table
            const assignmentsTable = document.querySelector('table tbody');
            const newRow = createAssignmentRow(formData);
            assignmentsTable.insertBefore(newRow, assignmentsTable.firstChild);

            // Remove "No assignments found" row if it exists
            const noAssignmentsRow = assignmentsTable.querySelector('td[colspan="6"]');
            if (noAssignmentsRow) {
                noAssignmentsRow.closest('tr').remove();
            }

            showOfflineNotification('Assignment will be created when online');
            document.getElementById('createAssignmentModal').classList.add('hidden');
            document.getElementById('createAssignmentForm').reset();
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

// Sync pending actions
async function syncPendingTeamActions() {
    if (!navigator.onLine) return;

    const pendingRequests = offlineStorage.getPendingRequests();
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
            offlineStorage.savePendingRequest({
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
    const row = selectElement.closest('tr');
    const statusCell = row.querySelector('.status-badge');
    const dueDateCell = row.querySelector('td:nth-child(4)').textContent;
    
    let isLate = false;
    if (dueDateCell && dueDateCell !== 'No due date') {
        const dueDate = new Date(dueDateCell);
        isLate = dueDate < new Date() && newStatus !== 'completed';
    }
    
    const statusClasses = {
        'completed': 'bg-green-100 text-green-800',
        'in_progress': 'bg-yellow-100 text-yellow-800',
        'pending': isLate ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
    };
    
    const statusText = isLate ? 'Late' :
                      newStatus === 'in_progress' ? 'In Progress' : 
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
            offlineStorage.savePendingRequest({
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

async function updateAdminStatus(userId, action) {
    const teamNumber = document.getElementById('teamData').dataset.teamNumber;
    const url = action === 'add' 
        ? `/team/${teamNumber}/admin/add`
        : `/team/${teamNumber}/admin/remove`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ user_id: userId })
        });

        const data = await response.json();
        
        if (data.success) {
            // Reload the page to reflect changes
            window.location.reload();
        } else {
            alert(data.message || 'Failed to update admin status');
        }
    } catch (error) {
        console.error('Error updating admin status:', error);
        alert('Failed to update admin status');
    }
}

function openEditAssignmentModal(assignmentId) {
    try {
        const row = document.querySelector(`tr[data-assignment-id="${assignmentId}"]`);
        if (!row) {
            console.error('Row not found for assignment:', assignmentId);
            return;
        }

        const modal = document.getElementById('editAssignmentModal');
        if (!modal) {
            console.error('Edit modal not found');
            return;
        }

        // Fill the form with current values
        document.getElementById('edit_assignment_id').value = assignmentId;
        
        // Get the cells by their position
        const titleCell = row.querySelector('td:nth-child(1)');
        const descriptionCell = row.querySelector('td:nth-child(2)');
        const assignedToCell = row.querySelector('td:nth-child(3)');
        const dueDateCell = row.querySelector('td:nth-child(4)');

        if (titleCell) document.getElementById('edit_title').value = titleCell.textContent.trim();
        if (descriptionCell) document.getElementById('edit_description').value = descriptionCell.textContent.trim();

        // Handle assigned users
        if (assignedToCell) {
            const assignedUsers = assignedToCell.textContent
                .split(',')
                .map(u => u.trim());

            const selectElement = document.getElementById('edit_assigned_to');
            if (selectElement) {
                Array.from(selectElement.options).forEach(option => {
                    option.selected = assignedUsers.includes(option.text.trim());
                });
            }
        }

        // Handle due date
        if (dueDateCell) {
            const dueDateText = dueDateCell.textContent.trim();
            if (dueDateText && dueDateText !== 'No due date') {
                const dueDate = new Date(dueDateText);
                if (!isNaN(dueDate.getTime())) {
                    // Format the date to the required format for datetime-local input
                    const formattedDate = dueDate.toISOString().slice(0, 16);
                    document.getElementById('edit_due_date').value = formattedDate;
                }
            } else {
                document.getElementById('edit_due_date').value = '';
            }
        }

        // Show the modal
        modal.classList.remove('hidden');
        
    } catch (error) {
        console.error('Error opening edit modal:', error);
        alert('Error opening edit modal');
    }
}

async function handleEditAssignmentSubmit(e) {
    e.preventDefault();
    
    const assignmentId = document.getElementById('edit_assignment_id').value;
    const formData = {
        title: document.getElementById('edit_title').value,
        description: document.getElementById('edit_description').value,
        assigned_to: Array.from(document.getElementById('edit_assigned_to').selectedOptions).map(option => option.value),
        due_date: document.getElementById('edit_due_date').value
    };

    try {
        if (!navigator.onLine) {
            offlineStorage.savePendingRequest({
                type: 'edit_assignment',
                url: `/team/assignments/${assignmentId}/edit`,
                method: 'PUT',
                data: formData
            });
            showOfflineNotification('Assignment will be updated when online');
            document.getElementById('editAssignmentModal').classList.add('hidden');
            return;
        }

        const response = await fetch(`/team/assignments/${assignmentId}/edit`, {
            method: 'PUT',
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
            throw new Error(data.message || 'Failed to update assignment');
        }
    } catch (error) {
        console.error('Error:', error);
        alert(error.message || 'An error occurred while updating the assignment');
    }
}

// Add this new function
function initializeEditAssignment() {
    // Initialize edit form submit handler
    const editForm = document.getElementById('editAssignmentForm');
    if (editForm) {
        editForm.addEventListener('submit', handleEditAssignmentSubmit);
    }

    // Check for late assignments on page load
    document.querySelectorAll('.assignment-row').forEach(row => {
        const statusSelect = row.querySelector('select[name="status"]');
        if (statusSelect) {
            updateStatusBadge(statusSelect, statusSelect.value);
        }
    });
}

// Add this new function to render a single assignment row
function createAssignmentRow(assignment) {
    const isCurrentUserAssigned = assignment.assigned_to.includes(currentUserId);
    const row = document.createElement('tr');
    row.className = `assignment-row ${isCurrentUserAssigned ? 'bg-blue-50' : ''} hover:bg-gray-50`;
    
    // Format the date if it exists
    const formattedDate = assignment.due_date ? 
        new Date(assignment.due_date).toLocaleString() : 
        'No due date';

    row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap">${assignment.title}</td>
        <td class="px-6 py-4 whitespace-normal">${assignment.description}</td>
        <td class="px-6 py-4 whitespace-nowrap">${assignment.assigned_to_names.join(', ')}</td>
        <td class="px-6 py-4 whitespace-nowrap">${formattedDate}</td>
        <td class="px-6 py-4 whitespace-nowrap">
            <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full status-badge bg-gray-100 text-gray-800">
                Pending (Offline)
            </span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm">
            <span class="text-gray-500">Pending sync...</span>
        </td>
    `;
    
    return row;
}