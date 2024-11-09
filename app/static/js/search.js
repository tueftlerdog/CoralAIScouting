document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.querySelector('#team-search');
    const searchResults = document.querySelector('#search-results');
    let debounceTimer;
    let selectedIndex = -1;

    // Input event handler for search
    searchInput.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        selectedIndex = -1;
        
        const query = this.value.trim();
        if (query === '') {
            searchResults.innerHTML = '';
            searchResults.classList.add('hidden');
            return;
        }

        debounceTimer = setTimeout(() => {
            fetch(`/team/api/search?q=${encodeURIComponent(query)}`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Search request failed');
                    }
                    return response.json();
                })
                .then(data => {
                    searchResults.innerHTML = '';
                    if (data.length > 0) {
                        const ul = document.createElement('ul');
                        ul.className = 'divide-y divide-gray-200';
                        
                        data.forEach(team => {
                            const li = document.createElement('li');
                            li.className = 'px-4 py-2 hover:bg-gray-100 cursor-pointer';
                            
                            // Create the team information HTML
                            let teamHtml = `
                                <div class="flex justify-between">
                                    <span class="font-medium">Team ${team.team_number}</span>
                                    <span class="text-gray-600">${team.nickname}</span>
                                </div>
                            `;
                            
                            // Add school name if available
                            if (team.school_name) {
                                teamHtml += `
                                    <div class="text-sm text-gray-500">${team.school_name}</div>
                                `;
                            }
                            
                            // Add location if available
                            if (team.city || team.state_prov) {
                                const location = [team.city, team.state_prov]
                                    .filter(Boolean)
                                    .join(', ');
                                if (location) {
                                    teamHtml += `
                                        <div class="text-sm text-gray-500">${location}</div>
                                    `;
                                }
                            }
                            
                            li.innerHTML = teamHtml;
                            
                            li.addEventListener('click', () => {
                                searchInput.value = team.team_number;
                                searchResults.classList.add('hidden');
                                // You can add additional handling here, like redirecting to team page
                                // window.location.href = `/team/${team.team_number}`;
                            });
                            
                            ul.appendChild(li);
                        });
                        
                        searchResults.appendChild(ul);
                        searchResults.classList.remove('hidden');
                    } else {
                        searchResults.classList.add('hidden');
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    searchResults.classList.add('hidden');
                });
        }, 300);
    });

    // Keyboard navigation
    searchInput.addEventListener('keydown', function(e) {
        const items = searchResults.querySelectorAll('li');
        
        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (selectedIndex < items.length - 1) {
                    selectedIndex++;
                    updateSelection(items);
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (selectedIndex > 0) {
                    selectedIndex--;
                    updateSelection(items);
                }
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && items[selectedIndex]) {
                    items[selectedIndex].click();
                }
                break;
            case 'Escape':
                searchResults.classList.add('hidden');
                searchInput.blur();
                break;
        }
    });

    // Update the selected item's styling
    function updateSelection(items) {
        items.forEach((item, index) => {
            if (index === selectedIndex) {
                item.classList.add('bg-gray-100');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('bg-gray-100');
            }
        });
    }

    // Close search results when clicking outside
    document.addEventListener('click', function(e) {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.add('hidden');
        }
    });

    // Prevent search results from closing when clicking inside
    searchResults.addEventListener('click', function(e) {
        e.stopPropagation();
    });
});