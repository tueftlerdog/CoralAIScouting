const updateMatchResult = () => {
    const allianceScore = parseInt(allianceScoreInput.value) || 0;
    const opponentScore = parseInt(opponentScoreInput.value) || 0;
    
    if (allianceScore > opponentScore) {
        matchResultInput.value = 'won';
    } else if (allianceScore < opponentScore) {
        matchResultInput.value = 'lost';
    } else {
        matchResultInput.value = 'tie';
    }
};

let canvas, coordSystem;
let isDrawing = false;
let currentPath = [];
let paths = [];

function initCanvas() {
    canvas = document.getElementById('autoPath');
    if (!canvas) {
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
    
    if (event.touches) { // Touch event
        mouseX = event.touches[0].clientX - rect.left;
        mouseY = event.touches[0].clientY - rect.top;
    } else if (event.clientX !== undefined) { // Mouse event
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

document.addEventListener('DOMContentLoaded', function() {
    initCanvas();

    const eventCodeInput = document.querySelector('input[name="event_code"]');
    if (eventCodeInput) {
        eventCodeInput.addEventListener('input', function(e) {
            this.value = this.value.toUpperCase();
        });
    }

    const allianceScoreInput = document.querySelector('input[name="alliance_score"]');
    const opponentScoreInput = document.querySelector('input[name="opponent_score"]');

    allianceScoreInput.addEventListener('input', updateMatchResult);
    opponentScoreInput.addEventListener('input', updateMatchResult);
    updateMatchResult();

    const form = document.getElementById('scoutingForm');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const teamNumber = form.querySelector('input[name="team_number"]').value;
            const eventCode = form.querySelector('input[name="event_code"]').value;
            const matchNumber = form.querySelector('input[name="match_number"]').value;

            // Initialize auto_path with empty array if not set
            const autoPathInput = form.querySelector('input[name="auto_path"]');
            if (!autoPathInput.value) {
                autoPathInput.value = JSON.stringify([]);
            }

            try {
                const response = await fetch(`/scouting/check_team?team=${teamNumber}&event=${eventCode}&match=${matchNumber}`);
                const data = await response.json();
                
                if (data.exists) {
                    alert(`Team ${teamNumber} already exists in match ${matchNumber} for event ${eventCode}`);
                    return;
                }
                
                form.submit();
            } catch (error) {
                form.submit();
            }
        });
    }
});
