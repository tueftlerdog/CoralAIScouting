document.addEventListener('DOMContentLoaded', function() {
    // Auto-capitalize event code
    const eventCodeInput = document.querySelector('input[name="event_code"]');
    eventCodeInput.addEventListener('input', function(e) {
        this.value = this.value.toUpperCase();
    });

    // Calculate total points in real-time
    function updateTotal() {
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
    }

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
let pathHistory = [];
let currentPath = [];

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
    
    // Draw background after resize
    drawBackground();
}

function drawBackground() {
    if (!bgImage.complete) return; // Wait for image to load
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Calculate scaling to fit while maintaining aspect ratio
    const scale = Math.min(
        canvas.width / bgImage.width,
        canvas.height / bgImage.height
    );
    
    // Calculate position to center the image
    const x = (canvas.width - bgImage.width * scale) / 2;
    const y = (canvas.height - bgImage.height * scale) / 2;
    
    // Draw background
    ctx.drawImage(bgImage, x, y, bgImage.width * scale, bgImage.height * scale);
}

// Load existing path if available
const existingPath = document.getElementById('autoPathData').value;
if (existingPath) {
    const img = new Image();
    img.onload = function() {
        ctx.drawImage(img, 0, 0);
    }
    img.src = existingPath;
}

canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

function startDrawing(e) {
    e.preventDefault();
    isDrawing = true;
    const pos = getPointerPosition(e);
    lastX = pos.x;
    lastY = pos.y;
    currentPath = [];
    currentPath.push({ x: lastX, y: lastY });
}

function draw(e) {
    e.preventDefault();
    if (!isDrawing) return;
    
    const pos = getPointerPosition(e);
    ctx.beginPath();
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    
    currentPath.push({ x: pos.x, y: pos.y });
    lastX = pos.x;
    lastY = pos.y;
    
    document.getElementById('autoPathData').value = canvas.toDataURL();
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
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    
    pathHistory.forEach(path => {
        if (path.length > 1) {
            ctx.beginPath();
            ctx.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i++) {
                ctx.lineTo(path[i].x, path[i].y);
            }
            ctx.stroke();
        }
    });
    
    document.getElementById('autoPathData').value = canvas.toDataURL();
}

function clearCanvas() {
    drawBackground();
    pathHistory = [];
    document.getElementById('autoPathData').value = '';
}

// Initialize
window.addEventListener('load', () => {
    bgImage.onload = () => {
        resizeCanvas();
        // Load existing path after background is drawn
        const existingPath = document.getElementById('autoPathData').value;
        if (existingPath) {
            const pathImage = new Image();
            pathImage.onload = function() {
                ctx.drawImage(pathImage, 0, 0, canvas.width, canvas.height);
            }
            pathImage.src = existingPath;
        }
    };
    bgImage.src = "{{ url_for('static', filename='images/field-2025.png') }}";
});
window.addEventListener('resize', resizeCanvas);