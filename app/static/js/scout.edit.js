document.addEventListener('DOMContentLoaded', function() {
    // Auto-capitalize event code
    const eventCodeInput = document.querySelector('input[name="event_code"]');
    eventCodeInput.addEventListener('input', function(e) {
        this.value = this.value.toUpperCase();
    });

    // Calculate total points in real-time
    const updateTotal = () => {
        const coralPoints = [1, 2, 3, 4].reduce((sum, level) => {
            return sum + (parseInt(document.querySelector(`input[name="coral_level${level}"]`).value) || 0) * level;
        }, 0);
        
        const algaeNet = (parseInt(document.querySelector('input[name="algae_net"]').value) || 0) * 2;
        const algaeProcessor = (parseInt(document.querySelector('input[name="algae_processor"]').value) || 0) * 3;
        const humanPlayerPoints = (parseInt(document.querySelector('input[name="human_player"]').value) || 0) * 2;
        
        const climbType = document.querySelector('select[name="climb_type"]').value;
        const climbSuccess = document.querySelector('input[name="climb_success"]').checked;
        let climbPoints = 0;
        if (climbSuccess) {
            switch(climbType) {
                case 'shallow': climbPoints = 3; break;
                case 'deep': climbPoints = 5; break;
                case 'park': climbPoints = 1; break;
            }
        }
        
        const total = coralPoints + algaeNet + algaeProcessor + humanPlayerPoints + climbPoints;
        document.getElementById('totalPoints').textContent = total;
    };

    // Add event listeners for all scoring inputs
    document.querySelectorAll('input[type="number"], input[type="checkbox"], select[name="climb_type"]')
        .forEach(input => input.addEventListener('input', updateTotal));

    // Initialize total
    updateTotal();

    // Add form submission handler with team check
    const form = document.getElementById('scoutingForm');
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const teamNumber = form.querySelector('input[name="team_number"]').value;
        const eventCode = form.querySelector('input[name="event_code"]').value;
        const matchNumber = form.querySelector('input[name="match_number"]').value;
        const currentId = '{{ team_data._id }}';

        // Check if team already exists in this match (excluding current entry)
        try {
            const response = await fetch(`/scouting/check_team?team=${teamNumber}&event=${eventCode}&match=${matchNumber}&current_id=${currentId}`);
            const data = await response.json();
            
            if (data.exists) {
                alert(`Team ${teamNumber} already exists in match ${matchNumber} for event ${eventCode}`);
                return;
            }
            
            // If team doesn't exist or it's the same entry, submit the form
            form.submit();
        } catch (error) {
            console.error('Error checking team:', error);
            // If check fails, allow form submission
            form.submit();
        }
    });
});

const canvas = document.getElementById('autoPath');
const ctx = canvas.getContext('2d');
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let bgImage = new Image();
let mobileRedImage = new Image();
let mobileBlueImage = new Image();
let pathHistory = [];
let currentPath = [];
let imageScale = 1;
let imageOffset = { x: 0, y: 0 };

function loadImages() {
    bgImage.src = "/static/images/field-2025.png";
    mobileRedImage.src = "/static/images/red-field-2025.png";
    mobileBlueImage.src = "/static/images/blue-field-2025.png";
}

function resizeCanvas() {
    const container = canvas.parentElement;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    // Set canvas size to match container
    canvas.style.width = containerWidth + 'px';
    canvas.style.height = containerHeight + 'px';
    
    // Set actual canvas dimensions
    canvas.width = containerWidth * window.devicePixelRatio;
    canvas.height = containerHeight * window.devicePixelRatio;
    
    // Scale context to match device pixel ratio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    // Draw background and redraw paths
    drawBackground();
    redrawPaths();
}

function drawBackground() {
    if (!bgImage.complete) {
      return;
    }
    
    const canvasWidth = canvas.width / window.devicePixelRatio;
    const canvasHeight = canvas.height / window.devicePixelRatio;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const isMobile = window.innerWidth < 768;
    const isRedAlliance = document.querySelector('input[name="alliance"][value="red"]').checked;
    
    if (isMobile) {
        // Use the pre-split field images for mobile
        const mobileImage = isRedAlliance ? mobileRedImage : mobileBlueImage;
        if (!mobileImage.complete) {
          return;
        }
        
        imageScale = Math.min(
            canvasWidth / mobileImage.width,
            canvasHeight / mobileImage.height
        );
        
        const scaledWidth = mobileImage.width * imageScale;
        const scaledHeight = mobileImage.height * imageScale;
        
        imageOffset.x = (canvasWidth - scaledWidth) / 2;
        imageOffset.y = (canvasHeight - scaledHeight) / 2;
        
        ctx.drawImage(
            mobileImage,
            imageOffset.x, imageOffset.y, scaledWidth, scaledHeight
        );
    } else {
        // Desktop view - show full field
        imageScale = Math.min(
            canvasWidth / bgImage.width,
            canvasHeight / bgImage.height
        );
        
        const scaledWidth = bgImage.width * imageScale;
        const scaledHeight = bgImage.height * imageScale;
        
        imageOffset.x = (canvasWidth - scaledWidth) / 2;
        imageOffset.y = (canvasHeight - scaledHeight) / 2;
        
        ctx.drawImage(
            bgImage,
            imageOffset.x, imageOffset.y, scaledWidth, scaledHeight
        );
    }
}

function getPointerPosition(e) {
    const rect = canvas.getBoundingClientRect();
    // Get raw coordinates relative to canvas, accounting for device pixel ratio
    return {
        x: ((e.touches ? e.touches[0].clientX : e.clientX) - rect.left),
        y: ((e.touches ? e.touches[0].clientY : e.clientY) - rect.top)
    };
}

function normalizeCoordinate(coord, isX = true) {
    // Convert screen coordinate to normalized coordinate (0-1 range)
    const rect = canvas.getBoundingClientRect();
    if (isX) {
        return (coord - imageOffset.x) / (bgImage.width * imageScale);
    }
    return (coord - imageOffset.y) / (bgImage.height * imageScale);
}

function denormalizeCoordinate(coord, isX = true) {
    // Convert normalized coordinate back to screen coordinate
    if (isX) {
        return (coord * bgImage.width * imageScale) + imageOffset.x;
    }
    return (coord * bgImage.height * imageScale) + imageOffset.y;
}

function startDrawing(e) {
    e.preventDefault();
    isDrawing = true;
    const pos = getPointerPosition(e);
    lastX = pos.x;
    lastY = pos.y;
    currentPath = [{
        x: normalizeCoordinate(pos.x, true),
        y: normalizeCoordinate(pos.y, false)
    }];
}

function draw(e) {
    e.preventDefault();
    if (!isDrawing) {
      return;
    }
    
    const pos = getPointerPosition(e);
    
    // Draw on screen
    ctx.beginPath();
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    
    // Store normalized coordinates
    currentPath.push({
        x: normalizeCoordinate(pos.x, true),
        y: normalizeCoordinate(pos.y, false)
    });
    
    lastX = pos.x;
    lastY = pos.y;
    
    // Store the path data
    updatePathData();
}

function stopDrawing() {
    if (isDrawing) {
        isDrawing = false;
        if (currentPath.length > 1) {
            pathHistory.push(currentPath);
        }
        currentPath = [];
    }
}

function undoLastPath() {
    if (pathHistory.length > 0) {
        pathHistory.pop();
        redrawPaths();
    }
}

function redrawPaths() {
    drawBackground();
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    
    // Draw all paths using denormalized coordinates
    pathHistory.forEach(path => {
        if (path.length > 1) {
            ctx.beginPath();
            
            // Convert first point
            const startX = denormalizeCoordinate(path[0].x, true);
            const startY = denormalizeCoordinate(path[0].y, false);
            ctx.moveTo(startX, startY);
            
            // Convert and draw remaining points
            for (let i = 1; i < path.length; i++) {
                const x = denormalizeCoordinate(path[i].x, true);
                const y = denormalizeCoordinate(path[i].y, false);
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    });
    
    updatePathData();
}

function clearCanvas() {
    pathHistory = [];
    currentPath = [];
    // Reset to original field background
    bgImage.src = "/static/images/field-2025.png";
    document.getElementById('autoPathData').value = '';
}

function loadExistingPath(pathData) {
    if (!pathData || pathData === "None") {
        console.log('No valid path data to load');
        return;
    }
    
    try {
        const data = JSON.parse(pathData);
        pathHistory = data.points || [];
        
        // Set alliance if it exists in the data
        if (data.alliance) {
            const allianceInput = document.querySelector(`input[name="alliance"][value="${data.alliance}"]`);
            if (allianceInput) {
              allianceInput.checked = true;
            }
        }
        
        redrawPaths();
    } catch (error) {
        console.error('Failed to load path data:', error);
    }
}

function updatePathData() {
    // Store the normalized path data as JSON
    const pathData = {
        points: pathHistory.concat(currentPath.length > 0 ? [currentPath] : []),
        alliance: document.querySelector('input[name="alliance"]:checked').value
    };
    document.getElementById('autoPathData').value = JSON.stringify(pathData);
}

// Event listeners
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseleave', stopDrawing);

canvas.addEventListener('touchstart', startDrawing);
canvas.addEventListener('touchmove', draw);
canvas.addEventListener('touchend', stopDrawing);
canvas.addEventListener('touchcancel', stopDrawing);

// Prevent scrolling while drawing
canvas.addEventListener('touchstart', e => e.preventDefault());
canvas.addEventListener('touchmove', e => e.preventDefault());

// Initialize
window.addEventListener('load', () => {
    loadImages();
    
    // Load existing path if available
    const existingPathData = document.getElementById('autoPathData').value;
    if (existingPathData && existingPathData !== "None") {
        bgImage.onload = () => {
            resizeCanvas();
            loadExistingPath(existingPathData);
        };
    }
    
    mobileRedImage.onload = resizeCanvas;
    mobileBlueImage.onload = resizeCanvas;
});
window.addEventListener('resize', () => {
    resizeCanvas();
});

// Add listener for alliance selection change
document.querySelectorAll('input[name="alliance"]').forEach(radio => {  
    radio.addEventListener('change', () => {
        clearCanvas();  // Clear existing paths when alliance changes
    });
});