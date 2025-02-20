let modalCanvas, modalCoordSystem;
let currentPathData = null;

function showAutoPath(pathData, autoNotes, deviceType) {
    currentPathData = pathData;
    
    const modal = document.getElementById('autoPathModal');
    modal.classList.remove('hidden');
    
    if (!modalCanvas) {
        modalCanvas = document.getElementById('modalAutoPath');
        modalCoordSystem = new CanvasCoordinateSystem(modalCanvas);
        
        resizeModalCanvas();
        window.addEventListener('resize', resizeModalCanvas);
    }
    
    redrawPaths();
    
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
    if (!modalCoordSystem || !currentPathData) {
      return;
    }
    
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
    if (!modalCoordSystem) {
      return;
    }
    const rect = modalCanvas.getBoundingClientRect();
    let mouseX = rect.width / 2;
    let mouseY = rect.height / 2;
    
    modalCoordSystem.zoom(mouseX, mouseY, 1.1);
    redrawPaths();
}

function zoomOut(event) {
    if (!modalCoordSystem) {
      return;
    }
    const rect = modalCanvas.getBoundingClientRect();
    let mouseX = rect.width / 2;
    let mouseY = rect.height / 2;
    
    modalCoordSystem.zoom(mouseX, mouseY, 0.9);
    redrawPaths();
}

function resetZoom() {
    if (!modalCoordSystem) {
      return;
    }
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

        const visibleRows = Array.from(section.querySelectorAll('.team-row')).filter(row => row.style.display !== 'none');
        section.style.display = visibleRows.length > 0 ? '' : 'none';
    });
};

document.addEventListener('DOMContentLoaded', function() {
    filterType = document.getElementById('filterType');
    searchInput = document.getElementById('searchInput');
    eventSections = document.querySelectorAll('.event-section');

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