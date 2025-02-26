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
        console.log('Missing required data:', { modalCoordSystem: !!modalCoordSystem, currentPathData: !!currentPathData });
        return;
    }
    
    modalCoordSystem.clear();
    console.log('Initial currentPathData:', currentPathData);
    
    let parsedData;
    
    // Parse the path data if it's a string
    if (typeof currentPathData === 'string') {
        try {
            // First, try parsing directly
            try {
                parsedData = JSON.parse(currentPathData);
                console.log('Direct parse successful:', parsedData);
            } catch (err) {
                console.log('Direct parse failed, trying cleanup:', err);
                // If direct parsing fails, try cleaning the string
                const cleanValue = currentPathData.replace(/^"(.*)"$/, '$1');
                const unescapedValue = cleanValue.replace(/\\"/g, '"');
                parsedData = JSON.parse(unescapedValue);
                console.log('Parse after cleanup:', parsedData);
            }
        } catch (e) {
            console.error('All parsing attempts failed:', e);
            return;
        }
    } else {
        parsedData = currentPathData;
    }
    
    let paths = [];
    console.log('Canvas dimensions:', { width: modalCanvas.width, height: modalCanvas.height });
    
    // Check if we have the new format with metadata
    if (parsedData && typeof parsedData === 'object' && 'paths' in parsedData) {
        console.log('Using new format with metadata');
        const { paths: loadedPaths, canvasWidth, canvasHeight } = parsedData;
        
        // Scale points if canvas dimensions have changed
        if (canvasWidth && canvasHeight) {
            // Calculate scaling factors based on the current canvas dimensions
            const scaleX = modalCanvas.width / canvasWidth;
            const scaleY = modalCanvas.height / canvasHeight;
            
            console.log('Scaling factors:', { 
                originalWidth: canvasWidth, 
                originalHeight: canvasHeight,
                currentWidth: modalCanvas.width,
                currentHeight: modalCanvas.height,
                scaleX: scaleX,
                scaleY: scaleY
            });
            
            // Reset the coordinate system first to ensure clean state
            modalCoordSystem.resetView();
            
            // Scale the points directly based on the ratio of current to original dimensions
            paths = loadedPaths.map(path => 
                path.map(point => ({
                    x: (point.x + 145) * scaleX, // WONTFIX: Added offset to x 
                    y: (point.y - 1) * scaleY // WONTFIX: Added offset to y
                }))
            );
        } else {
            paths = loadedPaths;
        }
    } else {
        console.log('Using legacy format');
        // Handle legacy format (just an array of paths)
        if (!Array.isArray(parsedData)) {
            paths = [[parsedData]];
        } else if (!Array.isArray(parsedData[0])) {
            paths = [parsedData];
        } else {
            paths = parsedData;
        }
    }
    
    console.log('Pre-validation paths:', paths);
    
    // Validate path structure
    paths = paths.map(path => {
        if (Array.isArray(path)) {
            return path.map(point => {
                if (typeof point === 'object' && 'x' in point && 'y' in point) {
                    return {
                        x: parseFloat(point.x),
                        y: parseFloat(point.y)
                    };
                }
                return null;
            }).filter(point => point !== null);
        }
        return [];
    }).filter(path => path.length > 0);
    
    console.log('Final validated paths:', paths);
    
    // Reset zoom level to ensure consistent display
    modalCoordSystem.resetView();
    
    // Draw each path
    paths.forEach((path, index) => {
        if (path.length > 0) {
            console.log(`Drawing path ${index}:`, path);
            modalCoordSystem.drawPath(path, '#3b82f6', 3);
        }
    });
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