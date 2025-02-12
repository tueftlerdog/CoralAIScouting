class CanvasCoordinateSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.container = document.getElementById('canvasContainer');
        this.ctx = canvas.getContext('2d');
        this.zoomLevel = 1.0;
        this.standardZoom = 1.0;
        this.minZoom = 0.5;
        this.maxZoom = 3.0;
        
        // Initialize
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        this.resetView();
        this.setupEventListeners();
    }

    resizeCanvas() {
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }

    setupEventListeners() {
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const zoomFactor = e.deltaY < 0 ? 1.02 : 0.98;
            this.zoom(mouseX, mouseY, zoomFactor);
        }, { passive: false });

        let initialDistance = 0;
        let initialZoom = 1;
        let isPinching = false;

        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                isPinching = true;
                initialDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                initialZoom = this.zoomLevel;
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && isPinching) {
                e.preventDefault();
                const currentDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );

                const scale = currentDistance / initialDistance;
                const dampedScale = scale > 1 ? 
                    1 + (scale - 1) * 0.1 :
                    1 - (1 - scale) * 0.1;
                
                const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                const rect = this.canvas.getBoundingClientRect();
                
                this.zoom(midX - rect.left, midY - rect.top, dampedScale);
            }
        }, { passive: false });

        this.canvas.addEventListener('touchend', () => {
            isPinching = false;
        });
    }

    resetView() {
        this.zoomLevel = this.standardZoom;
        this.updateTransform();
        // Update zoom level display on reset
        const zoomLevelElement = document.getElementById('zoomLevel');
        if (zoomLevelElement) {
            zoomLevelElement.textContent = `${Math.round(this.zoomLevel * 100)}%`;
        }
    }

    updateTransform() {
        this.container.style.transformOrigin = `${this.originX}px ${this.originY}px`;
        this.container.style.transform = `scale(${this.zoomLevel})`;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawPath(points, color = 'red', width = 2) {
        if (!points || points.length < 2) return;

        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        
        for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x, points[i].y);
        }

        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        this.ctx.stroke();
    }

    zoom(mouseX, mouseY, factor) {
        const newZoom = this.zoomLevel * factor;
        
        if (newZoom >= this.minZoom && newZoom <= this.maxZoom) {
            // Calculate the position relative to the container
            const containerRect = this.container.getBoundingClientRect();
            const relativeX = mouseX / containerRect.width;
            const relativeY = mouseY / containerRect.height;
            
            this.zoomLevel = newZoom;
            
            // Set transform origin as percentage values
            this.container.style.transformOrigin = `${relativeX * 100}% ${relativeY * 100}%`;
            this.container.style.transform = `scale(${this.zoomLevel})`;

            // Update zoom level display
            const zoomLevelElement = document.getElementById('zoomLevel');
            if (zoomLevelElement) {
                zoomLevelElement.textContent = `${Math.round(this.zoomLevel * 100)}%`;
            }
        }
    }

    getDrawCoords(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) / this.zoomLevel,
            y: (clientY - rect.top) / this.zoomLevel
        };
    }
} 