// Global state
let profiles = [];
let refreshInterval;
let apiPath = '';
let currentSortColumn = 'timestamp';
let currentSortDirection = 'desc';

// Chart instances
let responseTimeChart;
let requestsByMethodChart;
let endpointDistributionChart;

// Simple formatter for time display
const formatTime = (seconds) => (seconds * 1000).toFixed(2);

// Format relative time for better readability
const formatTimeAgo = (timestamp) => {
    if (!timestamp) return '-';
    const date = new Date(parseInt(timestamp * 1000));
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return date.toLocaleString();
};

// Fetch profile data from API
async function fetchData() {
    try {
        // Show a subtle loading indicator
        document.body.classList.add('loading-data');
        
        const response = await fetch(apiPath);
        if (!response.ok) {
            console.error('Failed to fetch data:', response.statusText);
            return;
        }

        const newProfiles = await response.json();
        
        // Check if we have new data
        const hasNewData = newProfiles.length !== profiles.length;
        
        // Update profiles
        profiles = newProfiles;
        
        // Update the dashboard
        updateDashboard();
        
        // Record the update time
        chartState.lastUpdateTime = Date.now();
        
        // Remove loading indicator
        document.body.classList.remove('loading-data');
        
        return hasNewData;
    } catch (error) {
        console.error('Error fetching data:', error);
        document.body.classList.remove('loading-data');
        return false;
    }
}

// Update all dashboard components with new data
function updateDashboard() {
    if (!profiles.length) {
        console.log('No profile data available');
        return;
    }

    // Update all dashboard sections
    updateStats();
    updateSlowestEndpointsTable();
    updateEndpointsTable();
    updateRequestsTable();
    updateCharts();
}

// Update stat cards
function updateStats() {
    document.getElementById('stat-total-requests').textContent = profiles.length;

    const avgResponseTime = profiles.reduce((sum, p) => sum + p.total_time, 0) / profiles.length;
    document.getElementById('stat-avg-response-time').textContent = formatTime(avgResponseTime) + ' ms';

    const maxResponseTime = Math.max(...profiles.map(p => p.total_time));
    document.getElementById('stat-max-response-time').textContent = formatTime(maxResponseTime) + ' ms';

    const uniqueEndpoints = new Set(profiles.map(p => p.method + ' ' + p.path)).size;
    document.getElementById('stat-unique-endpoints').textContent = uniqueEndpoints;
}

// Group profiles by endpoint
function getEndpointStats() {
    const endpointMap = new Map();

    profiles.forEach(profile => {
        const key = profile.method + ' ' + profile.path;

        if (!endpointMap.has(key)) {
            endpointMap.set(key, {
                method: profile.method,
                path: profile.path,
                count: 0,
                total: 0,
                min: Infinity,
                max: 0
            });
        }

        const stats = endpointMap.get(key);
        stats.count += 1;
        stats.total += profile.total_time;
        stats.min = Math.min(stats.min, profile.total_time);
        stats.max = Math.max(stats.max, profile.total_time);
    });

    // Calculate averages and convert to array
    return Array.from(endpointMap.values()).map(stats => {
        return {
            ...stats,
            avg: stats.total / stats.count
        };
    });
}

// Update slowest endpoints table
function updateSlowestEndpointsTable() {
    const endpointStats = getEndpointStats()
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 5);

    const tableBody = document.getElementById('slowest-endpoints-table').querySelector('tbody');
    tableBody.innerHTML = '';

    endpointStats.forEach(stat => {
        const row = document.createElement('tr');

        row.innerHTML = `
            <td class="text-gray-700">${stat.method}</td>
            <td class="font-medium text-gray-900">${stat.path}</td>
            <td class="text-indigo-600 font-medium">${formatTime(stat.avg)} ms</td>
            <td class="text-red-600">${formatTime(stat.max)} ms</td>
            <td class="text-gray-500">${stat.count}</td>
        `;

        tableBody.appendChild(row);
    });

    if (endpointStats.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500">No data available</td></tr>`;
    }
}

// Update endpoints table
function updateEndpointsTable() {
    let endpointStats = getEndpointStats();
    const searchTerm = document.getElementById('endpoint-search')?.value?.toLowerCase() || '';

    // Apply search filter
    if (searchTerm) {
        endpointStats = endpointStats.filter(stat => 
            stat.path.toLowerCase().includes(searchTerm) || 
            stat.method.toLowerCase().includes(searchTerm)
        );
    }

    // Apply sorting
    if (currentSortColumn) {
        endpointStats.sort((a, b) => {
            let valA, valB;

            switch(currentSortColumn) {
                case 'method': valA = a.method; valB = b.method; break;
                case 'path': valA = a.path; valB = b.path; break;
                case 'avg': valA = a.avg; valB = b.avg; break;
                case 'max': valA = a.max; valB = b.max; break;
                case 'min': valA = a.min; valB = b.min; break;
                case 'count': valA = a.count; valB = b.count; break;
                default: valA = a.avg; valB = b.avg;
            }

            if (typeof valA === 'string') {
                return currentSortDirection === 'asc' 
                    ? valA.localeCompare(valB) 
                    : valB.localeCompare(valA);
            } else {
                return currentSortDirection === 'asc' 
                    ? valA - valB 
                    : valB - valA;
            }
        });
    }

    const tableBody = document.getElementById('endpoints-table').querySelector('tbody');
    tableBody.innerHTML = '';

    endpointStats.forEach(stat => {
        const row = document.createElement('tr');

        row.innerHTML = `
            <td class="text-gray-700">${stat.method}</td>
            <td class="font-medium text-gray-900">${stat.path}</td>
            <td class="text-indigo-600 font-medium">${formatTime(stat.avg)} ms</td>
            <td class="text-red-600">${formatTime(stat.max)} ms</td>
            <td class="text-green-600">${formatTime(stat.min)} ms</td>
            <td class="text-gray-500">${stat.count}</td>
        `;

        tableBody.appendChild(row);
    });

    if (endpointStats.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-gray-500">No data available</td></tr>`;
    }
}

// Update requests table
function updateRequestsTable() {
    let filteredProfiles = [...profiles];
    const searchTerm = document.getElementById('request-search')?.value?.toLowerCase() || '';

    // Apply search filter
    if (searchTerm) {
        filteredProfiles = filteredProfiles.filter(profile => 
            profile.path.toLowerCase().includes(searchTerm) || 
            profile.method.toLowerCase().includes(searchTerm)
        );
    }

    // Apply sorting
    if (currentSortColumn) {
        filteredProfiles.sort((a, b) => {
            let valA, valB;

            switch(currentSortColumn) {
                case 'timestamp': valA = a.start_time; valB = b.start_time; break;
                case 'method': valA = a.method; valB = b.method; break;
                case 'path': valA = a.path; valB = b.path; break;
                case 'time': valA = a.total_time; valB = b.total_time; break;
                default: valA = a.start_time; valB = b.start_time;
            }

            if (typeof valA === 'string') {
                return currentSortDirection === 'asc' 
                    ? valA.localeCompare(valB) 
                    : valB.localeCompare(valA);
            } else {
                return currentSortDirection === 'asc' 
                    ? valA - valB 
                    : valB - valA;
            }
        });
    }

    const tableBody = document.getElementById('requests-table').querySelector('tbody');
    tableBody.innerHTML = '';

    filteredProfiles.slice(0, 100).forEach(profile => {
        const row = document.createElement('tr');

        // Define row color based on response time
        let timeClass = 'text-indigo-600';
        if (profile.total_time > 0.5) timeClass = 'text-red-600';
        else if (profile.total_time > 0.1) timeClass = 'text-yellow-600';

        row.innerHTML = `
            <td class="text-gray-500">${formatTimeAgo(profile.start_time)}</td>
            <td class="text-gray-700">${profile.method}</td>
            <td class="font-medium text-gray-900">${profile.path}</td>
            <td class="${timeClass} font-medium">${formatTime(profile.total_time)} ms</td>
        `;

        tableBody.appendChild(row);
    });

    if (filteredProfiles.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">No data available</td></tr>`;
    }
}

// Update all charts
function updateCharts() {
    updateResponseTimeChart();
    updateRequestsByMethodChart();
    updateEndpointDistributionChart();
}

// Store chart state and data
let chartState = {
    hiddenDatasets: [],
    lastProfileCount: 0,
    currentChartData: [],
    lastUpdateTime: Date.now()
};

// Update response time chart
function updateResponseTimeChart() {
    // Get the most recent 50 requests, sorted by time
    const sortedProfiles = [...profiles].sort((a, b) => a.start_time - b.start_time);
    const last50Profiles = sortedProfiles.slice(-50);
    
    // Check if we have new data
    const hasNewData = profiles.length !== chartState.lastProfileCount;
    chartState.lastProfileCount = profiles.length;
    
    // Prepare data points in the format Chart.js expects
    const dataPoints = last50Profiles.map(p => ({
        x: new Date(p.start_time * 1000),
        y: p.total_time * 1000
    }));

    // Store the data for tooltip access
    chartState.currentChartData = last50Profiles;

    if (responseTimeChart) {
        // Save hidden state before update
        if (responseTimeChart.legend && responseTimeChart.legend.legendItems) {
            chartState.hiddenDatasets = responseTimeChart.legend.legendItems
                .filter(item => item.hidden)
                .map(item => item.datasetIndex);
        }
        
        // Update data without recreating the chart
        responseTimeChart.data.datasets[0].data = dataPoints;
        
        // Apply previous hidden state
        chartState.hiddenDatasets.forEach(index => {
            responseTimeChart.setDatasetVisibility(index, false);
        });
        
        // Use a smooth animation for new data points
        responseTimeChart.update({
            duration: hasNewData ? 300 : 0,
            easing: 'easeOutQuad',
            preservation: true,  // Preserve scale zoom/pan
            animations: {
                y: {
                    duration: 300,
                    easing: 'easeOutQuad'
                }
            }
        });
        
        // Add visual pulse effect when new data arrives
        if (hasNewData) {
            const chartContainer = document.getElementById('response-time-chart').closest('.chart-container');
            const pulseEffect = document.createElement('div');
            pulseEffect.className = 'chart-update-pulse';
            chartContainer.appendChild(pulseEffect);
            setTimeout(() => pulseEffect.remove(), 1000);
        }
    } else {
        // Create a new chart only the first time
        const ctx = document.getElementById('response-time-chart').getContext('2d');
        responseTimeChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Response Time (ms)',
                    data: dataPoints,
                    borderColor: 'rgb(79, 70, 229)',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    pointBackgroundColor: 'rgb(79, 70, 229)',
                    pointBorderColor: 'white',
                    pointBorderWidth: 1,
                    // Add gradient fill for better visual effect
                    backgroundColor: (context) => {
                        const chart = context.chart;
                        const {ctx, chartArea} = chart;
                        if (!chartArea) return 'rgba(79, 70, 229, 0.1)';
                        
                        // Create gradient
                        const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                        gradient.addColorStop(0, 'rgba(79, 70, 229, 0.01)');
                        gradient.addColorStop(1, 'rgba(79, 70, 229, 0.2)');
                        return gradient;
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 300,
                    easing: 'easeOutQuad'
                },
                transitions: {
                    active: {
                        animation: {
                            duration: 300
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    intersect: false,
                    axis: 'x'
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'second',
                            tooltipFormat: 'HH:mm:ss',
                            displayFormats: {
                                second: 'HH:mm:ss'
                            }
                        },
                        ticks: {
                            maxRotation: 0
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Response Time (ms)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        onClick: (e, legendItem, legend) => {
                            // Toggle dataset visibility
                            const index = legendItem.datasetIndex;
                            const isHidden = !legend.chart.isDatasetVisible(index);
                            legend.chart.setDatasetVisibility(index, isHidden);
                            
                            // Save state
                            chartState.hiddenDatasets = legend.chart.legend.legendItems
                                .filter(item => !legend.chart.isDatasetVisible(item.datasetIndex))
                                .map(item => item.datasetIndex);
                            
                            legend.chart.update();
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            title: (context) => {
                                if (!context || !context[0]) return 'Unknown';
                                const index = context[0].dataIndex;
                                const profile = chartState.currentChartData[index];
                                return profile ? `${profile.method} ${profile.path}` : 'Unknown';
                            },
                            label: (context) => {
                                if (!context || !context.parsed) return '';
                                return `Response time: ${context.parsed.y.toFixed(2)} ms`;
                            }
                        }
                    }
                }
            }
        });
    }
}

// Update requests by method chart (doughnut)
function updateRequestsByMethodChart() {
    // If chart exists, destroy it to prevent rotation issues
    if (requestsByMethodChart) {
        requestsByMethodChart.destroy();
    }
    
    // Count requests by HTTP method
    const methodCounts = {};
    profiles.forEach(profile => {
        if (!methodCounts[profile.method]) {
            methodCounts[profile.method] = 0;
        }
        methodCounts[profile.method]++;
    });

    // Prepare data for chart
    const methods = Object.keys(methodCounts);
    const counts = methods.map(method => methodCounts[method]);
    
    // Standard colors for HTTP methods
    const colorMap = {
        'GET': 'rgb(52, 211, 153)',
        'POST': 'rgb(79, 70, 229)',
        'PUT': 'rgb(251, 191, 36)',
        'DELETE': 'rgb(239, 68, 68)',
        'PATCH': 'rgb(167, 139, 250)'
    };
    
    // Create a fresh chart
    const ctx = document.getElementById('requests-by-method-chart').getContext('2d');
    requestsByMethodChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: methods,
            datasets: [{
                data: counts,
                backgroundColor: methods.map(method => colorMap[method] || 'rgb(107, 114, 128)'),
                borderWidth: 1,
                borderColor: '#ffffff',
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            // Disable rotation animation
            animation: {
                animateRotate: false
            },
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        generateLabels: function(chart) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map((label, i) => {
                                    const meta = chart.getDatasetMeta(0);
                                    const style = meta.controller.getStyle(i);
                                    
                                    return {
                                        text: label,
                                        fillStyle: style.backgroundColor,
                                        strokeStyle: style.borderColor,
                                        lineWidth: style.borderWidth,
                                        hidden: false,
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const label = context.label || '';
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((value / total) * 100);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Update endpoint distribution chart
function updateEndpointDistributionChart() {
    // If chart exists, destroy it to prevent animation issues
    if (endpointDistributionChart) {
        endpointDistributionChart.destroy();
    }
    
    // Get top 10 endpoints by request count
    const endpointStats = getEndpointStats()
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    // Prepare data for chart
    const labels = endpointStats.map(stat => `${stat.method} ${stat.path}`);
    const requestCounts = endpointStats.map(stat => stat.count);
    const avgTimes = endpointStats.map(stat => stat.avg * 1000);

    // Create a fresh chart
    const ctx = document.getElementById('endpoint-distribution-chart').getContext('2d');
    endpointDistributionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Request Count',
                    data: requestCounts,
                    backgroundColor: 'rgb(79, 70, 229)',
                    borderColor: 'rgb(79, 70, 229)',
                    borderWidth: 1,
                    order: 1
                },
                {
                    label: 'Avg Time (ms)',
                    data: avgTimes,
                    backgroundColor: 'rgb(52, 211, 153)',
                    borderColor: 'rgb(52, 211, 153)',
                    borderWidth: 1,
                    order: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 300,
                easing: 'easeOutQuad'
            },
            transitions: {
                active: {
                    animation: {
                        duration: 300
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Value'
                    }
                }
            }
        }
    });
}

// Set up tab switching
function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            tabs.forEach(t => t.classList.remove('active'));

            // Add active class to clicked tab
            tab.classList.add('active');

            // Hide all tab contents
            tabContents.forEach(content => content.classList.add('hidden'));

            // Show selected tab content
            const contentId = tab.id.replace('tab-', 'content-');
            document.getElementById(contentId).classList.remove('hidden');
        });
    });
}

// Set up table sorting
function setupTableSorting() {
    const tables = document.querySelectorAll('.data-table');

    tables.forEach(table => {
        const headers = table.querySelectorAll('th[data-sort]');

        headers.forEach(header => {
            header.addEventListener('click', () => {
                const column = header.getAttribute('data-sort');

                // Toggle direction if same column, otherwise default to ascending
                if (column === currentSortColumn) {
                    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSortColumn = column;
                    currentSortDirection = 'asc';
                }

                // Update tables
                updateEndpointsTable();
                updateRequestsTable();

                // Update sort indicators (could add visual indicators here)
            });
        });
    });
}

// Set up search functionality
function setupSearch() {
    const endpointSearch = document.getElementById('endpoint-search');
    if (endpointSearch) {
        endpointSearch.addEventListener('input', () => {
            updateEndpointsTable();
        });
    }

    const requestSearch = document.getElementById('request-search');
    if (requestSearch) {
        requestSearch.addEventListener('input', () => {
            updateRequestsTable();
        });
    }
}

// Set up refresh rate control
function setupRefreshControl() {
    const refreshRateSelect = document.getElementById('refresh-rate');
    const refreshBtn = document.getElementById('refresh-btn');

    // Handle refresh rate change
    refreshRateSelect.addEventListener('change', () => {
        const rate = parseInt(refreshRateSelect.value);

        // Clear existing interval
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }

        // Set new interval if not manual
        if (rate > 0) {
            refreshInterval = setInterval(() => {
                const now = Date.now();
                // Prevent too frequent updates
                if (now - chartState.lastUpdateTime > rate * 0.8) {
                    chartState.lastUpdateTime = now;
                    fetchData().then(hasNewData => {
                        // Add a visual indicator when new data arrives
                        if (hasNewData) {
                            const indicator = document.createElement('div');
                            indicator.className = 'update-indicator';
                            document.body.appendChild(indicator);
                            setTimeout(() => indicator.remove(), 500);
                        }
                    });
                }
            }, rate);
            console.log(`Auto-refresh set to ${rate}ms`);
        } else {
            console.log('Auto-refresh disabled');
        }
    });

    // Handle manual refresh
    refreshBtn.addEventListener('click', () => {
        // Visual feedback for the button
        refreshBtn.classList.add('refreshing');
        setTimeout(() => refreshBtn.classList.remove('refreshing'), 500);
        
        // Fetch data
        fetchData();
    });
}

// Configure Chart.js defaults
function configureChartDefaults() {
    // Basic defaults
    Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    Chart.defaults.responsive = true;
    Chart.defaults.maintainAspectRatio = false;
    
    // Line chart optimizations for live data
    Chart.overrides.line = {
        animations: {
            colors: {
                type: 'color',
                duration: 0
            },
            numbers: {
                type: 'number',
                duration: 300,
                easing: 'easeOutQuad'
            }
        },
        transitions: {
            active: {
                animation: {
                    duration: 300
                }
            },
            show: {
                animations: {
                    x: {
                        from: 0
                    },
                    y: {
                        from: 0
                    }
                }
            },
            hide: {
                animations: {
                    x: {
                        to: 0
                    },
                    y: {
                        to: 0
                    }
                }
            }
        },
        interaction: {
            mode: 'nearest',
            intersect: false,
            axis: 'x'
        },
        plugins: {
            tooltip: {
                enabled: true,
                position: 'nearest'
            }
        },
        elements: {
            line: {
                tension: 0.3
            },
            point: {
                radius: 3,
                hoverRadius: 5
            }
        }
    };
    
    // Doughnut chart optimizations
    Chart.overrides.doughnut = {
        animation: {
            animateRotate: false
        },
        plugins: {
            legend: {
                position: 'right'
            }
        }
    };
}

// Initialize dashboard
function initDashboard(dashboardApiPath) {
    // Set API path for data fetching
    apiPath = dashboardApiPath;
    
    // Set up UI interactions
    setupTabs();
    setupTableSorting();
    setupSearch();
    setupRefreshControl();

    // Configure Chart.js
    configureChartDefaults();

    // Initial data fetch
    fetchData();

    // Set default refresh interval (2 seconds for more responsive updates)
    refreshInterval = setInterval(() => {
        const now = Date.now();
        // Only fetch if more than 1.5 seconds have passed since last update
        // This prevents multiple fetches if updates are triggered by other events
        if (now - chartState.lastUpdateTime > 1500) {
            chartState.lastUpdateTime = now;
            fetchData();
        }
    }, 2000);
}

// Export the init function for use in the HTML
window.initDashboard = initDashboard;

// Make sure initDashboard is globally available
if (typeof window !== 'undefined') {
    window.initDashboard = initDashboard;
}
