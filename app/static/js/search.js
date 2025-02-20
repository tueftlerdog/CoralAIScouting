let modalCanvas, modalCoordSystem;
let currentPathData = null;
let searchInput;
let selectedTeamInfo;

function initializeCanvas() {
    modalCanvas = document.getElementById('modalAutoPathCanvas');
    if (modalCanvas) {
        modalCanvas.width = 500;
        modalCanvas.height = 500;
        modalCoordSystem = new CanvasCoordinateSystem(modalCanvas);
        window.addEventListener('resize', resizeModalCanvas);
    }
}

function showAutoPath(pathData, autoNotes = '') {
    currentPathData = pathData;
    
    const modal = document.getElementById('autoPathModal');
    modal.classList.remove('hidden');
    
    if (!modalCanvas) {
        modalCanvas = document.getElementById('modalAutoPathCanvas');
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

function closeAutoPathModal() {
    const modal = document.getElementById('autoPathModal');
    modal.classList.add('hidden');
    if (modalCoordSystem) {
        modalCoordSystem.resetView();
    }
}

const init = (inputElement, teamInfoElement) => {
    if (!inputElement || !teamInfoElement) {
        console.error('Required elements not found');
        return;
    }
    searchInput = inputElement;
    selectedTeamInfo = teamInfoElement;
    searchInput.addEventListener('input', handleSearchInput);
};

const handleSearchInput = (event) => {
    clearTimeout(debounceTimer);
    const query = event.target.value.trim();
    if (!searchInput || !selectedTeamInfo) {
        return;
    }
    if (query === '') {
        selectedTeamInfo.classList.add('hidden');
        return;
    }
    debounceTimer = setTimeout(() => performSearch(query), 300);
};

const performSearch = async (query) => {
    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        const data = JSON.parse(text);
        
        if (Array.isArray(data) && data.length > 0) {
            displayTeamInfo(data[0]);
        } else {
            selectedTeamInfo.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error:', error);
        selectedTeamInfo.classList.add('hidden');
    }
};

const createPathCell = (entry) => {
    const pathCell = document.createElement('td');
    pathCell.className = 'px-6 py-4 whitespace-nowrap';
    
    if (entry.auto_path && entry.auto_path.length > 0) {
        const pathButton = document.createElement('button');
        pathButton.className = 'text-blue-600 hover:text-blue-900';
        pathButton.textContent = 'View Path';
        pathButton.addEventListener('click', () => {
            showAutoPath(entry.auto_path, entry.auto_notes);
        });
        pathCell.appendChild(pathButton);
    } else {
        const noPath = document.createElement('span');
        noPath.className = 'text-gray-400';
        noPath.textContent = 'No path';
        pathCell.appendChild(noPath);
    }
    
    return pathCell;
};

const displayTeamInfo = (team) => {
    // Update basic team info
    document.getElementById('team-number').textContent = team.team_number;
    document.getElementById('nickname').textContent = team.nickname || 'N/A';
    document.getElementById('school').textContent = team.school_name || 'N/A';
    
    const location = [team.city, team.state_prov, team.country]
        .filter(Boolean)
        .join(', ');
    document.getElementById('location').textContent = location || 'N/A';

    // Update team profile link visibility
    const teamProfileContainer = document.getElementById('team-profile-container');
    const teamProfileLink = document.getElementById('team-profile-link');
    
    if (team.has_team_page) {
        teamProfileContainer.classList.remove('hidden');
        teamProfileLink.href = `/team/view/${team.team_number}`;
    } else {
        teamProfileContainer.classList.add('hidden');
    }

    // Update scouting data table
    const scoutingTableBody = document.getElementById('scouting-data');
    scoutingTableBody.innerHTML = '';

    if (team.scouting_data && team.scouting_data.length > 0) {
        team.scouting_data.forEach(entry => {
            const row = document.createElement('tr');
            
            const createCell = (content) => {
                const td = document.createElement('td');
                td.className = 'px-6 py-4 whitespace-nowrap';
                if (typeof content === 'string' || typeof content === 'number') {
                    td.textContent = content;
                } else {
                    td.appendChild(content);
                }
                return td;
            };

            // Format scores
            const autoCoral = `${entry.auto_coral_level1}/${entry.auto_coral_level2}/${entry.auto_coral_level3}/${entry.auto_coral_level4}`;
            const teleopCoral = `${entry.teleop_coral_level1}/${entry.teleop_coral_level2}/${entry.teleop_coral_level3}/${entry.teleop_coral_level4}`;
            const autoAlgae = `${entry.auto_algae_net}/${entry.auto_algae_processor}`;
            const teleopAlgae = `${entry.teleop_algae_net}/${entry.teleop_algae_processor}`;

            // Create climb status cell
            const climbSpan = document.createElement('span');
            climbSpan.className = entry.climb_success ? 'text-green-600' : 'text-red-600';
            climbSpan.textContent = `${entry.climb_success ? '✓' : '✗'} ${entry.climb_type || 'Failed'}`;

            // Create auto path cell
            const pathCell = createPathCell(entry);

            row.append(
                createCell(entry.event_code),
                createCell(entry.match_number),
                createCell(autoCoral),
                createCell(autoAlgae),
                createCell(teleopCoral),
                createCell(teleopAlgae),
                createCell(climbSpan),
                pathCell,
                createCell(`${entry.defense_rating}/5`),
                createCell(entry.notes || ''),
                createCell(entry.scouter_name)
            );

            scoutingTableBody.appendChild(row);
        });
    } else {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 11;
        cell.className = 'px-6 py-4 text-center text-gray-500';
        cell.textContent = 'No scouting data available for this team';
        row.appendChild(cell);
        scoutingTableBody.appendChild(row);
    }
    
    selectedTeamInfo.classList.remove('hidden');
};

// Initialize search on page load
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('team-search');
    const selectedTeamInfo = document.getElementById('selected-team-info');
    init(searchInput, selectedTeamInfo);
});

// Initialize modal click handler
window.addEventListener('load', function() {
    const modal = document.getElementById('autoPathModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeAutoPathModal();
            }
        });
    }
});

let debounceTimer;