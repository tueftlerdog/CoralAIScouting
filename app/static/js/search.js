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

    function performSearch(query) {
        fetch(`/api/search?q=${encodeURIComponent(query)}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.error) {
                    throw new Error(data.error);
                }
                // Display first matching team if any
                if (Array.isArray(data) && data.length > 0) {
                    displayTeamInfo(data[0]);
                } else {
                    selectedTeamInfo.classList.add('hidden');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                selectedTeamInfo.classList.add('hidden');
            });
    }

    function displayTeamInfo(team) {
        document.getElementById('team-number').textContent = team.team_number;
        document.getElementById('team-nickname').textContent = team.nickname || 'N/A';
        document.getElementById('team-school').textContent = team.school_name || 'N/A';
        
        const location = [team.city, team.state_prov, team.country]
            .filter(Boolean)
            .join(', ');
        document.getElementById('team-location').textContent = location || 'N/A';
        
        selectedTeamInfo.classList.remove('hidden');
    }

    init();
});