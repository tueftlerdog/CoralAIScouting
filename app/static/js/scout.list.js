document.addEventListener('DOMContentLoaded', function() {
    const filterType = document.getElementById('filterType');
    const searchInput = document.getElementById('searchInput');
    const eventSections = document.querySelectorAll('.event-section');

    function filterRows() {
        const searchTerm = searchInput.value.toLowerCase();
        const type = filterType.value;

        Array.from(eventSections).forEach(section => {
            const rows = Array.from(section.querySelectorAll('.team-row'));
            
            rows.forEach(row => {
                let searchValue = '';
                switch(type) {
                    case 'team':
                        searchValue = row.dataset.teamNumber;
                        break;
                    case 'match':
                        searchValue = row.querySelector('td:nth-child(2)').textContent;
                        break;
                    case 'scouter':
                        searchValue = row.dataset.scouter.toLowerCase();
                        break;
                }

                if (searchValue.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });

            // Hide section if all rows are hidden
            const visibleRows = Array.from(section.querySelectorAll('.team-row')).filter(row => row.style.display !== 'none');
            section.style.display = visibleRows.length > 0 ? '' : 'none';
        });
    }

    searchInput.addEventListener('input', filterRows);
    filterType.addEventListener('change', filterRows);
});

function showAutoPath(pathData, autoNotes = '') {
    const modal = document.getElementById('autoPathModal');
    const image = document.getElementById('modalAutoPathImage');
    const notes = document.getElementById('modalAutoNotes');
    
    image.src = pathData;
    notes.textContent = autoNotes || 'No auto notes provided';
    modal.classList.remove('hidden');
}

function closeAutoPathModal() {
    document.getElementById('autoPathModal').classList.add('hidden');
}

// Close modal when clicking outside
document.getElementById('autoPathModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeAutoPathModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeAutoPathModal();
    }
});

function updateTotal() {
    // Auto scoring
    const autoCoralPoints = [1, 2, 3, 4].reduce((sum, level) => {
        return sum + (parseInt(document.querySelector(`input[name="auto_coral_level${level}"]`).value) || 0) * level;
    }, 0);
    
    const autoAlgaeNet = (parseInt(document.querySelector('input[name="auto_algae_net"]').value) || 0) * 2;
    const autoAlgaeProcessor = (parseInt(document.querySelector('input[name="auto_algae_processor"]').value) || 0) * 3;
    
    // Teleop scoring
    const teleopCoralPoints = [1, 2, 3, 4].reduce((sum, level) => {
        return sum + (parseInt(document.querySelector(`input[name="teleop_coral_level${level}"]`).value) || 0) * level;
    }, 0);
    
    const teleopAlgaeNet = (parseInt(document.querySelector('input[name="teleop_algae_net"]').value) || 0) * 2;
    const teleopAlgaeProcessor = (parseInt(document.querySelector('input[name="teleop_algae_processor"]').value) || 0) * 3;
    const humanPlayerPoints = (parseInt(document.querySelector('input[name="human_player"]').value) || 0) * 2;
    
    // ... existing climb points calculation ...
    
    const total = autoCoralPoints + autoAlgaeNet + autoAlgaeProcessor + 
                 teleopCoralPoints + teleopAlgaeNet + teleopAlgaeProcessor + 
                 humanPlayerPoints + climbPoints;
    document.getElementById('totalPoints').textContent = total;
}