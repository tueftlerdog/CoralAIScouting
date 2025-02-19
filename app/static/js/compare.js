// Constants
const API_ENDPOINT = '/api/compare';
const MIN_TEAMS = 2;
const MAX_TEAMS = 3;

// DOM Elements
const team1Input = document.getElementById('team1-input');
const team2Input = document.getElementById('team2-input');
const team3Input = document.getElementById('team3-input');
const compareBtn = document.getElementById('compare-btn');
const comparisonResults = document.getElementById('comparison-results');

// Event Listeners
compareBtn.addEventListener('click', compareTeams);

async function compareTeams() {
    const teams = [
        team1Input.value.trim(),
        team2Input.value.trim(),
        team3Input.value.trim()
    ].filter(team => team !== '');

    if (teams.length < MIN_TEAMS) {
        alert(`Please enter at least ${MIN_TEAMS} team numbers`);
        return;
    }

    try {
        const queryString = teams
            .map((team, index) => `team${index + 1}=${encodeURIComponent(team)}`)
            .join('&');
        
        const response = await fetch(`${API_ENDPOINT}?${queryString}`);
        const data = await response.json();
                
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch team data');
        }

        // Check if we have valid data before updating the chart
        if (!data || Object.keys(data).length === 0) {
            throw new Error('No data received from API');
        }

        displayComparisonResults(data);
    } catch (error) {
        console.error('Error comparing teams:', error);
        alert(error.message || 'An error occurred while comparing teams');
    }
}

function displayComparisonResults(teamsData) {
    comparisonResults.classList.remove('hidden');
    
    // Display raw scouting data first
    displayRawData(teamsData);
    
    // Get all teams' stats for comparison
    const allStats = Object.values(teamsData).map(team => {
        if (!team || !team.stats) {
          return {};
        }
        return team.stats;
    });
    
    // Hide all team info containers first
    for (let i = 1; i <= MAX_TEAMS; i++) {
        const container = document.getElementById(`team${i}-info`);
        if (container) {
            container.classList.add('hidden');
        }
    }
    
    // Display each team's data with highlighting
    Object.entries(teamsData).forEach(([teamNum, teamData], index) => {
        // Add error handling for malformed team data
        if (!teamData) {
            console.error(`No data received for team ${teamNum}`);
            return;
        }

        const teamPrefix = `team${index + 1}`;
        const container = document.getElementById(`${teamPrefix}-info`);
        
        if (!container) {
            console.error(`Container not found for ${teamPrefix}`);
            return;
        }

        container.classList.remove('hidden');
        
        // Update basic team info with additional error checking
        const header = document.getElementById(`${teamPrefix}-header`);
        const numberName = document.getElementById(`${teamPrefix}-number-name`);
        const locationEl = document.getElementById(`${teamPrefix}-location`);
        const statsContainer = document.getElementById(`${teamPrefix}-stats`);
        
        if (header) {
          header.textContent = `Team ${teamData.team_number}`;
        }
        if (numberName) {
          numberName.textContent = 
                    `#${teamData.team_number}${teamData.nickname ? ` - ${teamData.nickname}` : ''}`;
        }
        
        // Only show location if we have any location data
        const location = formatLocation(teamData);
        if (locationEl) {
            if (location) {
                locationEl.textContent = location;
                locationEl.classList.remove('hidden');
            } else {
                locationEl.classList.add('hidden');
            }
        }
        
        // Update stats with highlighting
        if (statsContainer) {
            statsContainer.innerHTML = formatStatsWithHighlighting(teamData.stats, allStats);
        }
    });

    // Adjust containers based on number of teams
    const teamCount = Object.keys(teamsData).length;
    const cardsContainer = document.getElementById('team-cards-container');
    const autoPathsContainer = document.getElementById('auto-paths-container');

    if (cardsContainer) {
        if (teamCount === 2) {
            cardsContainer.className = 'grid grid-cols-1 md:grid-cols-2 gap-6';
        } else if (teamCount === 3) {
            cardsContainer.className = 'grid grid-cols-1 md:grid-cols-3 gap-6';
        }
    }

    if (autoPathsContainer) {
        if (teamCount === 2) {
            autoPathsContainer.className = 'grid grid-cols-1 md:grid-cols-2 gap-6';
        } else if (teamCount === 3) {
            autoPathsContainer.className = 'grid grid-cols-1 md:grid-cols-3 gap-6';
        }
    }

    // Display auto paths for each team
    Object.entries(teamsData).forEach(([teamNum, teamData], index) => {
        displayAutoPath(teamNum, teamData.auto_paths, index + 1);
    });
    
    // Update radar chart
    updateRadarChart(teamsData);
}

function formatLocation(teamData) {
    const parts = [];
    if (teamData.city) {
      parts.push(teamData.city);
    }
    if (teamData.state_prov) {
      parts.push(teamData.state_prov);
    }
    if (teamData.country && teamData.country !== 'USA') {
      parts.push(teamData.country);
    }
    return parts.join(', ');
}

function formatStatsWithHighlighting(stats = {}, allStats) {
    // Add default values if stats is undefined
    stats = stats || {};
    
    const statComparisons = {
        // Auto Period
        'Auto Coral Scoring': {
            'Level 1': calculateStatRanking(stats.auto_coral_level1 || 0, allStats.map(s => s?.auto_coral_level1 || 0)),
            'Level 2': calculateStatRanking(stats.auto_coral_level2 || 0, allStats.map(s => s?.auto_coral_level2 || 0)),
            'Level 3': calculateStatRanking(stats.auto_coral_level3 || 0, allStats.map(s => s?.auto_coral_level3 || 0)),
            'Level 4': calculateStatRanking(stats.auto_coral_level4 || 0, allStats.map(s => s?.auto_coral_level4 || 0))
        },
        'Auto Algae Scoring': {
            'Net': calculateStatRanking(stats.auto_algae_net || 0, allStats.map(s => s?.auto_algae_net || 0)),
            'Processor': calculateStatRanking(stats.auto_algae_processor || 0, allStats.map(s => s?.auto_algae_processor || 0))
        },
        
        // Teleop Period
        'Teleop Coral Scoring': {
            'Level 1': calculateStatRanking(stats.teleop_coral_level1 || 0, allStats.map(s => s?.teleop_coral_level1 || 0)),
            'Level 2': calculateStatRanking(stats.teleop_coral_level2 || 0, allStats.map(s => s?.teleop_coral_level2 || 0)),
            'Level 3': calculateStatRanking(stats.teleop_coral_level3 || 0, allStats.map(s => s?.teleop_coral_level3 || 0)),
            'Level 4': calculateStatRanking(stats.teleop_coral_level4 || 0, allStats.map(s => s?.teleop_coral_level4 || 0))
        },
        'Teleop Algae Scoring': {
            'Net': calculateStatRanking(stats.teleop_algae_net || 0, allStats.map(s => s?.teleop_algae_net || 0)),
            'Processor': calculateStatRanking(stats.teleop_algae_processor || 0, allStats.map(s => s?.teleop_algae_processor || 0))
        },
        
        // Endgame
        'Climb Success Rate': calculateStatRanking(stats.climb_success_rate || 0, allStats.map(s => s?.climb_success_rate || 0)),
        'Preferred Climb Type': stats.preferred_climb_type || 'none',

        // Defense comparisons
        'Defense': {
            'Defense Rating': calculateStatRanking(stats.defense_rating || 0, allStats.map(s => s?.defense_rating || 0))
        }
    };

    // Add null checks for value formatting
    return `
        <div class="space-y-4">
            <!-- Auto Period -->
            <div>
                <div class="font-medium text-gray-700 border-b mb-2">Auto Period</div>
                <div class="grid grid-cols-2 gap-2">
                    ${Object.entries(statComparisons['Auto Coral Scoring']).map(([level, {value, highlight}]) => `
                        <div class="text-sm pl-2">${level}:</div>
                        <div class="text-sm font-medium ${highlight || ''}">${value.toFixed(2)} times/match</div>
                    `).join('')}
                    
                    <div class="col-span-2 text-sm font-medium mt-2">Algae Scoring:</div>
                    ${Object.entries(statComparisons['Auto Algae Scoring']).map(([method, {value, highlight}]) => `
                        <div class="text-sm pl-2">${method}:</div>
                        <div class="text-sm font-medium ${highlight}">${value.toFixed(2)} times/match</div>
                    `).join('')}
                </div>
            </div>

            <!-- Teleop Period -->
            <div>
                <div class="font-medium text-gray-700 border-b mb-2">Teleop Period</div>
                <div class="grid grid-cols-2 gap-2">
                    <div class="col-span-2 text-sm font-medium">Coral Scoring:</div>
                    ${Object.entries(statComparisons['Teleop Coral Scoring']).map(([level, {value, highlight}]) => `
                        <div class="text-sm pl-2">${level}:</div>
                        <div class="text-sm font-medium ${highlight}">${value.toFixed(2)} times/match</div>
                    `).join('')}
                    
                    <div class="col-span-2 text-sm font-medium mt-2">Algae Scoring:</div>
                    ${Object.entries(statComparisons['Teleop Algae Scoring']).map(([method, {value, highlight}]) => `
                        <div class="text-sm pl-2">${method}:</div>
                        <div class="text-sm font-medium ${highlight}">${value.toFixed(2)} times/match</div>
                    `).join('')}
                </div>
            </div>

            <!-- Endgame -->
            <div>
                <div class="font-medium text-gray-700 border-b mb-2">Endgame</div>
                <div class="grid grid-cols-2 gap-2">
                    <div class="text-sm">Climb Success:</div>
                    <div class="text-sm font-medium ${statComparisons['Climb Success Rate'].highlight}">
                        ${statComparisons['Climb Success Rate'].value.toFixed(2)}%
                    </div>
                    <div class="text-sm">Preferred Climb:</div>
                    <div class="text-sm font-medium">${statComparisons['Preferred Climb Type']}</div>
                </div>
            </div>

            <div>
                <div class="font-medium text-gray-700 border-b mb-2"Defense</div>
                <div class="grid grid-cols-2 gap-2">
                    ${Object.entries(statComparisons['Defense']).map(([stat, {value, highlight}]) => `
                        <div class="text-sm">${stat}:</div>
                        <div class="text-sm font-medium ${highlight}">
                            ${value.toFixed(2)} / 5
                        </div>
                    `).join('')}
                    <div class="text-sm">Defense Notes:</div>
                </div>
            </div>
        </div>
    `;
}

function calculateStatRanking(value, allValues) {
    const max = Math.max(...allValues);
    const min = Math.min(...allValues);
    
    let highlight = '';
    if (value === max && max !== 0) {
      highlight = 'text-green-600';
    }
    if (value === min && min !== max) {
      highlight = 'text-red-600';
    }
    
    return { value, highlight };
}

function displayAutoPath(teamNum, pathData, containerIndex) {
    const containerSelector = `#auto-path-team${containerIndex}-container`;
    const container = document.querySelector(containerSelector);
    
    if (!container) {
        console.error(`Container ${containerSelector} not found`);
        return;
    }

    // Clear existing content
    container.innerHTML = `<h4 class="font-medium text-gray-700">Team ${teamNum} Auto Paths</h4>`;

    if (!pathData || pathData.length === 0) {
        container.innerHTML += `
            <p class="text-gray-500 text-sm">No auto paths available for this team.</p>
        `;
        return;
    }

    // Sort paths by match number and get latest 5
    const sortedPaths = [...pathData]
        .sort((a, b) => b.match_number - a.match_number)
        .slice(0, 5);

    // Create accordion container
    const accordionContainer = document.createElement('div');
    accordionContainer.className = 'space-y-2';
    
    // Create accordion items for each path
    sortedPaths.forEach((path, index) => {
        const accordionItem = document.createElement('div');
        accordionItem.className = 'border rounded-lg';
        
        const header = document.createElement('button');
        header.className = 'w-full px-4 py-2 text-left flex justify-between items-center bg-gray-50 hover:bg-gray-100 rounded-lg focus:outline-none';
        header.innerHTML = `
            <span class="font-medium">Match ${path.match_number} - ${path.event_code}</span>
            <svg class="w-5 h-5 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
        `;

        const content = document.createElement('div');
        content.className = 'p-4 hidden';
        
        const canvas = document.createElement('canvas');
        canvas.width = 400;  // Smaller width
        canvas.height = 300; // Smaller height
        canvas.className = 'border rounded-lg bg-white w-full h-auto max-w-full';
        
        content.appendChild(canvas);
        accordionItem.appendChild(header);
        accordionItem.appendChild(content);
        
        // Add click handler for accordion
        header.addEventListener('click', () => {
            const isHidden = content.classList.contains('hidden');
            content.classList.toggle('hidden');
            header.querySelector('svg').style.transform = isHidden ? 'rotate(180deg)' : '';
            
            if (isHidden) {
                // Draw the path only when accordion is opened
                const ctx = canvas.getContext('2d');
                const bgImage = new Image();
                bgImage.onload = () => {
                    
                    const pathImage = new Image();
                    pathImage.onload = () => {
                        ctx.drawImage(pathImage, 0, 0, canvas.width, canvas.height);
                    };
                    pathImage.src = path.image_data;
                };
                bgImage.src = "/static/images/field-2025.png";
            }
        });
        
        accordionContainer.appendChild(accordionItem);
    });

    container.appendChild(accordionContainer);
}

function updateRadarChart(teamsData) {
    const ctx = document.getElementById('radar-chart-combined');
    
    if (!ctx) {
        console.error('Radar chart canvas not found');
        return;
    }
    
    // Destroy existing chart if it exists
    if (window.radarChart) {
        window.radarChart.destroy();
    }
    
    const datasets = Object.entries(teamsData).map(([teamNum, teamData], index) => {
        const colors = ['rgba(37, 99, 235, 0.2)', 'rgba(220, 38, 38, 0.2)', 'rgba(5, 150, 105, 0.2)'];
        const borderColors = ['rgb(37, 99, 235)', 'rgb(220, 38, 38)', 'rgb(5, 150, 105)'];
        
        // Ensure normalized_stats exists and has default values
        const stats = teamData?.normalized_stats || {};
        
        return {
            label: `Team ${teamNum}`,
            data: [
                (stats.auto_scoring || 0)*2,      
                (stats.teleop_scoring || 0)*2,    
                (stats.climb_rating || 0)*200,      
                (stats.defense_rating || 0)*2,           
            ],
            backgroundColor: colors[index],
            borderColor: borderColors[index],
            borderWidth: 2,
            pointBackgroundColor: borderColors[index],
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: borderColors[index]
        };
    });
    
    window.radarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: [
                'Auto Scoring',
                'Teleop Scoring',
                'Climb Success',
                'Defense Rating',
            ],
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 10,
                    ticks: {
                        stepSize: 4
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    },
                    angleLines: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    },
                    pointLabels: {
                        font: {
                            size: window.innerWidth < 768 ? 10 : 14
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    position: window.innerWidth < 768 ? 'bottom' : 'right',
                    labels: {
                        boxWidth: window.innerWidth < 768 ? 12 : 40,
                        font: {
                            size: window.innerWidth < 768 ? 10 : 12
                        }
                    }
                }
            }
        }
    });
}

// Add resize handler
window.addEventListener('resize', () => {
    if (window.radarChart) {
        window.radarChart.options.plugins.legend.position = window.innerWidth < 768 ? 'bottom' : 'right';
        window.radarChart.options.scales.r.ticks.font.size = window.innerWidth < 768 ? 8 : 12;
        window.radarChart.options.scales.r.pointLabels.font.size = window.innerWidth < 768 ? 10 : 14;
        window.radarChart.update();
    }
});

function displayRawData(teamsData) {
    const tbody = document.getElementById('raw-data-tbody');
    tbody.innerHTML = '';  // Clear existing rows
    
    Object.entries(teamsData).forEach(([teamNum, teamData]) => {
        // Check if matches data exists
        if (!teamData || !teamData.matches || !Array.isArray(teamData.matches)) {
            console.warn(`No matches data for team ${teamNum}`, teamData);
            return;
        }

        // Sort matches by match number (most recent first)
        const sortedMatches = [...teamData.matches].sort((a, b) => b.match_number - a.match_number);
        
        sortedMatches.forEach(match => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50';
            
            // Safely get values with fallbacks
            const alliance = match.alliance || 'unknown';
            const matchNumber = match.match_number || 'N/A';
            const autoCoralScores = [
                match.auto_coral_level1 || 0,
                match.auto_coral_level2 || 0,
                match.auto_coral_level3 || 0,
                match.auto_coral_level4 || 0
            ].join('/');
            const autoAlgaeScores = `${match.auto_algae_net || 0}/${match.auto_algae_processor || 0}`;
            const teleopCoralScores = [
                match.teleop_coral_level1 || 0,
                match.teleop_coral_level2 || 0,
                match.teleop_coral_level3 || 0,
                match.teleop_coral_level4 || 0
            ].join('/');
            const teleopAlgaeScores = `${match.teleop_algae_net || 0}/${match.teleop_algae_processor || 0}`;
            
            row.innerHTML = `
                <td class="px-3 sm:px-6 py-4">
                    <a href="/scouting/team/${teamNum}" class="text-blue-600 hover:text-blue-900">
                        ${teamNum}
                    </a>
                </td>
                <td class="px-3 sm:px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                        <span class="px-2 py-1 text-sm rounded-full 
                            ${alliance === 'red' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}">
                            ${alliance.charAt(0).toUpperCase() + alliance.slice(1)}
                        </span>
                    </div>
                </td>
                <td class="sm:table-cell px-3 sm:px-6 py-4 whitespace-nowrap">${matchNumber}</td>
                <td class="md:table-cell px-3 sm:px-6 py-4 whitespace-nowrap">${autoCoralScores}</td>
                <td class="md:table-cell px-3 sm:px-6 py-4 whitespace-nowrap">${autoAlgaeScores}</td>
                <td class="md:table-cell px-3 sm:px-6 py-4 whitespace-nowrap">${teleopCoralScores}</td>
                <td class="md:table-cell px-3 sm:px-6 py-4 whitespace-nowrap">${teleopAlgaeScores}</td>
                <td class="md:table-cell px-3 sm:px-6 py-4 whitespace-nowrap">
                    ${match.climb_success ? 
                        `<span class="text-green-600">✓ ${match.climb_type || 'Unknown'}</span>` : 
                        `<span class="text-red-600">✗ ${match.climb_type || 'Unknown'}</span>`}
                </td>
                <td class="px-3 sm:px-6 py-4 whitespace-nowrap">
                    ${match.auto_path ? 
                        `<button onclick="showAutoPath('${match.auto_path}', '${match.auto_notes || ''}')" 
                                class="text-blue-600 hover:text-blue-900">
                            <span class="hidden sm:inline">View Path</span>
                            <span class="sm:hidden">🗺️</span>
                        </button>` : 
                        `<span class="text-gray-400">No path</span>`}
                </td>
                <td class="px-3 sm:px-6 py-4 whitespace-nowrap">
                    ${match.defense_rating || 0}/5
                </td>
                <td class="lg:table-cell px-3 sm:px-6 py-4 whitespace-normal max-w-xs truncate">
                    ${match.notes || ''}
                </td>
                <td class="px-3 sm:px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center space-x-2">
                        <img src="${match.profile_picture && match.profile_picture !== 'default' ? 
                                  `/api/profile_picture/${match.profile_picture}` : 
                                  '/static/images/default_profile.png'}" 
                             alt="Profile Picture" 
                             class="w-6 h-6 sm:w-8 sm:h-8 rounded-full">
                        <div class="flex flex-col sm:flex-row sm:items-center sm:space-x-1">
                            <a class="text-blue-600 hover:text-blue-900 text-sm" 
                               href="/auth/profile/${match.scouter_name || 'unknown'}">
                                ${match.scouter_name || 'Unknown'}
                            </a>
                            ${match.scouter_team ? 
                                `<span class="sm:inline">
                                    <a href="/team/${match.scouter_team}" class="hover:text-blue-500">
                                        (${match.scouter_team})
                                    </a>
                                </span>` : 
                                ''}
                        </div>
                    </div>
                </td>
            `;
            
            tbody.appendChild(row);
        });
    });
}

let modalCanvas, modalCoordSystem;
let currentPathData = null;

// Update the showAutoPath function
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
    if (!modalCoordSystem || !currentPathData) return;
    
    modalCoordSystem.clear();
    
    let paths = currentPathData;
    if (typeof paths === 'string') {
        try {
            paths = JSON.parse(paths);
        } catch (e) {
            console.error('Failed to parse path data:', e);
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
    if (modal) {
        modal.classList.add('hidden');
    }
}

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

function createRadarChart(data) {
    // Extract teams for comparison
    const teams = Object.keys(data);
    
    // Define the metrics we want to compare
    const metrics = [
        'auto_scoring',
        'teleop_scoring',
        'climb_rating',
        'defense_rating',
    ];

    // Prepare the data for the radar chart
    const chartData = {
        labels: metrics,
        datasets: teams.map((team, index) => {
            const teamData = data[team].normalized_stats;
            const color = getTeamColor(index);
            
            return {
                label: `Team ${team}`,
                data: metrics.map(metric => teamData[metric] || 0),
                fill: true,
                backgroundColor: `${color}33`, // Add transparency
                borderColor: color,
                pointBackgroundColor: color,
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: color
            };
        })
    };

    // Configuration for the radar chart
    const config = {
        type: 'radar',
        data: chartData,
        options: {
            responsive: true,
            scales: {
                r: {
                    min: 0,
                    max: 5,
                    ticks: {
                        stepSize: 1
                    }
                }
            },
            elements: {
                line: {
                    borderWidth: 3
                }
            }
        }
    };

    // Create the chart
    const ctx = document.getElementById('radarChart').getContext('2d');
    if (window.myRadarChart) {
        window.myRadarChart.destroy();
    }
    window.myRadarChart = new Chart(ctx, config);
}

// Helper function to get different colors for teams
function getTeamColor(index) {
    const colors = [
        '#FF6384',
        '#36A2EB',
        '#FFCE56',
        '#4BC0C0',
        '#9966FF',
        '#FF9F40'
    ];
    return colors[index % colors.length];
}