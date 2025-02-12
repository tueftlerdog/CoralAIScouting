let modalCanvas, modalCoordSystem;
let currentPathData = null;

function showAutoPath(pathData, autoNotes, deviceType) {
    currentPathData = pathData;
    
    // Show the modal
    const modal = document.getElementById('autoPathModal');
    modal.classList.remove('hidden');
    
    // Initialize canvas and coordinate system if not already done
    if (!modalCanvas) {
        modalCanvas = document.getElementById('modalAutoPath');
        modalCoordSystem = new CanvasCoordinateSystem(modalCanvas);
        
        // Set canvas size to match container
        resizeModalCanvas();
        window.addEventListener('resize', resizeModalCanvas);
    }
    
    redrawPaths();
    
    // Set auto notes
    const notesElement = document.getElementById('modalAutoNotes');
    if (notesElement) {
        notesElement.textContent = autoNotes || 'No notes available';
    }
}

function resizeModalCanvas() {
    const container = modalCanvas.parentElement;
    modalCanvas.width = container.clientWidth;
    modalCanvas.height = container.clientHeight;
    modalCoordSystem.updateTransform();
    redrawPaths();
}

function redrawPaths() {
    if (!modalCoordSystem || !currentPathData) return;
    
    modalCoordSystem.clear();
    
    let paths = currentPathData;
    if (typeof currentPathData === 'string') {
        try {
            paths = JSON.parse(currentPathData);
        } catch (e) {
            console.error('Error parsing path data:', e);
            return;
        }
    }
    
    if (Array.isArray(paths)) {
        paths.forEach(path => {
            if (Array.isArray(path) && path.length > 0) {
                const formattedPath = path.map(point => {
                    if (typeof point === 'object' && 'x' in point && 'y' in point) {
                        return {
                            x: (point.x / 1000) * modalCanvas.width,
                            y: (point.y / 300) * modalCanvas.height
                        };
                    }
                    return null;
                }).filter(point => point !== null);

                if (formattedPath.length > 0) {
                    modalCoordSystem.drawPath(formattedPath, '#3b82f6', 3);
                }
            }
        });
    }
}

function zoomIn(event) {
    if (!modalCoordSystem) return;
    const rect = modalCanvas.getBoundingClientRect();
    let mouseX = rect.width / 2;
    let mouseY = rect.height / 2;
    
    modalCoordSystem.zoom(mouseX, mouseY, 1.1);
    redrawPaths();
}

function zoomOut(event) {
    if (!modalCoordSystem) return;
    const rect = modalCanvas.getBoundingClientRect();
    let mouseX = rect.width / 2;
    let mouseY = rect.height / 2;
    
    modalCoordSystem.zoom(mouseX, mouseY, 0.9);
    redrawPaths();
}

function resetZoom() {
    if (!modalCoordSystem) return;
    modalCoordSystem.resetView();
    redrawPaths();
}

function closeAutoPathModal() {
    const modal = document.getElementById('autoPathModal');
    modal.classList.add('hidden');
    if (modalCoordSystem) {
        modalCoordSystem.resetView();
    }
}

const filterRows = () => {
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

            row.style.display = searchValue.includes(searchTerm) ? '' : 'none';
        });

        // Hide section if all rows are hidden
        const visibleRows = Array.from(section.querySelectorAll('.team-row')).filter(row => row.style.display !== 'none');
        section.style.display = visibleRows.length > 0 ? '' : 'none';
    });
};

document.addEventListener('DOMContentLoaded', function() {
    // Initialize DOM elements
    filterType = document.getElementById('filterType');
    searchInput = document.getElementById('searchInput');
    eventSections = document.querySelectorAll('.event-section');

    // Add event listeners after elements are found
    if (searchInput && filterType) {
        searchInput.addEventListener('input', filterRows);
        filterType.addEventListener('change', filterRows);
    }

    const modal = document.getElementById('autoPathModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeAutoPathModal();
            }
        });
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
    const climbType = document.querySelector('select[name="climb_type"]').value;
    const climbSuccess = document.querySelector('input[name="climb_success"]').checked;
    let climbPoints = 0;
    if (climbSuccess) {
        switch(climbType) {
            case 'shallow': climbPoints = 6; break;
            case 'deep': climbPoints = 12; break;
            case 'park': climbPoints = 2; break;
        }
    }
    
    
    const total = autoCoralPoints + autoAlgaeNet + autoAlgaeProcessor + 
                 teleopCoralPoints + teleopAlgaeNet + teleopAlgaeProcessor + 
                 humanPlayerPoints + climbPoints;
    document.getElementById('totalPoints').textContent = total;
}