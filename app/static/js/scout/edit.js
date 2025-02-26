let canvas, coordSystem;
let isDrawing = false;
let currentPath = [];
let paths = [];

function initCanvas() {
    canvas = document.getElementById('autoPath');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }

    coordSystem = new CanvasCoordinateSystem(canvas);
    
    // Set canvas size based on container
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Mouse events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);
    
    // Touch events
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);

    // Load existing path data if available
    const pathDataInput = document.getElementById('auto_path');
    if (pathDataInput && pathDataInput.value) {
        try {
            const rawValue = pathDataInput.value;
            let parsedData;
            
            console.log('Loading path data:', rawValue);
            
            // First, try parsing directly
            try {
                parsedData = JSON.parse(rawValue);
                console.log('Direct parse successful:', parsedData);
            } catch (err) {
                console.log('Direct parse failed, trying cleanup:', err);
                // If direct parsing fails, try cleaning the string
                const cleanValue = rawValue.replace(/^"(.*)"$/, '$1');
                const unescapedValue = cleanValue.replace(/\\"/g, '"');
                parsedData = JSON.parse(unescapedValue);
                console.log('Parse after cleanup:', parsedData);
            }
            
            // Check if we have the new format with metadata
            if (parsedData && typeof parsedData === 'object' && 'paths' in parsedData) {
                console.log('Using new format with metadata');
                const { paths: loadedPaths, canvasWidth, canvasHeight } = parsedData;
                
                // Scale points if canvas dimensions have changed
                if (canvasWidth && canvasHeight) {
                    // Calculate scaling factors based on the current canvas dimensions
                    const scaleX = canvas.width / canvasWidth;
                    const scaleY = canvas.height / canvasHeight;
                    
                    console.log('Scaling factors:', { 
                        originalWidth: canvasWidth, 
                        originalHeight: canvasHeight,
                        currentWidth: canvas.width,
                        currentHeight: canvas.height,
                        scaleX: scaleX,
                        scaleY: scaleY
                    });
                    
                    // Reset the coordinate system first to ensure clean state
                    coordSystem.resetView();
                    
                    // Scale the points based on the ratio of dimensions
                    paths = loadedPaths.map(path => 
                        path.map(point => ({
                            x: (point.x - 23) * scaleX, // WONTFIX: Added offset to x 
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
            
            redrawPaths();
        } catch (error) {
            console.error('Error parsing path data:', error);
            paths = [];
        }
    }
}

function handleTouchStart(e) {
    if (e.touches.length === 1) { 
        e.preventDefault();
        const touch = e.touches[0];
        startDrawing({ 
            clientX: touch.clientX, 
            clientY: touch.clientY, 
            preventDefault: () => {} 
        });
    }
}

function handleTouchMove(e) {
    if (e.touches.length === 1) { 
        e.preventDefault();
        const touch = e.touches[0];
        draw({ 
            clientX: touch.clientX, 
            clientY: touch.clientY, 
            preventDefault: () => {} 
        });
    }
}

function handleTouchEnd(e) {
    e.preventDefault();
    stopDrawing({ preventDefault: () => {} });
}

function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    coordSystem.updateTransform();
    redrawPaths();
}

function startDrawing(e) {
    e.preventDefault();
    isDrawing = true;
    const point = getPointFromEvent(e);
    currentPath = [point];
    redrawPaths();
}

function draw(e) {
    if (!isDrawing) {
      return;
    }
    e.preventDefault();
    const point = getPointFromEvent(e);
    currentPath.push(point);
    redrawPaths();
}

function stopDrawing(e) {
    if (!isDrawing) {
      return;
    }
    e.preventDefault();
    isDrawing = false;
    if (currentPath.length > 1) {
        paths.push(currentPath);
        updateHiddenInput();
    }
    currentPath = [];
}

function getPointFromEvent(e) {
    return coordSystem.getDrawCoords(e.clientX, e.clientY);
}

function redrawPaths() {
    coordSystem.clear();
    paths.forEach(path => {
        coordSystem.drawPath(path);
    });
    if (currentPath.length > 0) {
        coordSystem.drawPath(currentPath);
    }
}

function updateHiddenInput() {
    const input = document.getElementById('auto_path');
    const pathData = {
        paths: paths,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        timestamp: new Date().toISOString()
    };
    input.value = JSON.stringify(pathData);
}

function undoLastPath() {
    paths.pop();
    redrawPaths();
    updateHiddenInput();
}

function clearCanvas() {
    paths = [];
    currentPath = [];
    redrawPaths();
    updateHiddenInput();
}

function resetZoom() {
    coordSystem.resetView();
    redrawPaths();
}

function zoomIn(event) {
    if (!coordSystem) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    let mouseX, mouseY;
    
    if (event.touches) {
        mouseX = event.touches[0].clientX - rect.left;
        mouseY = event.touches[0].clientY - rect.top;
    } else if (event.clientX !== undefined) {
        mouseX = event.clientX - rect.left;
        mouseY = event.clientY - rect.top;
    } else {
        mouseX = rect.width / 2;
        mouseY = rect.height / 2;
    }
    
    coordSystem.zoom(mouseX, mouseY, 1.1);
    redrawPaths();
}

function zoomOut(event) {
    if (!coordSystem) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    let mouseX, mouseY;
    
    if (event.touches) {
        mouseX = event.touches[0].clientX - rect.left;
        mouseY = event.touches[0].clientY - rect.top;
    } else if (event.clientX !== undefined) {
        mouseX = event.clientX - rect.left;
        mouseY = event.clientY - rect.top;
    } else {
        mouseX = rect.width / 2;
        mouseY = rect.height / 2;
    }
    
    coordSystem.zoom(mouseX, mouseY, 0.9);
    redrawPaths();
}

// Single DOMContentLoaded event handler
document.addEventListener('DOMContentLoaded', function() {
    // Initialize canvas first
    initCanvas();

    // Auto-capitalize event code
    const eventCodeInput = document.querySelector('input[name="event_code"]');
    if (eventCodeInput) {
        eventCodeInput.addEventListener('input', function(e) {
            this.value = this.value.toUpperCase();
        });
    }

    // Form submission handler
    const form = document.getElementById('scoutingForm');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const teamNumber = form.querySelector('input[name="team_number"]').value;
            const eventCode = form.querySelector('input[name="event_code"]').value;
            const matchNumber = form.querySelector('input[name="match_number"]').value;
            const currentId = form.querySelector('input[name="current_id"]')?.value;

            try {
                const response = await fetch(`/scouting/check_team?team=${teamNumber}&event=${eventCode}&match=${matchNumber}&current_id=${currentId}`);
                const data = await response.json();
                
                if (data.exists) {
                    alert(`Team ${teamNumber} already exists in match ${matchNumber} for event ${eventCode}`);
                    return;
                }
                
                // Update the auto_path input before submitting
                updateHiddenInput();
                form.submit();
            } catch (error) {
                console.error('Error checking team:', error);
                form.submit();
            }
        });
    }
});
