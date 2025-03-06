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

document.addEventListener('DOMContentLoaded', function() {
    // Event code input handling
    const eventCodeInput = document.querySelector('input[name="event_code"]');
    if (eventCodeInput) {
        eventCodeInput.addEventListener('input', function(e) {
            this.value = this.value.toUpperCase();
        });
    }

    // Initialize CanvasField helper
    const CanvasField = new Canvas({
        canvas: document.getElementById('autoPath'),
        container: document.getElementById('autoPathContainer'),
        externalUpdateUIControls: updateUIControls,
        showStatus: (message) => {
            const flashContainer = document.querySelector('.container');
            if (!flashContainer) {
              return;
            }

            const messageDiv = document.createElement('div');
            messageDiv.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 sm:left-auto sm:right-6 sm:-translate-x-0 z-50 w-[90%] sm:w-full max-w-xl min-h-[60px] sm:min-h-[80px] mx-auto sm:mx-0 animate-fade-in-up';
            
            const innerDiv = document.createElement('div');
            innerDiv.className = 'flex items-center p-6 rounded-lg shadow-xl bg-green-50 text-green-800 border-2 border-green-200';
            
            const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            icon.setAttribute('class', 'w-6 h-6 mr-3 flex-shrink-0');
            icon.setAttribute('fill', 'currentColor');
            icon.setAttribute('viewBox', '0 0 20 20');
            
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('fill-rule', 'evenodd');
            path.setAttribute('d', 'M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z');
            path.setAttribute('clip-rule', 'evenodd');
            
            icon.appendChild(path);
            
            const text = document.createElement('p');
            text.className = 'text-base font-medium';
            text.textContent = message;
            
            const closeButton = document.createElement('button');
            closeButton.className = 'ml-auto -mx-1.5 -my-1.5 rounded-lg p-1.5 inline-flex h-8 w-8 text-green-500 hover:bg-green-100';
            closeButton.onclick = () => messageDiv.remove();
            
            const closeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            closeIcon.setAttribute('class', 'w-5 h-5');
            closeIcon.setAttribute('fill', 'currentColor');
            closeIcon.setAttribute('viewBox', '0 0 20 20');
            
            const closePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            closePath.setAttribute('fill-rule', 'evenodd');
            closePath.setAttribute('d', 'M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z');
            closePath.setAttribute('clip-rule', 'evenodd');
            
            closeIcon.appendChild(closePath);
            closeButton.appendChild(closeIcon);
            
            innerDiv.appendChild(icon);
            innerDiv.appendChild(text);
            innerDiv.appendChild(closeButton);
            messageDiv.appendChild(innerDiv);
            
            flashContainer.appendChild(messageDiv);
            
            setTimeout(() => {
                if (messageDiv.parentNode === flashContainer) {
                    messageDiv.remove();
                }
            }, 3000);
        },
        initialColor: '#2563eb',
        initialThickness: 3,
        maxPanDistance: 1000,
        backgroundImage: '/static/images/field-2025.png',
        readonly: false
    });

    // Verify background image loading
    const testImage = new Image();
    testImage.onload = () => {
        console.log('Background image loaded successfully');
        CanvasField.showStatus('Field image loaded');
    };
    testImage.onerror = () => {
        console.error('Failed to load background image');
        CanvasField.showStatus('Error loading field image');
    };
    testImage.src = '/static/images/field-2025.png';

    // Prevent page scrolling when using mouse wheel on canvas
    const canvas = document.getElementById('autoPath');
    canvas.addEventListener('wheel', (e) => {
        if (e.target === canvas && CanvasField.isPanning) {
            e.preventDefault();
        }
    }, { passive: false });

    // Prevent page scrolling when middle mouse button is pressed
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 1 && e.target === canvas) { // Middle mouse button
            e.preventDefault();
            CanvasField.startPanning(e);
        }
    });

    // Add mouseup handler for panning
    canvas.addEventListener('mouseup', (e) => {
        if (e.button === 1 && e.target === canvas) {
            CanvasField.stopPanning();
        }
    });

    // Configure Coloris
    Coloris({
        theme: 'polaroid',
        themeMode: 'light',
        alpha: false,
        formatToggle: false,
        swatches: [
            '#2563eb', // Default blue
            '#000000',
            '#ffffff',
            '#db4437',
            '#4285f4',
            '#0f9d58',
            '#ffeb3b',
            '#ff7f00'
        ]
    });

    // Tool buttons
    const toolButtons = {
        select: document.getElementById('selectTool'),
        pen: document.getElementById('penTool'),
        rectangle: document.getElementById('rectangleTool'),
        circle: document.getElementById('circleTool'),
        line: document.getElementById('lineTool'),
        arrow: document.getElementById('arrowTool'),
        hexagon: document.getElementById('hexagonTool'),
        star: document.getElementById('starTool')
    };

    // Function to update active tool button
    function updateActiveToolButton(activeTool) {
        Object.entries(toolButtons).forEach(([tool, button]) => {
            if (tool === activeTool) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    }

    // Add tool button event listeners
    Object.entries(toolButtons).forEach(([tool, button]) => {
        button.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent form submission
            CanvasField.setTool(tool);
            updateActiveToolButton(tool);
        });
    });

    // Color picker
    document.getElementById('pathColorPicker').addEventListener('change', function(e) {
        CanvasField.setColor(this.value);
    });
    
    // Thickness control
    const thicknessSlider = document.getElementById('pathThickness');
    const thicknessValue = document.getElementById('pathThicknessValue');
    
    thicknessSlider.addEventListener('input', function() {
        const {value} = this;
        thicknessValue.textContent = value;
        CanvasField.setThickness(parseInt(value));
    });

    // Fill toggle button
    const fillToggleBtn = document.getElementById('fillToggle');
    fillToggleBtn.addEventListener('click', function(e) {
        e.preventDefault(); // Prevent form submission
        const newFillState = !CanvasField.isFilled;
        CanvasField.setFill(newFillState);
        this.textContent = `Fill: ${newFillState ? 'On' : 'Off'}`;
        this.classList.toggle('bg-blue-800', newFillState);
    });

    // Function to update hidden path data
    function updatePathData() {
        const pathData = document.getElementById('autoPathData');
        if (pathData) {
            pathData.value = JSON.stringify(CanvasField.drawingHistory);
        }
    }

    // Add mouseup listener to update path data after drawing
    canvas.addEventListener('mouseup', updatePathData);
    
    // Undo button
    document.getElementById('undoPath').addEventListener('click', (e) => {
        e.preventDefault(); // Prevent form submission
        CanvasField.undo();
        updatePathData();
    });
    
    // Redo button
    document.getElementById('redoPath').addEventListener('click', (e) => {
        e.preventDefault(); // Prevent form submission
        CanvasField.redo();
        updatePathData();
    });
    
    // Clear button
    document.getElementById('clearPath').addEventListener('click', (e) => {
        e.preventDefault(); // Prevent form submission
        if (confirm('Are you sure you want to clear the path?')) {
            CanvasField.clear();
            updatePathData();
        }
    });

    // Save button
    document.getElementById('savePath').addEventListener('click', (e) => {
        e.preventDefault(); // Prevent form submission
        const jsonString = JSON.stringify(CanvasField.drawingHistory);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `autopath-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        CanvasField.showStatus('Path saved');
    });

    // Load button and file input
    const loadBtn = document.getElementById('loadPath');
    const loadFile = document.getElementById('loadFile');

    loadBtn.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent form submission
        loadFile.click();
    });

    // Reset view button
    document.getElementById('goHome').addEventListener('click', (e) => {
        e.preventDefault();
        CanvasField.resizeCanvas();
        CanvasField.resetView();
        CanvasField.redrawCanvas();
        CanvasField.showStatus('View reset to origin');
    });

    // Readonly toggle button
    const readonlyToggle = document.getElementById('readonlyToggle');
    readonlyToggle.addEventListener('click', (e) => {
        e.preventDefault();
        const newState = !CanvasField.readonly;
        CanvasField.setReadonly(newState);
        readonlyToggle.classList.toggle('bg-blue-800', newState);
        readonlyToggle.classList.toggle('text-white', newState);
    });

    loadFile.addEventListener('change', (e) => {
        if (e.target.files.length === 0) {
          return;
        }

        const file = e.target.files[0];
        const reader = new FileReader();

        reader.onload = function(event) {
            try {
                const pathData = JSON.parse(event.target.result);
                CanvasField.drawingHistory = pathData;
                CanvasField.redrawCanvas();
                updatePathData();
                CanvasField.showStatus('Path loaded');
            } catch (error) {
                console.error('Error loading path:', error);
                CanvasField.showStatus('Error loading path');
            }
        };

        reader.readAsText(file);
        e.target.value = null; // Reset file input
    });

    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
          return;
        }

        if (e.ctrlKey) {
            switch (e.key.toLowerCase()) {
                case 'a':
                    e.preventDefault();
                    e.stopPropagation();
                    CanvasField.setTool('select');
                    updateActiveToolButton('select');
                    break;
                case 'p':
                    e.preventDefault();
                    e.stopPropagation();
                    CanvasField.setTool('pen');
                    updateActiveToolButton('pen');
                    break;
                case 'r':
                    e.preventDefault();
                    e.stopPropagation();
                    CanvasField.setTool('rectangle');
                    updateActiveToolButton('rectangle');
                    break;
                case 'c':
                    e.preventDefault();
                    e.stopPropagation();
                    CanvasField.setTool('circle');
                    updateActiveToolButton('circle');
                    break;
                case 'l':
                    e.preventDefault();
                    e.stopPropagation();
                    CanvasField.setTool('line');
                    updateActiveToolButton('line');
                    break;
                case 'h':
                    e.preventDefault();
                    e.stopPropagation();
                    CanvasField.setTool('hexagon');
                    updateActiveToolButton('hexagon');
                    break;
                case 'w':
                    e.preventDefault();
                    e.stopPropagation();
                    CanvasField.setTool('arrow');
                    updateActiveToolButton('arrow');
                    break;
                case 's':
                    if (!e.shiftKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        CanvasField.setTool('star');
                        updateActiveToolButton('star');
                    }
                    break;
                case 'z':
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.shiftKey) {
                                            CanvasField.redo();
                                        }
                    else if (!e.repeat) {  // Only trigger once when key is first pressed
                                                CanvasField.undo();
                                            }
                    updatePathData();
                    break;
                case 'y':
                    e.preventDefault();
                    e.stopPropagation();
                    CanvasField.redo();
                    updatePathData();
                    break;
                case 'f':
                    e.preventDefault();
                    e.stopPropagation();
                    fillToggleBtn.click();
                    break;
            }
        }
    });

    // Form submission handling
    const form = document.getElementById('scoutingForm');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // Update path data before submission
            updatePathData();
            
            const teamNumber = teamSelect.value;
            const eventCode = eventSelect.value;
            const matchNumber = matchSelect.value;
            const alliance = allianceInput.value;

            if (!teamNumber || !eventCode || !matchNumber || !alliance) {
                alert('Please fill in all required fields');
                return;
            }

            // Check if we're offline
            if (!navigator.onLine) {
                try {
                    // Create a FormData object from the form
                    const formData = new FormData(form);
                    
                    // Add form URL
                    const formUrl = form.action || window.location.href;
                    
                    // Use the offline storage utility to store the data
                    await storeScoutingData(formData, formUrl);
                    
                    // Show success message
                    const container = document.querySelector('.container');
                    if (container) {
                        const notification = document.createElement('div');
                        notification.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 sm:left-auto sm:right-6 sm:-translate-x-0 z-50 w-[90%] sm:w-full max-w-xl min-h-[60px] sm:min-h-[80px] mx-auto sm:mx-0 animate-fade-in-up';
                        
                        notification.innerHTML = `
                            <div class="flex items-center p-6 rounded-lg shadow-xl bg-yellow-50 text-yellow-800 border-2 border-yellow-200">
                                <svg class="w-6 h-6 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
                                </svg>
                                <p class="text-base font-medium">
                                    You're offline. Data saved locally and will sync when you're back online.
                                </p>
                                <button class="ml-auto -mx-1.5 -my-1.5 rounded-lg p-1.5 inline-flex h-8 w-8 text-yellow-500 hover:bg-yellow-100" onclick="this.parentNode.parentNode.remove()">
                                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                                    </svg>
                                </button>
                            </div>
                        `;
                        
                        container.appendChild(notification);
                        
                        setTimeout(() => {
                            if (notification.parentNode === container) {
                                notification.remove();
                            }
                        }, 5000);
                    }
                    
                    // Reset form for next entry
                    resetForm();
                    
                    return;
                } catch (error) {
                    console.error('Error saving offline data:', error);
                    alert('Error saving data offline. Please try again.');
                    return;
                }
            }

            try {
                // Try to check if the team already exists in this match
                // This might fail if we're online but the server is unreachable
                let isDuplicate = false;
                try {
                    const response = await fetch(`/scouting/check_team?team=${teamNumber}&event=${eventCode}&match=${matchNumber}`);
                    const data = await response.json();
                    isDuplicate = data.exists;
                } catch (checkError) {
                    console.warn('Error checking for duplicate team:', checkError);
                    // Continue with submission if we can't check for duplicates
                }
                
                if (isDuplicate) {
                    alert(`Team ${teamNumber} already exists in match ${matchNumber} for event ${eventCode}`);
                    return;
                }
                
                // If we got here, we're online and the team isn't a duplicate
                // Submit the form normally
                form.submit();
            } catch (error) {
                console.error('Error submitting form:', error);
                
                // If we have a network error during submission, try offline mode
                if (!navigator.onLine || error.message === 'OFFLINE_ERROR' || error.message.includes('network')) {
                    try {
                        const formData = new FormData(form);
                        const formUrl = form.action || window.location.href;
                        await storeScoutingData(formData, formUrl);
                        
                        // Show success message for offline storage
                        alert('You appear to be offline. Data saved locally and will sync when you reconnect.');
                        resetForm();
                    } catch (offlineError) {
                        console.error('Error saving offline:', offlineError);
                        alert('Error saving data. Please try again later.');
                    }
                } else {
                    // Some other error occurred
                    alert('Error submitting data. Please try again.');
                }
            }
        });
    }

    // Function to reset form after successful submission
    function resetForm() {
        // Reset canvas
        CanvasField.clear();
        
        // Reset form values that should be reset
        // Keep event and match selections for convenience
        document.getElementById('auto_crossed').checked = false;
        document.getElementById('auto_ampNotes').value = '';
        document.getElementById('auto_speakerNotes').value = '';
        document.getElementById('teleop_ampNotes').value = '';
        document.getElementById('teleop_ampScored').value = '';
        document.getElementById('teleop_speakerNotes').value = '';
        document.getElementById('teleop_speakerScored').value = '';
        document.getElementById('teleop_trapScored').value = '';
        document.getElementById('teleop_coopertition').checked = false;
        document.getElementById('endgame_climb').value = 'none';
        document.getElementById('harmony').checked = false;
        document.getElementById('spotlight').checked = false;
        document.getElementById('melody').checked = false;
        document.getElementById('ensemble').checked = false;
        document.getElementById('solo').checked = false;
        document.getElementById('defense_rating').value = '0';
        document.getElementById('notes').value = '';
        
        // Optionally scroll back to top
        window.scrollTo(0, 0);
    }

    // TBA Integration
    const eventSelect = document.getElementById('event_select');
    const matchSelect = document.getElementById('match_select');
    const teamSelect = document.getElementById('team_select');
    const allianceInput = document.getElementById('alliance_color');

    let currentMatches = null;
    const eventMatches = JSON.parse(document.getElementById('event_matches').textContent);

    // Load events from server-side data
    const events = JSON.parse(document.getElementById('events').textContent);
    const sortedEvents = Object.entries(events)
        .sort((a, b) => a[1].start_date.localeCompare(b[1].start_date));
    
    sortedEvents.forEach(([name, data]) => {
        const option = document.createElement('option');
        option.value = name;  // Use event name as value for the server
        option.dataset.key = data.key;  // Store TBA key in dataset for API calls
        option.textContent = `${name} (${data.start_date})`;
        eventSelect.appendChild(option);
    });

    // Load matches when event is selected
    eventSelect.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        const selectedEventKey = selectedOption?.dataset.key;
        matchSelect.innerHTML = '<option value="">Select Match</option>';
        teamSelect.innerHTML = '<option value="">Select Team</option>';
        allianceInput.value = '';

        if (!selectedEventKey) {
          return;
        }

        // Use pre-loaded matches data
        const matches = eventMatches[selectedEventKey];
        if (!matches) {
          return;
        }
        
        currentMatches = matches;
        const sortedMatches = Object.keys(matches)
            .sort((a, b) => parseInt(a) - parseInt(b));
        
        sortedMatches.forEach(matchNum => {
            const option = document.createElement('option');
            option.value = matchNum;
            option.textContent = `Match ${matchNum}`;
            matchSelect.appendChild(option);
        });
    });

    // Load teams when match is selected
    matchSelect.addEventListener('change', function() {
        const selectedMatch = this.value;
        teamSelect.innerHTML = '<option value="">Select Team</option>';
        allianceInput.value = '';

        if (!selectedMatch || !currentMatches) {
          return;
        }

        const match = currentMatches[selectedMatch];
        if (!match) {
          return;
        }

        // Add red alliance teams
        const redGroup = document.createElement('optgroup');
        redGroup.label = 'Red Alliance';
        match.red.forEach(team => {
            const option = document.createElement('option');
            const teamNumber = team.replace('frc', '');
            option.value = teamNumber;
            option.textContent = `Team ${teamNumber}`;
            option.dataset.alliance = 'red';
            redGroup.appendChild(option);
        });
        teamSelect.appendChild(redGroup);

        // Add blue alliance teams
        const blueGroup = document.createElement('optgroup');
        blueGroup.label = 'Blue Alliance';
        match.blue.forEach(team => {
            const option = document.createElement('option');
            const teamNumber = team.replace('frc', '');
            option.value = teamNumber;
            option.textContent = `Team ${teamNumber}`;
            option.dataset.alliance = 'blue';
            blueGroup.appendChild(option);
        });
        teamSelect.appendChild(blueGroup);
    });

    // Set alliance color when team is selected
    teamSelect.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        if (selectedOption && selectedOption.dataset.alliance) {
            allianceInput.value = selectedOption.dataset.alliance;
            
            // Optional: Add visual feedback of selected alliance
            this.classList.remove('border-red-500', 'border-blue-500');
            this.classList.add(`border-${selectedOption.dataset.alliance}-500`);
        } else {
            allianceInput.value = '';
            this.classList.remove('border-red-500', 'border-blue-500');
        }
    });
});

// Update the updateUIControls method to be more specific
function updateUIControls(color, thickness) {
    if (color) {
        // Update color picker if it exists
        const colorPicker = document.querySelector('input[name="pathColorPicker"]');
        if (colorPicker) {
            colorPicker.value = color;
            // Update Coloris
            Coloris.setInstance('#pathColorPicker', { value: color });
        }
    }

    if (thickness) {
        // Update thickness slider if it exists - be more specific with the selector
        const thicknessSlider = document.getElementById('pathThickness');
        const thicknessDisplay = document.getElementById('pathThicknessValue');
        if (thicknessSlider) {
            thicknessSlider.value = thickness;
            if (thicknessDisplay) {
                thicknessDisplay.textContent = thickness;
            }
        }
    }
}