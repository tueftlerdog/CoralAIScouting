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

document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.querySelector('#team-search');
    const selectedTeamInfo = document.querySelector('#selected-team-info');
    let debounceTimer;

    function init() {
        if (!searchInput || !selectedTeamInfo) {
            console.error('Required elements not found');
            return;
        }
        
        searchInput.addEventListener('input', handleSearchInput);
    }

    function handleSearchInput(event) {
        clearTimeout(debounceTimer);
        
        const query = event.target.value.trim();
        if (query === '') {
            selectedTeamInfo.classList.add('hidden');
            return;
        }

        debounceTimer = setTimeout(() => {
            performSearch(query);
        }, 300);
    }

    async function performSearch(query) {
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const text = await response.text(); // Get response as text first
            const data = JSON.parse(text); // Then parse it

            if (Array.isArray(data) && data.length > 0) {
                displayTeamInfo(data[0]);
            } else {
                selectedTeamInfo.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error:', error);
            selectedTeamInfo.classList.add('hidden');
        }
    }

    function displayTeamInfo(team) {
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
                
                // Format coral scores as L1/L2/L3/L4
                const autoCoral = `${entry.auto_coral_level1}/${entry.auto_coral_level2}/${entry.auto_coral_level3}/${entry.auto_coral_level4}`;
                const teleopCoral = `${entry.teleop_coral_level1}/${entry.teleop_coral_level2}/${entry.teleop_coral_level3}/${entry.teleop_coral_level4}`;
                
                // Format algae scores as net/processor
                const autoAlgae = `${entry.auto_algae_net}/${entry.auto_algae_processor}`;
                const teleopAlgae = `${entry.teleop_algae_net}/${entry.teleop_algae_processor}/${entry.human_player || 0}`;
                
                row.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap">${entry.event_code}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${entry.match_number}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${autoCoral}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${autoAlgae}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${teleopCoral}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${teleopAlgae}</td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        ${entry.climb_success ? 
                          `<span class="text-green-600">✓ ${entry.climb_type}</span>` : 
                          `<span class="text-red-600">✗ ${entry.climb_type || 'Failed'}</span>`}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        ${entry.auto_path ? 
                          `<button onclick="showAutoPath('${entry.auto_path}', '${entry.auto_notes}')" 
                                   class="text-blue-600 hover:text-blue-900">
                               View Path
                           </button>` : 
                          `<span class="text-gray-400">No path</span>`}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">${entry.defense_rating}/5</td>
                    <td class="px-6 py-4 whitespace-nowrap">${entry.notes || ''}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${entry.scouter_name}</td>
                `;
                scoutingTableBody.appendChild(row);
            });
        } else {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="11" class="px-6 py-4 text-center text-gray-500">
                    No scouting data available for this team
                </td>
            `;
            scoutingTableBody.appendChild(row);
        }
        
        selectedTeamInfo.classList.remove('hidden');
    }

    init();
});