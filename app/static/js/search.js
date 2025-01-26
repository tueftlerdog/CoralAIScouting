// Define showAutoPath globally
function showAutoPath(pathData, autoNotes = '') {
    const modal = document.getElementById('autoPathModal');
    const image = document.getElementById('modalAutoPathImage');
    const notes = document.getElementById('modalAutoNotes');
    
    image.src = pathData;
    notes.textContent = autoNotes || 'No auto notes provided';
    modal.classList.remove('hidden');
}

function closeAutoPathModal() {
    document.getElementById('autoPathModal').classList.add('hidden');
}

const init = (searchInput, selectedTeamInfo) => {
    if (!searchInput || !selectedTeamInfo) {
        console.error('Required elements not found');
        return;
    }
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
            const teleopAlgae = `${entry.teleop_algae_net}/${entry.teleop_algae_processor}/${entry.human_player || 0}`;

            // Create climb status cell
            const climbSpan = document.createElement('span');
            climbSpan.className = entry.climb_success ? 'text-green-600' : 'text-red-600';
            climbSpan.textContent = `${entry.climb_success ? '✓' : '✗'} ${entry.climb_type || 'Failed'}`;

            // Create auto path cell
            const pathCell = document.createElement('td');
            pathCell.className = 'px-6 py-4 whitespace-nowrap';
            if (entry.auto_path) {
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

            // Add all cells to the row
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

document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.querySelector('#team-search');
    const selectedTeamInfo = document.querySelector('#selected-team-info');
    let debounceTimer;

    init(searchInput, selectedTeamInfo);
});