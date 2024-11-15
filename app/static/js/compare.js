// Constants
const API_ENDPOINT = '/api/compare';

// DOM Elements
const team1Input = document.getElementById('team1-input');
const team2Input = document.getElementById('team2-input');
const compareBtn = document.getElementById('compare-btn');
const comparisonResults = document.getElementById('comparison-results');

// Event Listeners
compareBtn.addEventListener('click', compareTeams);

async function compareTeams() {
    const team1 = team1Input.value.trim();
    const team2 = team2Input.value.trim();

    if (!team1 || !team2) {
        alert('Please enter both team numbers');
        return;
    }

    try {
        const response = await fetch(`${API_ENDPOINT}?team1=${team1}&team2=${team2}`);
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to fetch team data');
        }

        const teamsData = await response.json();
        displayComparisonResults(teamsData);
    } catch (error) {
        alert(error.message);
    }
}

function displayComparisonResults(teamsData) {
    comparisonResults.classList.remove('hidden');
    
    // Update team information for both teams
    for (const [teamNum, teamData] of Object.entries(teamsData)) {
        const teamPrefix = `team${teamNum === Object.keys(teamsData)[0] ? '1' : '2'}`;
        
        // Update team info
        document.getElementById(`${teamPrefix}-number-name`).textContent = 
            `#${teamData.team_number} - ${teamData.nickname}`;
        
        document.getElementById(`${teamPrefix}-location`).textContent = 
            formatLocation(teamData);
        
        // Update statistics
        const statsContainer = document.getElementById(`${teamPrefix}-stats`);
        statsContainer.innerHTML = formatStats(teamData.stats);
        
        // Update match history
        const matchesContainer = document.getElementById(`${teamPrefix}-matches`);
        matchesContainer.innerHTML = formatMatchHistory(teamData.scouting_data);
    }

    // Update radar charts
    updateRadarCharts(teamsData);
}

function formatLocation(teamData) {
    const parts = [];
    if (teamData.school_name) {
      parts.push(teamData.school_name);
    }
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

function formatStats(stats) {
    return `
        <div class="grid grid-cols-2 gap-2">
            <div class="text-sm">Matches Scouted:</div>
            <div class="text-sm font-medium">${stats.matches_played}</div>
            
            <div class="text-sm">Avg Auto:</div>
            <div class="text-sm font-medium">${stats.avg_auto.toFixed(1)}</div>
            
            <div class="text-sm">Avg Teleop:</div>
            <div class="text-sm font-medium">${stats.avg_teleop.toFixed(1)}</div>
            
            <div class="text-sm">Avg Endgame:</div>
            <div class="text-sm font-medium">${stats.avg_endgame.toFixed(1)}</div>
            
            <div class="text-sm">Avg Total:</div>
            <div class="text-sm font-medium">${stats.avg_total.toFixed(1)}</div>
            
            <div class="text-sm">Highest Score:</div>
            <div class="text-sm font-medium">${stats.max_total}</div>
            
            <div class="text-sm">Lowest Score:</div>
            <div class="text-sm font-medium">${stats.min_total}</div>
        </div>
    `;
}

function formatMatchHistory(matches) {
    return matches
        .sort((a, b) => a.match_number - b.match_number)
        .map(match => `
            <tr>
                <td class="px-4 py-2 whitespace-nowrap">
                    ${match.event_code} Q${match.match_number}
                </td>
                <td class="px-4 py-2 whitespace-nowrap">
                    ${match.auto_points}
                </td>
                <td class="px-4 py-2 whitespace-nowrap">
                    ${match.teleop_points}
                </td>
                <td class="px-4 py-2 whitespace-nowrap">
                    ${match.endgame_points}
                </td>
                <td class="px-4 py-2 whitespace-nowrap font-medium">
                    ${match.total_points}
                </td>
            </tr>
        `)
        .join('');
}