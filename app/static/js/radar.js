// Initialize the radar charts
let team1RadarChart = null;
let team2RadarChart = null;
let combinedRadarChart = null;

const radarConfig = {
    scales: {
        r: {
            beginAtZero: true,
            min: 0,
            max: 10, // Set fixed max scale for consistency
            grid: {
                color: 'rgba(0, 0, 0, 0.1)'
            },
            ticks: {
                stepSize: 2
            }
        }
    },
    plugins: {
        legend: {
            display: false
        }
    }
};

// Config for combined chart (includes legend)
const combinedRadarConfig = {
    ...radarConfig,
    plugins: {
        legend: {
            display: true,
            position: 'bottom'
        }
    }
};

function createRadarChart(canvasId, data, isCombo = false) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    const chartData = {
        labels: ['Auto', 'Teleop', 'Endgame', 'Consistency', 'Overall'],
        datasets: isCombo ? [
            {
                label: 'Team 1',
                data: data[0],
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgb(54, 162, 235)',
                borderWidth: 2,
                pointBackgroundColor: 'rgb(54, 162, 235)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgb(54, 162, 235)'
            },
            {
                label: 'Team 2',
                data: data[1],
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                borderColor: 'rgb(255, 99, 132)',
                borderWidth: 2,
                pointBackgroundColor: 'rgb(255, 99, 132)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgb(255, 99, 132)'
            }
        ] : [{
            data: data,
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderColor: 'rgb(54, 162, 235)',
            borderWidth: 2,
            pointBackgroundColor: 'rgb(54, 162, 235)',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: 'rgb(54, 162, 235)'
        }]
    };

    return new Chart(ctx, {
        type: 'radar',
        data: chartData,
        options: isCombo ? combinedRadarConfig : radarConfig
    });
}

function calculateConsistency(matchData) {
    if (matchData.length < 2 && matchData.length != 0) {
        return 10;
    }
    if (matchData.length == 0) {
        return 0;
    }
    
    const scores = matchData.map(m => m.total_points);
    const mean = scores.reduce((a, b) => a + b) / scores.length;
    const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    
    const consistency = 10 - normalizeValue(stdDev, 0, 20, 10);
    return Math.max(0, Math.min(10, consistency));
}

function normalizeValue(value, min, max, scale) {
    return ((value - min) / (max - min)) * scale;
}

function updateRadarCharts(teamsData) {
    let team1Data = null;
    let team2Data = null;

    // Calculate radar chart data for each team
    for (const [teamNum, teamData] of Object.entries(teamsData)) {
        const {stats} = teamData;
        
        const consistency = calculateConsistency(teamData.scouting_data);
        
        const radarData = [
            normalizeValue(stats.avg_auto, 0, 30, 10),
            normalizeValue(stats.avg_teleop, 0, 50, 10),
            normalizeValue(stats.avg_endgame, 0, 10, 10),
            consistency,
            normalizeValue(stats.avg_total, 0, 90, 10)
        ];

        if (teamNum === Object.keys(teamsData)[0]) {
            team1Data = radarData;
            if (team1RadarChart) {
                team1RadarChart.destroy();
            }
            team1RadarChart = createRadarChart('radar-chart-team1', radarData);
        } else {
            team2Data = radarData;
            if (team2RadarChart) {
                team2RadarChart.destroy();
            }
            team2RadarChart = createRadarChart('radar-chart-team2', radarData);
        }
    }

    // Update combined chart
    if (team1Data && team2Data) {
        if (combinedRadarChart) {
            combinedRadarChart.destroy();
        }
        combinedRadarChart = createRadarChart('radar-chart-combined', [team1Data, team2Data], true);
    }
}

// Export the updateRadarCharts function
window.updateRadarCharts = updateRadarCharts;