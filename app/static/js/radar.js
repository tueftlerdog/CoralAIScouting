// Initialize the radar charts
let team1RadarChart = null;
let team2RadarChart = null;

const radarConfig = {
    scales: {
        r: {
            beginAtZero: true,
            min: 0,
            grid: {
                color: 'rgba(0, 0, 0, 0.1)'
            },
            ticks: {
                stepSize: 5
            }
        }
    },
    plugins: {
        legend: {
            display: false
        }
    }
};

function createRadarChart(canvasId, data) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    return new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Auto', 'Teleop', 'Endgame', 'Consistency', 'Overall'],
            datasets: [{
                data: data,
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgb(54, 162, 235)',
                borderWidth: 2,
                pointBackgroundColor: 'rgb(54, 162, 235)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgb(54, 162, 235)'
            }]
        },
        options: radarConfig
    });
}

function calculateConsistency(matchData) {
    if (matchData.length < 2) {
      return 10;
    } // Perfect consistency if only one match
    
    // Calculate standard deviation of total scores
    const scores = matchData.map(m => m.total_points);
    const mean = scores.reduce((a, b) => a + b) / scores.length;
    const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    
    // Convert to 0-10 scale (lower stdDev = higher consistency)
    // Using 20 as a reasonable max stdDev (higher means less consistent)
    const consistency = 10 - normalizeValue(stdDev, 0, 20, 10);
    return Math.max(0, Math.min(10, consistency));
}

function normalizeValue(value, min, max, scale) {
    return ((value - min) / (max - min)) * scale;
}

function updateRadarCharts(teamsData) {
    // Calculate radar chart data for each team
    for (const [teamNum, teamData] of Object.entries(teamsData)) {
        const {stats} = teamData;
        
        // Calculate consistency score (inverse of standard deviation relative to max score)
        const consistency = calculateConsistency(teamData.scouting_data);
        
        // Normalize all values to be on a 0-10 scale
        const radarData = [
            normalizeValue(stats.avg_auto, 0, 30, 10),      // Auto (assuming max 30 points)
            normalizeValue(stats.avg_teleop, 0, 50, 10),    // Teleop (assuming max 50 points)
            normalizeValue(stats.avg_endgame, 0, 10, 10),   // Endgame (assuming max 20 points)
            consistency,                                     // Consistency (already 0-10)
            normalizeValue(stats.avg_total, 0, 90, 10)     // Overall (assuming max 100 points)
        ];

        const chartId = `radar-chart-team${teamNum === Object.keys(teamsData)[0] ? '1' : '2'}`;
        
        // Destroy existing chart if it exists
        if (teamNum === Object.keys(teamsData)[0]) {
            if (team1RadarChart) {
                team1RadarChart.destroy();
            }
            team1RadarChart = createRadarChart(chartId, radarData);
        } else {
            if (team2RadarChart) {
                team2RadarChart.destroy();
            }
            team2RadarChart = createRadarChart(chartId, radarData);
        }
    }
}

// Export the updateRadarCharts function
window.updateRadarCharts = updateRadarCharts;