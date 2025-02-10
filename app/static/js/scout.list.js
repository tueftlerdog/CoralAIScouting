// Global variables
let canvas, ctx, bgImage, mobileRedImage, mobileBlueImage, imageScale;
let filterType, searchInput, eventSections;

// Initialize images right away
bgImage = new Image();
mobileRedImage = new Image();
mobileBlueImage = new Image();

bgImage.src = "/static/images/field-2025.png";
mobileRedImage.src = "/static/images/red-field-2025.png";
mobileBlueImage.src = "/static/images/blue-field-2025.png";

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

    // Initialize canvas when page loads
    initializeCanvas();
    
    // Add window resize listener
    window.addEventListener('resize', resizeCanvas);
});

function initializeCanvas() {
    canvas = document.getElementById('modalAutoPath');
    if (!canvas) {
      return;
    }
    
    ctx = canvas.getContext('2d');
    resizeCanvas();
}

function resizeCanvas() {
    if (!canvas || !ctx) {
      return;
    }
    
    const container = canvas.parentElement;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    canvas.style.width = containerWidth + 'px';
    canvas.style.height = containerHeight + 'px';
    
    canvas.width = containerWidth * window.devicePixelRatio;
    canvas.height = containerHeight * window.devicePixelRatio;
    
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

function drawPath(pathData, deviceType) {
    if (!canvas || !ctx) {
      return;
    }
    
    const currentIsMobile = window.innerWidth < 768;
    const alliance = pathData.alliance || 'red';
    const points = pathData.points || [];
    
    // Choose the appropriate background image
    const image = currentIsMobile ? 
        (alliance === 'red' ? mobileRedImage : mobileBlueImage) : 
        bgImage;
    
    // Wait for image to load
    if (!image.complete) {
        image.onload = () => drawPath(pathData, deviceType);
        return;
    }
    
    // Calculate scaling factors and offsets
    const canvasWidth = canvas.width / window.devicePixelRatio;
    const canvasHeight = canvas.height / window.devicePixelRatio;
    
    imageScale = Math.min(
        canvasWidth / image.width,
        canvasHeight / image.height
    );
    
    const scaledWidth = image.width * imageScale;
    const scaledHeight = image.height * imageScale;
    
    const offsetX = (canvasWidth - scaledWidth) / 2;
    const offsetY = (canvasHeight - scaledHeight) / 2;
    
    // Clear and draw background
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.drawImage(image, offsetX, offsetY, scaledWidth, scaledHeight);
    
    // Draw paths
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    
    // Draw all paths using denormalized coordinates
    points.forEach(path => {
        if (path && path.length > 1) {
            ctx.beginPath();
            
            // Convert first point
            const startX = (path[0].x * image.width * imageScale) + offsetX;
            const startY = (path[0].y * image.height * imageScale) + offsetY;
            ctx.moveTo(startX, startY);
            
            // Convert and draw remaining points
            for (let i = 1; i < path.length; i++) {
                const x = (path[i].x * image.width * imageScale) + offsetX;
                const y = (path[i].y * image.height * imageScale) + offsetY;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    });
}

function showAutoPath(pathData, autoNotes, deviceType) {
    // Ensure pathData is an object
    let pathObj = pathData;
    if (typeof pathData === 'string') {
        try {
            pathObj = JSON.parse(pathData);
        } catch (error) {
            console.error('Failed to parse path data:', error);
            return;
        }
    }
    
    // Show the modal
    const modal = document.getElementById('autoPathModal');
    modal.classList.remove('hidden');
    
    // Initialize canvas if not already done
    if (!canvas) {
        initializeCanvas();
    }
    
    // Update auto notes
    const notesElement = document.getElementById('modalAutoNotes');
    notesElement.textContent = autoNotes || 'No notes available';
    
    // Resize canvas and draw path
    resizeCanvas();
    
    // Ensure pathData has the expected structure
    if (!pathObj || !pathObj.points) {
        console.error('Invalid path data structure');
        return;
    }
    
    // Draw the path
    drawPath(pathObj, deviceType);
}

function closeAutoPathModal() {
    const modal = document.getElementById('autoPathModal');
    modal.classList.add('hidden');
}

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