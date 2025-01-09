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

        displayComparisonResults(data);
    } catch (error) {
        console.error('Error comparing teams:', error);
        alert(error.message || 'An error occurred while comparing teams');
    }
}

function displayComparisonResults(teamsData) {
    // Add debug logging
    console.log('Teams Data:', teamsData);
    
    comparisonResults.classList.remove('hidden');
    
    // Get all teams' stats for comparison
    const allStats = Object.values(teamsData).map(team => {
        // Add null check for team.stats
        if (!team || !team.stats) return {};
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
        
        if (header) header.textContent = `Team ${teamData.team_number}`;
        if (numberName) numberName.textContent = 
            `#${teamData.team_number}${teamData.nickname ? ` - ${teamData.nickname}` : ''}`;
        
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
        console.log(`Drawing auto paths for team ${teamNum}:`, teamData.auto_paths);
        displayAutoPath(teamNum, teamData.auto_paths, index + 1);
    });
    
    // Update radar chart
    updateRadarChart(teamsData);
}

function formatLocation(teamData) {
    const parts = [];
    if (teamData.city) parts.push(teamData.city);
    if (teamData.state_prov) parts.push(teamData.state_prov);
    if (teamData.country && teamData.country !== 'USA') parts.push(teamData.country);
    return parts.join(', ');
}

function formatStatsWithHighlighting(stats, allStats) {
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
        'Preferred Climb Type': stats.preferred_climb_type || 'none'
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
                        <div class="text-sm font-medium ${highlight || ''}">${(value || 0).toFixed(1)} times/match</div>
                    `).join('')}
                    
                    <div class="col-span-2 text-sm font-medium mt-2">Algae Scoring:</div>
                    ${Object.entries(statComparisons['Auto Algae Scoring']).map(([method, {value, highlight}]) => `
                        <div class="text-sm pl-2">${method}:</div>
                        <div class="text-sm font-medium ${highlight}">${value.toFixed(1)} times/match</div>
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
                        <div class="text-sm font-medium ${highlight}">${value.toFixed(1)} times/match</div>
                    `).join('')}
                    
                    <div class="col-span-2 text-sm font-medium mt-2">Algae Scoring:</div>
                    ${Object.entries(statComparisons['Teleop Algae Scoring']).map(([method, {value, highlight}]) => `
                        <div class="text-sm pl-2">${method}:</div>
                        <div class="text-sm font-medium ${highlight}">${value.toFixed(1)} times/match</div>
                    `).join('')}
                </div>
            </div>

            <!-- Endgame -->
            <div>
                <div class="font-medium text-gray-700 border-b mb-2">Endgame</div>
                <div class="grid grid-cols-2 gap-2">
                    <div class="text-sm">Climb Success:</div>
                    <div class="text-sm font-medium ${statComparisons['Climb Success Rate'].highlight}">
                        ${statComparisons['Climb Success Rate'].value.toFixed(1)}%
                    </div>
                    <div class="text-sm">Preferred Climb:</div>
                    <div class="text-sm font-medium">${statComparisons['Preferred Climb Type']}</div>
                </div>
            </div>
        </div>
    `;
}

function calculateStatRanking(value, allValues) {
    const max = Math.max(...allValues);
    const min = Math.min(...allValues);
    
    let highlight = '';
    if (value === max && max !== 0) highlight = 'text-green-600';
    if (value === min && min !== max) highlight = 'text-red-600';
    
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
    
    // Destroy existing chart if it exists
    if (window.radarChart) {
        window.radarChart.destroy();
    }
    
    const datasets = Object.entries(teamsData).map(([teamNum, teamData], index) => {
        const colors = ['rgba(37, 99, 235, 0.2)', 'rgba(220, 38, 38, 0.2)', 'rgba(5, 150, 105, 0.2)'];
        const borderColors = ['rgb(37, 99, 235)', 'rgb(220, 38, 38)', 'rgb(5, 150, 105)'];
        
        // Add null checks and default values
        const stats = teamData?.stats?.normalized_stats || {
            auto_scoring: 0,
            teleop_scoring: 0,
            climb_rating: 0,
            defense_rating: 0,
            human_player: 0
        };
        
        return {
            label: `Team ${teamNum}`,
            data: [
                Math.min(20, stats.auto_scoring || 0),
                Math.min(20, stats.teleop_scoring || 0),
                Math.min(20, stats.climb_rating / 5 || 0),
                Math.min(20, stats.defense_rating * 4 || 0),
                Math.min(20, stats.human_player * 4 || 0)
            ],
            backgroundColor: colors[index],
            borderColor: borderColors[index],
            borderWidth: 2
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
                'Human Player Rating'
            ],
            datasets: datasets
        },
        options: {
            scales: {
                r: {
                    beginAtZero: true,
                    max: 20,
                    ticks: {
                        stepSize: 4
                    }
                }
            }
        }
    });
}