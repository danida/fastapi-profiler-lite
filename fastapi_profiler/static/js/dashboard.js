// Global state
let dashboardData = {};
let refreshInterval;
let apiPath = '';
let currentSortColumn = 'timestamp';
let currentSortDirection = 'desc';

// Chart instances
let responseTimeChart;
let requestsByMethodChart;
let endpointDistributionChart;
let statusCodeChart;

// Simple formatter for time display with two decimal places
const formatTime = (ms) => ms.toFixed(2);

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

// Function to handle Tabler's tab system
function setupTablerTabs() {
    // Tabler uses Bootstrap's tab system which is already initialized via the CDN
    // We just need to handle our own tab content visibility when tabs are clicked
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', function (e) {
            // This event is fired after a tab is shown
            // We don't need to manually show/hide content as Bootstrap handles it
            
            // Update charts when tabs are shown
            const targetTab = e.target.getAttribute('href');
            
            // Main tabs
            if (targetTab === '#tab-http') {
                updateCharts();
            } else if (targetTab === '#tab-database') {
                updateDatabaseSection();
            }
            
            // HTTP sub-tabs
            if (targetTab === '#tab-http-overview') {
                updateCharts();
            } else if (targetTab === '#tab-http-endpoints') {
                updateEndpointDistributionChart();
            }
        });
    });
}

// Loading indicator functions
function showLoadingIndicator() {
    document.body.classList.add('layout-loading');
}

function hideLoadingIndicator() {
    document.body.classList.remove('layout-loading');
}

// Global flag to prevent updates during user interaction
let isUserInteracting = false;
let pendingDataUpdate = false;
let lastDataTimestamp = 0;

// Fetch dashboard data from API
async function fetchData() {
    try {
        // Don't show loading indicator if user is interacting
        if (!isUserInteracting) {
            showLoadingIndicator();
        }
        
        const response = await fetch(`${apiPath.replace('/profiles', '')}/api/dashboard-data`);
        if (!response.ok) {
            console.error('Failed to fetch data:', response.statusText);
            if (!isUserInteracting) hideLoadingIndicator();
            return false;
        }

        const newData = await response.json();
        
        // Check if we have new data
        const hasNewData = !dashboardData.timestamp || 
                          newData.timestamp > dashboardData.timestamp;
        
        if (hasNewData) {
            // Store the timestamp for comparison
            lastDataTimestamp = newData.timestamp;
            
            // Update data
            dashboardData = newData;
            
            // Only update UI if user is not interacting
            if (!isUserInteracting) {
                updateDashboard();
            } else {
                // Mark that we have pending updates
                pendingDataUpdate = true;
            }
        }
        
        // Record the update time
        chartState.lastUpdateTime = Date.now();
        
        if (!isUserInteracting) hideLoadingIndicator();
        
        return hasNewData;
    } catch (error) {
        console.error('Error fetching data:', error);
        if (!isUserInteracting) hideLoadingIndicator();
        return false;
    }
}

// Update all dashboard components with new data
function updateDashboard() {
    if (!dashboardData.timestamp) {
        console.log('No dashboard data available');
        return;
    }

    // Update HTTP profiler sections
    updateStats();
    updateSlowestEndpointsTable();
    updateEndpointsTable();
    updateRequestsTable();
    updateCharts();
    
    // Update Database profiler section
    updateDatabaseSection();
}

// Update database section
function updateDatabaseSection() {
    if (!dashboardData.database) {
        return;
    }
    
    // Update database stats
    if (dashboardData.database) {
        const dbStats = dashboardData.database;
        document.getElementById('stat-db-queries').textContent = dbStats.query_count;
        document.getElementById('stat-db-avg-time').textContent = dbStats.avg_time.toFixed(2) + ' ms';
        document.getElementById('stat-db-max-time').textContent = dbStats.max_time.toFixed(2) + ' ms';
        document.getElementById('stat-db-total-time').textContent = dbStats.total_time.toFixed(2) + ' ms';
    }
    
    // Update tables and charts without engine filter
    updateDbQueriesTable();
    updateDbSlowestQueriesTable();
    updateDbTimeChart();
}

// Update engine filter dropdown
function updateEngineFilterDropdown() {
    const dropdown = document.getElementById('db-engine-filter');
    if (!dropdown) return;
    
    // Save current selection
    const currentSelection = dropdown.value;
    
    // Get all available engines
    const engines = dashboardData.database.engines || [];
    
    // Get unique engine names from recent queries
    const engineNames = new Set();
    engineNames.add(''); // Add empty option for "All Engines"
    
    // Add engines from the engine stats
    engines.forEach(engine => {
        engineNames.add(engine.name);
    });
    
    // Add engines from recent queries that might not be in the stats yet
    if (dashboardData.requests && dashboardData.requests.recent) {
        dashboardData.requests.recent.forEach(req => {
            if (req.db_queries) {
                req.db_queries.forEach(query => {
                    if (query.metadata) {
                        const engineName = query.metadata.name || query.metadata.dialect;
                        if (engineName) engineNames.add(engineName);
                    }
                });
            }
        });
    }
    
    // Clear existing options except the first one
    while (dropdown.options.length > 1) {
        dropdown.remove(1);
    }
    
    // Add engine options
    Array.from(engineNames)
        .filter(name => name !== '') // Skip the empty option as it's already there
        .sort()
        .forEach(engineName => {
            const option = document.createElement('option');
            option.value = engineName;
            option.textContent = engineName;
            dropdown.appendChild(option);
        });
    
    // Restore selection if it still exists
    if (Array.from(engineNames).includes(currentSelection)) {
        dropdown.value = currentSelection;
    }
}

// Update database engines table and tabs
function updateDbEnginesTable() {
    if (!dashboardData.database || !dashboardData.database.engines) {
        return;
    }
    
    const engines = dashboardData.database.engines;
    const tableBody = document.getElementById('db-engines-table').querySelector('tbody');
    tableBody.innerHTML = '';
    
    if (engines.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-gray-500">No database engines detected</td></tr>`;
        return;
    }
    
    // Update the engines table
    engines.forEach(engine => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="font-medium text-gray-900">${engine.name}</td>
            <td>${engine.dialect}</td>
            <td class="text-gray-700">${engine.query_count}</td>
            <td class="text-indigo-600 font-medium">${formatTime(engine.avg_time)} ms</td>
            <td class="text-red-600">${formatTime(engine.max_time)} ms</td>
            <td class="text-cyan-600">${formatTime(engine.total_time)} ms</td>
        `;
        tableBody.appendChild(row);
    });
    
    // Update engine tabs
    updateEngineTabsAndContent(engines);
}

// Update engine tabs and their content
function updateEngineTabsAndContent(engines) {
    const tabsContainer = document.getElementById('db-engine-tabs');
    const tabContent = tabsContainer.closest('.tab-content');
    
    // Get existing engine tabs
    const existingTabs = Array.from(tabsContainer.querySelectorAll('li.nav-item:not(:first-child)'));
    const existingTabIds = existingTabs.map(tab => tab.querySelector('a').getAttribute('href').substring(1));
    
    // Get current engine names
    const engineNames = engines.map(engine => engine.name);
    
    // Remove tabs for engines that no longer exist
    existingTabs.forEach(tab => {
        const tabLink = tab.querySelector('a');
        const engineName = tabLink.textContent;
        
        if (!engineNames.includes(engineName)) {
            // Remove tab
            tab.remove();
            
            // Remove corresponding content
            const contentId = tabLink.getAttribute('href').substring(1);
            const content = document.getElementById(contentId);
            if (content) {
                content.remove();
            }
        }
    });
    
    // Add tabs for new engines
    engines.forEach(engine => {
        const tabId = `tab-engine-${engine.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
        
        // Skip if tab already exists
        if (existingTabIds.includes(tabId)) {
            return;
        }
        
        // Create new tab
        const tab = document.createElement('li');
        tab.className = 'nav-item';
        tab.innerHTML = `<a href="#${tabId}" class="nav-link" data-bs-toggle="tab">${engine.name}</a>`;
        
        // Add click handler to filter queries when tab is clicked
        tab.querySelector('a').addEventListener('click', () => {
            // Update the engine filter dropdown to match this engine
            const filterDropdown = document.getElementById('db-engine-filter');
            if (filterDropdown) {
                filterDropdown.value = engine.name;
                // Trigger the change event to update the queries table
                const event = new Event('change');
                filterDropdown.dispatchEvent(event);
            }
        });
        
        tabsContainer.appendChild(tab);
        
        // Create tab content
        const content = document.createElement('div');
        content.id = tabId;
        content.className = 'tab-pane';
        content.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">${engine.name} (${engine.dialect})</h3>
                    <div class="card-subtitle text-muted mt-1">${engine.url}</div>
                </div>
                <div class="card-body">
                    <div class="row row-deck row-cards mb-3">
                        <div class="col-sm-6 col-lg-3">
                            <div class="card">
                                <div class="card-body">
                                    <div class="d-flex align-items-center">
                                        <div class="subheader">Queries</div>
                                    </div>
                                    <div class="h1 mb-0 text-blue">${engine.query_count}</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-sm-6 col-lg-3">
                            <div class="card">
                                <div class="card-body">
                                    <div class="d-flex align-items-center">
                                        <div class="subheader">Avg Time</div>
                                    </div>
                                    <div class="h1 mb-0 text-purple">${formatTime(engine.avg_time)} ms</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-sm-6 col-lg-3">
                            <div class="card">
                                <div class="card-body">
                                    <div class="d-flex align-items-center">
                                        <div class="subheader">Max Time</div>
                                    </div>
                                    <div class="h1 mb-0 text-orange">${formatTime(engine.max_time)} ms</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-sm-6 col-lg-3">
                            <div class="card">
                                <div class="card-body">
                                    <div class="d-flex align-items-center">
                                        <div class="subheader">Total Time</div>
                                    </div>
                                    <div class="h1 mb-0 text-cyan">${formatTime(engine.total_time)} ms</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="table-responsive">
                        <table class="table table-vcenter card-table engine-queries-table" data-engine="${engine.name}">
                            <thead>
                                <tr>
                                    <th>Endpoint</th>
                                    <th>Query</th>
                                    <th>Time (ms)</th>
                                    <th>Timestamp</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td colspan="4" class="text-center">Loading engine-specific queries...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        
        // Add to tab content container
        tabContent.appendChild(content);
    });
    
    // Update engine-specific query tables
    updateEngineQueryTables(engines);
}

// Update slowest database queries table
function updateDbSlowestQueriesTable() {
    const tableBody = document.getElementById('db-slowest-queries-table').querySelector('tbody');
    tableBody.innerHTML = '';
    
    // Use pre-processed slowest queries from the backend if available
    let allQueries = dashboardData.database?.slowest_queries || [];
    
    // If no pre-processed queries, fall back to extracting from recent requests
    if (allQueries.length === 0) {
        // Get recent requests with database queries
        const recentRequests = dashboardData.requests.recent || [];
        const requestsWithQueries = recentRequests.filter(req => req.db_queries && req.db_queries.length > 0);
        
        if (requestsWithQueries.length === 0) {
            // Check if we have any database stats at all
            if (dashboardData.database && dashboardData.database.query_count > 0) {
                tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500">
                    Database queries exist (${dashboardData.database.query_count} total) but detailed query data is not available in recent requests.
                    Try making more requests to see query details.
                </td></tr>`;
            } else {
                tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500">
                    No database queries recorded. Make sure your database is properly instrumented.
                    <br><br>
                    <strong>Example:</strong><br>
                    <code>app.state.sqlalchemy_engine = engine</code><br>
                    <code>Profiler(app, instrument_db=True)</code>
                </td></tr>`;
            }
            return;
        }
        
        // Flatten the queries from all requests
        requestsWithQueries.forEach(req => {
            if (req.db_queries) {
                req.db_queries.forEach(query => {
                    // Get engine name from metadata if available
                    let engineName = 'Unknown';
                    if (query.metadata) {
                        engineName = query.metadata.name || query.metadata.dialect || 'Unknown';
                    }
                    
                    allQueries.push({
                        endpoint: `${req.method} ${req.path}`,
                        statement: query.statement,
                        duration: query.duration,
                        timestamp: req.start_time,
                        metadata: query.metadata || {},
                        engine: engineName
                    });
                });
            }
        });
        
        // Sort by duration (slowest first)
        allQueries.sort((a, b) => b.duration - a.duration);
    }
    
    // Take only the slowest 20 queries
    allQueries = allQueries.slice(0, 20);
    
    // Render table rows
    allQueries.forEach(query => {
        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        row.classList.add('hover-highlight');
        
        // Truncate very long queries for display
        let displayStatement = query.statement;
        if (displayStatement.length > 100) {
            displayStatement = displayStatement.substring(0, 97) + '...';
        }
        
        // Detect database type
        const dbType = detectDatabaseType(query.statement);
        
        // Get engine name
        const engineName = query.engine || dbType;
        
        // Get query type
        const queryType = query.metadata?.query_type || detectQueryType(query.statement);
        const queryTypeBadge = getQueryTypeBadge(queryType);
        
        row.innerHTML = `
            <td class="text-gray-700">${query.endpoint}</td>
            <td class="font-mono text-xs" style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <div class="d-flex align-items-center">
                    <span class="badge ${queryTypeBadge.color} me-2" style="font-weight: 600; min-width: 70px; text-align: center; flex-shrink: 0;">${queryTypeBadge.label}</span>
                    <i class="ti ti-click me-1 text-primary" style="font-size: 14px; flex-shrink: 0;"></i>
                    <span class="text-dark" style="font-weight: 500; overflow: hidden; text-overflow: ellipsis;">${displayStatement}</span>
                </div>
            </td>
            <td class="text-indigo-600 font-medium">${(query.duration * 1000).toFixed(2)} ms</td>
            <td class="text-gray-500">${formatTimeAgo(query.timestamp)}</td>
            <td><span class="badge bg-azure text-white" style="font-weight: 500;">${engineName}</span></td>
        `;
        
        // Add click handler to show full query details
        row.addEventListener('click', () => {
            showSqlDetails(query);
        });
        
        tableBody.appendChild(row);
    });
}

// Update engine-specific query tables
function updateEngineQueryTables(engines) {
    if (!dashboardData.requests || !dashboardData.requests.recent) {
        return;
    }
    
    // Get recent requests with database queries
    const recentRequests = dashboardData.requests.recent || [];
    const requestsWithQueries = recentRequests.filter(req => req.db_queries && req.db_queries.length > 0);
    
    if (requestsWithQueries.length === 0) {
        return;
    }
    
    // Process each engine
    engines.forEach(engine => {
        const engineName = engine.name;
        const tableSelector = `.engine-queries-table[data-engine="${engineName}"]`;
        const table = document.querySelector(tableSelector);
        
        if (!table) return;
        
        const tableBody = table.querySelector('tbody');
        tableBody.innerHTML = '';
        
        // Flatten the queries from all requests for this engine
        let engineQueries = [];
        requestsWithQueries.forEach(req => {
            if (!req.db_queries) return;
            
            req.db_queries.forEach(query => {
                if (query.metadata && 
                    ((query.metadata.name === engineName) || 
                     (query.metadata.dialect === engineName))) {
                    engineQueries.push({
                        endpoint: `${req.method} ${req.path}`,
                        statement: query.statement,
                        duration: query.duration,
                        timestamp: req.start_time,
                        metadata: query.metadata || {},
                        query_type: query.metadata?.query_type || detectQueryType(query.statement)
                    });
                }
            });
        });
        
        // Sort by timestamp (most recent first)
        engineQueries.sort((a, b) => b.timestamp - a.timestamp);
        
        // Take only the most recent 10 queries
        engineQueries = engineQueries.slice(0, 10);
        
        if (engineQueries.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">No queries found for this engine</td></tr>`;
            return;
        }
        
        // Render table rows
        engineQueries.forEach(query => {
            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            row.classList.add('hover-highlight');
            
            // Truncate very long queries for display
            let displayStatement = query.statement;
            if (displayStatement.length > 100) {
                displayStatement = displayStatement.substring(0, 97) + '...';
            }
            
            // Get query type badge color
            const queryTypeBadge = getQueryTypeBadge(query.query_type);
            
            row.innerHTML = `
                <td class="text-gray-700">${query.endpoint}</td>
                <td class="font-mono text-xs" style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <div class="d-flex align-items-center">
                        <span class="badge ${queryTypeBadge.color} me-2" style="font-weight: 600; min-width: 70px; text-align: center; flex-shrink: 0;">${queryTypeBadge.label}</span>
                        <i class="ti ti-click me-1 text-primary" style="font-size: 14px; flex-shrink: 0;"></i>
                        <span class="text-dark" style="font-weight: 500; overflow: hidden; text-overflow: ellipsis;">${displayStatement}</span>
                    </div>
                </td>
                <td class="text-indigo-600 font-medium">${formatTime(query.duration * 1000)} ms</td>
                <td class="text-gray-500">${formatTimeAgo(query.timestamp)}</td>
            `;
            
            // Add click handler to show full query details
            row.addEventListener('click', () => {
                showSqlDetails(query);
            });
            
            tableBody.appendChild(row);
        });
    });
}

// Helper function to detect database type from SQL query
function detectDatabaseType(sql) {
    sql = sql.toLowerCase();
    
    // PostgreSQL specific syntax
    if (sql.includes('::') || 
        sql.includes('returning ') || 
        sql.includes('ilike ') || 
        sql.includes('now()') ||
        sql.includes('uuid_generate_v4()')) {
        return 'PostgreSQL';
    }
    
    // MySQL specific syntax
    if (sql.includes('limit ?, ?') || 
        sql.includes('on duplicate key') || 
        sql.includes('auto_increment') ||
        sql.includes('from_unixtime(')) {
        return 'MySQL';
    }
    
    // SQLite specific syntax
    if (sql.includes('sqlite_master') || 
        sql.includes('pragma ') || 
        sql.includes('rowid') ||
        sql.includes('ifnull(')) {
        return 'SQLite';
    }
    
    // SQL Server specific syntax
    if (sql.includes('top (') || 
        sql.includes('isnull(') || 
        sql.includes('getdate()') ||
        sql.includes('nolock')) {
        return 'SQL Server';
    }
    
    // Oracle specific syntax
    if (sql.includes('dual') || 
        sql.includes('sysdate') || 
        sql.includes('rownum') ||
        sql.includes('nvl(')) {
        return 'Oracle';
    }
    
    // Default to generic SQL
    return 'SQL';
}

// Helper function to detect query type from SQL
function detectQueryType(sql) {
    if (!sql) return 'UNKNOWN';
    
    sql = sql.trim().toLowerCase();
    
    if (sql.startsWith('select')) return 'SELECT';
    if (sql.startsWith('insert')) return 'INSERT';
    if (sql.startsWith('update')) return 'UPDATE';
    if (sql.startsWith('delete')) return 'DELETE';
    if (sql.startsWith('create')) return 'CREATE';
    if (sql.startsWith('alter')) return 'ALTER';
    if (sql.startsWith('drop')) return 'DROP';
    if (sql.startsWith('with')) return 'WITH';
    if (sql.startsWith('begin')) return 'BEGIN';
    if (sql.startsWith('commit')) return 'COMMIT';
    if (sql.startsWith('rollback')) return 'ROLLBACK';
    
    return 'UNKNOWN';
}

// Helper function to get badge for query type
function getQueryTypeBadge(queryType) {
    if (!queryType) return { label: 'SQL', color: 'bg-secondary text-white' };
    
    const type = queryType.toUpperCase();
    
    switch (type) {
        case 'SELECT':
            return { label: 'SELECT', color: 'bg-primary text-white' };
        case 'INSERT':
            return { label: 'INSERT', color: 'bg-success text-white' };
        case 'UPDATE':
            return { label: 'UPDATE', color: 'bg-warning text-dark' }; // Yellow needs dark text
        case 'DELETE':
            return { label: 'DELETE', color: 'bg-danger text-white' };
        case 'CREATE':
            return { label: 'CREATE', color: 'bg-indigo text-white' };
        case 'ALTER':
            return { label: 'ALTER', color: 'bg-purple text-white' };
        case 'DROP':
            return { label: 'DROP', color: 'bg-pink text-white' };
        case 'WITH':
        case 'WITH-SELECT':
        case 'WITH-INSERT':
        case 'WITH-UPDATE':
        case 'WITH-DELETE':
            return { label: 'CTE', color: 'bg-info text-dark' }; // Cyan needs dark text
        case 'BEGIN':
        case 'COMMIT':
        case 'ROLLBACK':
            return { label: type, color: 'bg-teal text-white' };
        default:
            return { label: 'SQL', color: 'bg-secondary text-white' };
    }
}

// Format SQL query for better readability
function formatSqlQuery(sql) {
    // This function is kept for compatibility
    // The actual formatting is done server-side with sqlparse
    return sql || '';
}

// Add syntax highlighting to SQL in the modal
function applySqlSyntaxHighlighting(codeElement) {
    if (!codeElement || !codeElement.textContent) return;
    
    const sql = codeElement.textContent;
    
    // Simple regex-based syntax highlighting
    let highlighted = sql
        // Keywords
        .replace(/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|AND|OR|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|ON|AS|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|INTO|VALUES|SET|CREATE|ALTER|DROP|TABLE|INDEX|VIEW|TRIGGER|PROCEDURE|FUNCTION|DATABASE|SCHEMA|GRANT|REVOKE|COMMIT|ROLLBACK|BEGIN|TRANSACTION|WITH|CASE|WHEN|THEN|ELSE|END)\b/gi, 
            '<span style="color: #0550ae; font-weight: bold;">$1</span>')
        // Functions
        .replace(/\b(COUNT|SUM|AVG|MIN|MAX|COALESCE|NULLIF|CAST|CONVERT|SUBSTRING|CONCAT|TRIM|UPPER|LOWER|DATE|EXTRACT|TO_CHAR|TO_DATE|CURRENT_DATE|CURRENT_TIME|NOW|INTERVAL)\b/gi,
            '<span style="color: #9333ea;">$1</span>')
        // Numbers
        .replace(/\b(\d+(\.\d+)?)\b/g, 
            '<span style="color: #0891b2;">$1</span>')
        // Strings
        .replace(/'([^']*)'/g, 
            '<span style="color: #16a34a;">\'$1\'</span>')
        // Comments
        .replace(/--(.*)$/gm, 
            '<span style="color: #6b7280; font-style: italic;">--$1</span>');
    
    // Set the highlighted HTML
    codeElement.innerHTML = highlighted;
}

// Show SQL query details in a modal
function showSqlDetails(query) {
    // Get database type and engine name
    const dbType = detectDatabaseType(query.statement);
    const engineName = query.engine || dbType;
    
    // Create modal content with loading indicator
    const modal = document.createElement('div');
    modal.className = 'modal modal-blur fade show';
    modal.style.display = 'block';
    modal.setAttribute('role', 'dialog');
    
    // Create the modal HTML structure first
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">SQL Query Details (${engineName})</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <div class="d-flex justify-content-between mb-2">
                            <span><strong>Endpoint:</strong> ${query.endpoint}</span>
                            <span><strong>Duration:</strong> ${(query.duration * 1000).toFixed(2)} ms</span>
                        </div>
                        <div class="d-flex justify-content-between mb-3">
                            <span><strong>Time:</strong> ${new Date(query.timestamp * 1000).toLocaleString()}</span>
                            <span><strong>Database:</strong> ${dbType}</span>
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h3 class="card-title">SQL Query</h3>
                            <button class="btn btn-sm btn-outline-primary copy-btn">
                                Copy SQL
                            </button>
                        </div>
                        <div class="card-body p-0">
                            <pre id="sql-query-content" class="m-0 p-3 bg-light" style="max-height: 400px; overflow: auto; white-space: pre-wrap;"><code class="language-sql">Loading SQL...</code></pre>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>
    `;
    
    // Add to DOM first
    document.body.appendChild(modal);
    
    // Get the code element for SQL display
    const codeElement = modal.querySelector('pre code');
    
    // Use pre-formatted SQL if available, otherwise use the original statement
    if (query.metadata && query.metadata.formatted_sql) {
        codeElement.textContent = query.metadata.formatted_sql;
        applySqlSyntaxHighlighting(codeElement);
    } else {
        // Fallback to client-side formatting
        codeElement.textContent = formatSqlQuery(query.statement);
        applySqlSyntaxHighlighting(codeElement);
    }
    
    document.body.appendChild(modal);
    
    // Add event listener to close button
    modal.querySelectorAll('.btn-close, .btn[data-bs-dismiss="modal"]').forEach(btn => {
        btn.addEventListener('click', () => {
            modal.remove();
        });
    });
    
    // Close when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    // Add copy functionality
    const copyBtn = modal.querySelector('.copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            // Get the SQL text directly
            const sqlText = query.statement;
            
            // Use the modern clipboard API
            navigator.clipboard.writeText(sqlText)
                .then(() => {
                    copyBtn.textContent = 'Copied!';
                    copyBtn.classList.remove('btn-outline-primary');
                    copyBtn.classList.add('btn-success');
                    
                    setTimeout(() => {
                        copyBtn.textContent = 'Copy SQL';
                        copyBtn.classList.remove('btn-success');
                        copyBtn.classList.add('btn-outline-primary');
                    }, 2000);
                })
                .catch(err => {
                    // Fallback to the older method if clipboard API fails
                    try {
                        const textarea = document.createElement('textarea');
                        textarea.value = sqlText;
                        textarea.setAttribute('readonly', '');
                        textarea.style.position = 'absolute';
                        textarea.style.left = '-9999px';
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textarea);
                        
                        copyBtn.textContent = 'Copied!';
                        copyBtn.classList.remove('btn-outline-primary');
                        copyBtn.classList.add('btn-success');
                        
                        setTimeout(() => {
                            copyBtn.textContent = 'Copy SQL';
                            copyBtn.classList.remove('btn-success');
                            copyBtn.classList.add('btn-outline-primary');
                        }, 2000);
                    } catch (e) {
                        copyBtn.textContent = 'Failed to copy';
                        console.error('Could not copy text: ', e);
                        setTimeout(() => {
                            copyBtn.textContent = 'Copy SQL';
                        }, 2000);
                    }
                });
        });
    }
}

// Update database queries table
function updateDbQueriesTable() {
    const tableBody = document.getElementById('db-queries-table').querySelector('tbody');
    tableBody.innerHTML = '';
    
    // Get recent requests with database queries
    const recentRequests = dashboardData.requests.recent || [];
    const requestsWithQueries = recentRequests.filter(req => req.db_queries && req.db_queries.length > 0);
    
    if (requestsWithQueries.length === 0) {
        // Check if we have any database stats at all
        if (dashboardData.database && dashboardData.database.query_count > 0) {
            tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500">
                Database queries exist (${dashboardData.database.query_count} total) but detailed query data is not available in recent requests.
                Try making more requests to see query details.
            </td></tr>`;
        } else {
            tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500">
                No database queries recorded. Make sure your database is properly instrumented.
                <br><br>
                <strong>Example:</strong><br>
                <code>app.state.sqlalchemy_engine = engine</code><br>
                <code>Profiler(app, instrument_db=True)</code>
            </td></tr>`;
        }
        return;
    }
    
    // Flatten the queries from all requests
    let allQueries = [];
    requestsWithQueries.forEach(req => {
        if (req.db_queries) {
            req.db_queries.forEach(query => {
                // Get engine name from metadata if available
                let engineName = 'Unknown';
                if (query.metadata) {
                    engineName = query.metadata.name || query.metadata.dialect || 'Unknown';
                }
                
                allQueries.push({
                    endpoint: `${req.method} ${req.path}`,
                    statement: query.statement,
                    duration: query.duration,
                    timestamp: req.start_time,
                    metadata: query.metadata || {},
                    engine: engineName
                });
            });
        }
    });
    
    // Sort by timestamp (most recent first)
    allQueries.sort((a, b) => b.timestamp - a.timestamp);
    
    // Take only the most recent 20 queries
    allQueries = allQueries.slice(0, 20);
    
    // Render table rows
    allQueries.forEach(query => {
        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        row.classList.add('hover-highlight');
        
        // Truncate very long queries for display
        let displayStatement = query.statement;
        if (displayStatement.length > 100) {
            displayStatement = displayStatement.substring(0, 97) + '...';
        }
        
        // Detect database type
        const dbType = detectDatabaseType(query.statement);
        
        // Get engine name
        const engineName = query.engine || dbType;
        
        // Get query type
        const queryType = query.metadata?.query_type || detectQueryType(query.statement);
        const queryTypeBadge = getQueryTypeBadge(queryType);
        
        row.innerHTML = `
            <td class="text-gray-700">${query.endpoint}</td>
            <td class="font-mono text-xs" style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <div class="d-flex align-items-center">
                    <span class="badge ${queryTypeBadge.color} me-2" style="font-weight: 600; min-width: 70px; text-align: center; flex-shrink: 0;">${queryTypeBadge.label}</span>
                    <i class="ti ti-click me-1 text-primary" style="font-size: 14px; flex-shrink: 0;"></i>
                    <span class="text-dark" style="font-weight: 500; overflow: hidden; text-overflow: ellipsis;">${displayStatement}</span>
                </div>
            </td>
            <td class="text-indigo-600 font-medium">${(query.duration * 1000).toFixed(2)} ms</td>
            <td class="text-gray-500">${formatTimeAgo(query.timestamp)}</td>
            <td><span class="badge bg-azure text-white" style="font-weight: 500;">${engineName}</span></td>
        `;
        
        // Add click handler to show full query details
        row.addEventListener('click', () => {
            showSqlDetails(query);
        });
        
        tableBody.appendChild(row);
    });
}

// Database time chart
let dbTimeChart;
let lastDbChartData = { timeData: [], percentageData: [] };

function updateDbTimeChart() {
    if (!dashboardData.database || !dashboardData.requests.recent) {
        return;
    }
    
    // Get recent requests with database queries
    const recentRequests = dashboardData.requests.recent || [];
    const requestsWithQueries = recentRequests.filter(req => req.db_count > 0);
    
    if (requestsWithQueries.length === 0) {
        return;
    }
    
    // Sort by timestamp
    requestsWithQueries.sort((a, b) => a.start_time - b.start_time);
    
    // Prepare data for chart
    const dbTimeData = requestsWithQueries.map(req => ({
        x: new Date(req.start_time * 1000).getTime(),
        y: req.db_time * 1000, // Convert to ms
        endpoint: `${req.method} ${req.path}`,
        count: req.db_count
    }));
    
    // Calculate percentage of time spent in DB
    const dbPercentageData = requestsWithQueries.map(req => ({
        x: new Date(req.start_time * 1000).getTime(),
        y: (req.db_time / req.total_time) * 100, // Percentage
        endpoint: `${req.method} ${req.path}`,
        count: req.db_count
    }));
    
    // Check if data has changed to avoid unnecessary updates
    const dataChanged = JSON.stringify(dbTimeData) !== JSON.stringify(lastDbChartData.timeData) ||
                        JSON.stringify(dbPercentageData) !== JSON.stringify(lastDbChartData.percentageData);
    
    // Store current data for future comparison
    lastDbChartData.timeData = dbTimeData;
    lastDbChartData.percentageData = dbPercentageData;
    
    if (dbTimeChart) {
        // Only update if data changed and not interacting with chart
        if (dataChanged && (!isUserInteracting || !document.getElementById('db-time-chart').matches(':hover'))) {
            dbTimeChart.updateSeries([
                {
                    name: 'DB Time (ms)',
                    data: dbTimeData
                },
                {
                    name: 'DB Time (%)',
                    data: dbPercentageData
                }
            ], false, true); // Use quiet update to prevent animations
        }
    } else {
        // Create a new chart
        const options = {
            series: [
                {
                    name: 'DB Time (ms)',
                    data: dbTimeData,
                    type: 'column'
                },
                {
                    name: 'DB Time (%)',
                    data: dbPercentageData,
                    type: 'line'
                }
            ],
            chart: {
                height: 350,
                type: 'line',
                toolbar: {
                    show: true
                },
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: 800
                }
            },
            stroke: {
                width: [0, 4],
                curve: 'smooth'
            },
            plotOptions: {
                bar: {
                    columnWidth: '50%',
                    borderRadius: 4
                }
            },
            dataLabels: {
                enabled: false
            },
            markers: {
                size: 5,
                colors: ['transparent', '#16a34a'],
                strokeColors: '#fff',
                strokeWidth: 2,
                hover: {
                    size: 7
                }
            },
            colors: ['#3b82f6', '#16a34a'], // Blue for time, green for percentage
            xaxis: {
                type: 'datetime',
                labels: {
                    datetimeUTC: false,
                    format: 'HH:mm:ss'
                }
            },
            yaxis: [
                {
                    title: {
                        text: 'DB Time (ms)'
                    },
                    labels: {
                        formatter: function(val) {
                            return val.toFixed(2);
                        }
                    }
                },
                {
                    opposite: true,
                    title: {
                        text: 'DB Time (%)'
                    },
                    labels: {
                        formatter: function(val) {
                            return Math.round(val) + '%';
                        }
                    },
                    min: 0,
                    max: 100
                }
            ],
            tooltip: {
                shared: true,
                intersect: false,
                y: {
                    formatter: function(value, { seriesIndex, dataPointIndex, w }) {
                        if (seriesIndex === 0) {
                            return `${value.toFixed(2)} ms`;
                        } else {
                            return `${Math.round(value)}%`;
                        }
                    }
                }
            }
        };

        dbTimeChart = new ApexCharts(document.getElementById('db-time-chart'), options);
        dbTimeChart.render();
    }
}

// Update stat cards
function updateStats() {
    const stats = dashboardData.overview;
    document.getElementById('stat-total-requests').textContent = stats.total_requests;
    document.getElementById('stat-avg-response-time').textContent = formatTime(stats.avg_response_time) + ' ms';
    document.getElementById('stat-p90-response-time').textContent = formatTime(stats.p90_response_time) + ' ms';
    document.getElementById('stat-p95-response-time').textContent = formatTime(stats.p95_response_time) + ' ms';
    document.getElementById('stat-max-response-time').textContent = formatTime(stats.max_response_time) + ' ms';
    document.getElementById('stat-unique-endpoints').textContent = stats.unique_endpoints;
    
    // Update database stats if available
    if (dashboardData.database) {
        const dbStats = dashboardData.database;
        document.getElementById('stat-db-queries').textContent = dbStats.query_count;
        document.getElementById('stat-db-avg-time').textContent = formatTime(dbStats.avg_time) + ' ms';
        document.getElementById('stat-db-max-time').textContent = formatTime(dbStats.max_time) + ' ms';
        document.getElementById('stat-db-total-time').textContent = formatTime(dbStats.total_time) + ' ms';
    }
}

// Update slowest endpoints table
function updateSlowestEndpointsTable() {
    const slowestEndpoints = dashboardData.endpoints.slowest || [];
    const tableBody = document.getElementById('slowest-endpoints-table').querySelector('tbody');
    tableBody.innerHTML = '';

    slowestEndpoints.forEach(stat => {
        const row = document.createElement('tr');

        row.innerHTML = `
            <td class="text-gray-700">${stat.method}</td>
            <td class="font-medium text-gray-900">${stat.path}</td>
            <td class="text-indigo-600 font-medium">${formatTime(stat.avg * 1000)} ms</td>
            <td class="text-red-600">${formatTime(stat.max * 1000)} ms</td>
            <td class="text-gray-500">${stat.count}</td>
        `;

        tableBody.appendChild(row);
    });

    if (slowestEndpoints.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500">No data available</td></tr>`;
    }
}

// Global pagination state
let paginationState = {
    endpointsPage: 1,
    endpointsPerPage: 10,
    requestsPage: 1,
    requestsPerPage: 10
};

// Update endpoints table with pagination and grouping
function updateEndpointsTable() {
    let endpointStats = [...dashboardData.endpoints.stats];
    const searchTerm = document.getElementById('endpoint-search')?.value?.toLowerCase() || '';

    // Apply search filter
    if (searchTerm) {
        endpointStats = endpointStats.filter(stat => 
            stat.path.toLowerCase().includes(searchTerm) || 
            stat.method.toLowerCase().includes(searchTerm)
        );
    }

    // Group endpoints by path pattern
    const groupedEndpoints = groupEndpointsByPattern(endpointStats);
    let groupedStats = [];
    
    // Convert grouped data to flat array for display
    Object.entries(groupedEndpoints).forEach(([pattern, endpoints]) => {
        // If there's only one endpoint in the group, just add it directly
        if (endpoints.length === 1) {
            groupedStats.push(endpoints[0]);
            return;
        }
        
        // For multiple endpoints with the same pattern, create a summary row
        const totalCount = endpoints.reduce((sum, ep) => sum + ep.count, 0);
        const avgTime = endpoints.reduce((sum, ep) => sum + (ep.avg * ep.count), 0) / totalCount;
        const maxTime = Math.max(...endpoints.map(ep => ep.max));
        const minTime = Math.min(...endpoints.map(ep => ep.min));
        
        // Get unique methods for this pattern
        const uniqueMethods = [...new Set(endpoints.map(ep => ep.method))].join(', ');
        
        // Add a summary row with the pattern
        groupedStats.push({
            method: uniqueMethods,
            path: pattern,
            avg: avgTime,
            max: maxTime,
            min: minTime,
            count: totalCount,
            isGroup: true,
            endpoints: endpoints
        });
    });
    
    // Apply sorting
    if (currentSortColumn) {
        groupedStats.sort((a, b) => {
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
    
    // Calculate pagination
    const totalPages = Math.ceil(groupedStats.length / paginationState.endpointsPerPage);
    
    // Ensure current page is valid
    if (paginationState.endpointsPage > totalPages) {
        paginationState.endpointsPage = Math.max(1, totalPages);
    }
    
    // Get current page data
    const startIndex = (paginationState.endpointsPage - 1) * paginationState.endpointsPerPage;
    const endIndex = startIndex + paginationState.endpointsPerPage;
    const currentPageData = groupedStats.slice(startIndex, endIndex);

    // Render table rows
    currentPageData.forEach(stat => {
        const row = document.createElement('tr');
        
        // Add a class for group rows
        if (stat.isGroup) {
            row.classList.add('group-row');
        }

        row.innerHTML = `
            <td class="text-gray-700">${stat.method}</td>
            <td class="font-medium text-gray-900">${stat.path}</td>
            <td class="text-indigo-600 font-medium">${formatTime(stat.avg * 1000)} ms</td>
            <td class="text-red-600">${formatTime(stat.max * 1000)} ms</td>
            <td class="text-green-600">${formatTime(stat.min * 1000)} ms</td>
            <td class="text-gray-500">${stat.count}</td>
        `;

        tableBody.appendChild(row);
        
        // If this is a group row and it has endpoints, add a hidden expandable section
        if (stat.isGroup && stat.endpoints && stat.endpoints.length > 1) {
            const detailRow = document.createElement('tr');
            detailRow.classList.add('endpoint-details');
            detailRow.style.display = 'none';
            
            const detailCell = document.createElement('td');
            detailCell.colSpan = 6;
            detailCell.classList.add('p-0');
            
            let detailContent = `
                <div class="p-3 bg-gray-50">
                    <div class="text-sm font-medium mb-2">Endpoints in this group:</div>
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Path</th>
                                <th>Avg Time</th>
                                <th>Count</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            stat.endpoints.forEach(endpoint => {
                detailContent += `
                    <tr>
                        <td>${endpoint.method}</td>
                        <td>${endpoint.path}</td>
                        <td>${formatTime(endpoint.avg * 1000)} ms</td>
                        <td>${endpoint.count}</td>
                    </tr>
                `;
            });
            
            detailContent += `
                        </tbody>
                    </table>
                </div>
            `;
            
            detailCell.innerHTML = detailContent;
            detailRow.appendChild(detailCell);
            tableBody.appendChild(detailRow);
            
            // Add click handler to toggle details
            row.style.cursor = 'pointer';
            row.addEventListener('click', () => {
                const isVisible = detailRow.style.display !== 'none';
                detailRow.style.display = isVisible ? 'none' : 'table-row';
            });
        }
    });

    if (groupedStats.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-gray-500">No data available</td></tr>`;
    }
    
    // Update pagination controls
    updatePaginationControls('endpoints-pagination', totalPages, paginationState.endpointsPage, (page) => {
        paginationState.endpointsPage = page;
        updateEndpointsTable();
    });
}

// Helper function to group endpoints by pattern
function groupEndpointsByPattern(endpoints) {
    const groups = {};
    
    endpoints.forEach(endpoint => {
        // Use the original path as the pattern by default
        // This ensures endpoints like /fast, /slow, /users are not grouped together
        let pattern = endpoint.path;
        
        // Only apply pattern matching for paths that look like they contain parameters
        if (pattern.includes('/') && 
            (
                // Has numeric segments that look like IDs
                /\/\d+/.test(pattern) || 
                // Has UUID-like segments
                /\/[0-9a-f]{8}-[0-9a-f]{4}/.test(pattern) ||
                // Has segments that look like slugs with IDs
                /\/[^/]+-[a-z0-9]{8,}/.test(pattern) ||
                // Has query parameters
                pattern.includes('?')
            )
        ) {
            // Replace numeric IDs with {id}
            pattern = pattern.replace(/\/\d+(?=\/|$)/g, '/{id}');
            
            // Replace UUIDs with {uuid}
            pattern = pattern.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, '/{uuid}');
            
            // Match CMS-style slugs (e.g., /blog-post-title-123abc/)
            pattern = pattern.replace(/\/[^/]+-[a-z0-9]{8,}(?=\/|$)/gi, '/{slug}');
            
            // Match query parameters in paths
            pattern = pattern.replace(/\?.*$/, '?{query}');
        }
        
        // Initialize group if it doesn't exist
        if (!groups[pattern]) {
            groups[pattern] = [];
        }
        
        // Add endpoint to group
        groups[pattern].push(endpoint);
    });
    
    return groups;
}

// Helper function to update pagination controls
function updatePaginationControls(containerId, totalPages, currentPage, onPageChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    
    if (totalPages <= 1) return;
    
    // Previous button
    const prevBtn = document.createElement('a');
    prevBtn.href = '#';
    prevBtn.className = 'page-link' + (currentPage === 1 ? ' disabled' : '');
    prevBtn.innerHTML = '<i class="ti ti-chevron-left"></i>';
    prevBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage > 1) onPageChange(currentPage - 1);
    });
    
    // Next button
    const nextBtn = document.createElement('a');
    nextBtn.href = '#';
    nextBtn.className = 'page-link' + (currentPage === totalPages ? ' disabled' : '');
    nextBtn.innerHTML = '<i class="ti ti-chevron-right"></i>';
    nextBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage < totalPages) onPageChange(currentPage + 1);
    });
    
    // Page info
    const pageInfo = document.createElement('span');
    pageInfo.className = 'mx-2';
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    
    // Append elements
    container.appendChild(prevBtn);
    container.appendChild(pageInfo);
    container.appendChild(nextBtn);
}

// Update requests table with pagination
function updateRequestsTable() {
    let recentRequests = [...dashboardData.requests.recent];
    const searchTerm = document.getElementById('request-search')?.value?.toLowerCase() || '';

    // Apply search filter
    if (searchTerm) {
        recentRequests = recentRequests.filter(profile => 
            profile.path.toLowerCase().includes(searchTerm) || 
            profile.method.toLowerCase().includes(searchTerm)
        );
    }

    // Apply sorting
    if (currentSortColumn) {
        recentRequests.sort((a, b) => {
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
    
    // Calculate pagination
    const totalPages = Math.ceil(recentRequests.length / paginationState.requestsPerPage);
    
    // Ensure current page is valid
    if (paginationState.requestsPage > totalPages) {
        paginationState.requestsPage = Math.max(1, totalPages);
    }
    
    // Get current page data
    const startIndex = (paginationState.requestsPage - 1) * paginationState.requestsPerPage;
    const endIndex = startIndex + paginationState.requestsPerPage;
    const currentPageData = recentRequests.slice(startIndex, endIndex);

    // Render table rows
    currentPageData.forEach(profile => {
        const row = document.createElement('tr');

        // Define row color based on response time
        let timeClass = 'text-indigo-600';
        if (profile.total_time > 0.5) timeClass = 'text-red-600';
        else if (profile.total_time > 0.1) timeClass = 'text-yellow-600';
        
        // Add status code to the display
        const statusCode = profile.status_code || '-';
        let statusClass = 'text-gray-500';
        
        if (statusCode >= 200 && statusCode < 300) statusClass = 'text-green-600';
        else if (statusCode >= 300 && statusCode < 400) statusClass = 'text-blue-600';
        else if (statusCode >= 400 && statusCode < 500) statusClass = 'text-yellow-600';
        else if (statusCode >= 500) statusClass = 'text-red-600';

        row.innerHTML = `
            <td class="text-gray-500">${formatTimeAgo(profile.start_time)}</td>
            <td class="text-gray-700">${profile.method}</td>
            <td class="font-medium text-gray-900">${profile.path}</td>
            <td class="${statusClass} font-medium">${statusCode}</td>
            <td class="${timeClass} font-medium">${formatTime(profile.total_time * 1000)} ms</td>
        `;

        tableBody.appendChild(row);
    });

    if (recentRequests.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500">No data available</td></tr>`;
    }
    
    // Update pagination controls
    updatePaginationControls('requests-pagination', totalPages, paginationState.requestsPage, (page) => {
        paginationState.requestsPage = page;
        updateRequestsTable();
    });
}

// Update all charts
function updateCharts() {
    updateResponseTimeChart();
    updateRequestsByMethodChart();
    updateStatusCodeChart();
    updateEndpointDistributionChart();
}

// Update status code distribution chart with ApexCharts
function updateStatusCodeChart() {
    // Get status code distribution data
    const statusCodes = dashboardData.requests.status_codes || [];
    
    // Group status codes by category
    const categories = {
        '2xx': { label: 'Success (2xx)', count: 0, codes: {} },
        '3xx': { label: 'Redirection (3xx)', count: 0, codes: {} },
        '4xx': { label: 'Client Error (4xx)', count: 0, codes: {} },
        '5xx': { label: 'Server Error (5xx)', count: 0, codes: {} },
        'other': { label: 'Other', count: 0, codes: {} }
    };
    
    statusCodes.forEach(item => {
        const code = parseInt(item.status);
        const category = 
            code >= 200 && code < 300 ? '2xx' :
            code >= 300 && code < 400 ? '3xx' :
            code >= 400 && code < 500 ? '4xx' :
            code >= 500 && code < 600 ? '5xx' : 'other';
        
        categories[category].count += item.count;
        categories[category].codes[code] = item.count;
    });
    
    // Prepare data for chart
    const categoryData = Object.entries(categories)
        .filter(([_, data]) => data.count > 0)
        .map(([key, data]) => ({
            x: data.label,
            y: data.count,
            category: key,
            codes: data.codes
        }));
    
    // Color mapping
    const colorMap = {
        '2xx': '#16a34a',  // Green
        '3xx': '#3b82f6',  // Blue
        '4xx': '#fbbf24',  // Yellow
        '5xx': '#ef4444',  // Red
        'other': '#6b7280' // Gray
    };
    
    const colors = categoryData.map(item => colorMap[item.category]);
    
    if (statusCodeChart) {
        // Update existing chart
        statusCodeChart.updateSeries([{
            name: 'Status Codes',
            data: categoryData
        }]);
        statusCodeChart.updateOptions({
            colors: colors
        });
    } else {
        // Create a new chart
        const options = {
            series: [{
                name: 'Status Codes',
                data: categoryData.map(item => item.y)
            }],
            chart: {
                type: 'bar',
                height: 250,
                toolbar: {
                    show: false
                },
                events: {
                    dataPointSelection: function(event, chartContext, config) {
                        const dataPoint = categoryData[config.dataPointIndex];
                        showStatusCodeDetails(dataPoint.category, dataPoint.codes);
                    }
                }
            },
            plotOptions: {
                bar: {
                    distributed: true, // This enables different colors for each bar
                    borderRadius: 4,
                    dataLabels: {
                        position: 'top'
                    },
                    columnWidth: '60%'
                }
            },
            colors: colors,
            dataLabels: {
                enabled: true,
                formatter: function(val) {
                    return val;
                },
                offsetY: -20,
                style: {
                    fontSize: '12px',
                    colors: ["#304758"]
                }
            },
            xaxis: {
                categories: categoryData.map(item => item.x),
                title: {
                    text: 'Status Code Category'
                }
            },
            yaxis: {
                title: {
                    text: 'Count'
                },
                labels: {
                    formatter: function(val) {
                        return val.toFixed(2);
                    }
                }
            },
            tooltip: {
                y: {
                    formatter: function(value, { dataPointIndex }) {
                        const category = categoryData[dataPointIndex];
                        const codeCount = Object.keys(category.codes).length;
                        return `${value} requests across ${codeCount} status code${codeCount !== 1 ? 's' : ''}`;
                    }
                }
            }
        };

        statusCodeChart = new ApexCharts(document.getElementById('status-code-chart'), options);
        statusCodeChart.render();
    }
}

// Function to show status code details
function showStatusCodeDetails(category, codes) {
    // Create modal content
    let content = `<h3 class="text-lg font-medium mb-3">${category} Status Codes</h3>
                   <div class="space-y-2">`;
    
    Object.entries(codes).forEach(([code, count]) => {
        let statusText = getStatusText(parseInt(code));
        content += `<div class="flex justify-between">
                        <span class="font-medium">${code} (${statusText})</span>
                        <span>${count} requests</span>
                    </div>`;
    });
    
    content += '</div>';
    
    // Show modal using Tabler's modal component
    const modal = document.createElement('div');
    modal.className = 'modal modal-blur fade show';
    modal.style.display = 'block';
    modal.setAttribute('role', 'dialog');
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Status Code Details</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listener to close button
    modal.querySelector('.btn-close, .btn[data-bs-dismiss="modal"]').addEventListener('click', () => {
        modal.remove();
    });
    
    // Close when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// Helper function to get status text
function getStatusText(code) {
    if (code >= 200 && code < 300) return 'Success';
    if (code >= 300 && code < 400) return 'Redirection';
    if (code >= 400 && code < 500) return 'Client Error';
    if (code >= 500) return 'Server Error';
    return 'Unknown';
}

// Store chart state and data
let chartState = {
    lastProfileCount: 0,
    currentChartData: [],
    lastUpdateTime: Date.now()
};

// Update response time chart with ApexCharts
function updateResponseTimeChart() {
    // Get time series data
    const responseTimesData = dashboardData.time_series?.response_times || [];
    
    // Check if we have new data
    const hasNewData = responseTimesData.length !== chartState.lastProfileCount;
    chartState.lastProfileCount = responseTimesData.length;
    
    // Filter data based on selected time range
    const timeRangeSelect = document.getElementById('time-range');
    const selectedMinutes = parseInt(timeRangeSelect.value);
    
    let filteredData = responseTimesData;
    if (selectedMinutes > 0) {
        const cutoffTime = Date.now() - (selectedMinutes * 60 * 1000);
        filteredData = responseTimesData.filter(p => 
            new Date(p.timestamp * 1000).getTime() >= cutoffTime
        );
    }
    
    // Prepare data points for ApexCharts
    const dataPoints = filteredData.map(p => ({
        x: new Date(p.timestamp * 1000).getTime(),
        y: p.value,
        key: p.key
    }));

    // Store the data for tooltip access
    chartState.currentChartData = responseTimesData;

    if (responseTimeChart) {
        // Only update if not currently interacting with this chart
        if (!isUserInteracting || !document.getElementById('response-time-chart').matches(':hover')) {
            responseTimeChart.updateSeries([{
                name: 'Response Time (ms)',
                data: dataPoints
            }], false, true); // Use quiet update to prevent animations during updates
        }
    } else {
        // Create a new chart
        const options = {
            series: [{
                name: 'Response Time (ms)',
                data: dataPoints
            }],
            chart: {
                type: 'area',
                height: 250,
                toolbar: {
                    show: true,
                    tools: {
                        download: true,
                        selection: true,
                        zoom: true,
                        zoomin: true,
                        zoomout: true,
                        pan: true,
                        reset: true
                    },
                    autoSelected: 'zoom'
                },
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: 300
                },
                zoom: {
                    enabled: true,
                    type: 'x',
                    autoScaleYaxis: true
                },
                events: {
                    mouseMove: function() {
                        isUserInteracting = true;
                    },
                    mouseLeave: function() {
                        isUserInteracting = false;
                        if (pendingDataUpdate) {
                            pendingDataUpdate = false;
                            updateDashboard();
                        }
                    }
                }
            },
            dataLabels: {
                enabled: false
            },
            stroke: {
                curve: 'smooth',
                width: 2.5,
                colors: ['#16a34a'] // Green color
            },
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.15,
                    opacityTo: 0.01,
                    stops: [0, 100]
                },
                colors: ['#16a34a']
            },
            markers: {
                size: 0, // Hide markers by default for cleaner look
                hover: {
                    size: 5,
                    sizeOffset: 3
                }
            },
            xaxis: {
                type: 'datetime',
                labels: {
                    datetimeUTC: false,
                    format: 'HH:mm:ss'
                }
            },
            yaxis: {
                title: {
                    text: 'Response Time (ms)'
                },
                min: 0,
                labels: {
                    formatter: function(val) {
                        return val.toFixed(0); // Remove decimals from y-axis labels
                    }
                }
            },
            tooltip: {
                shared: true,
                intersect: false,
                x: {
                    format: 'HH:mm:ss'
                },
                y: {
                    formatter: function(value) {
                        return Math.round(value) + ' ms'; // Round to whole numbers
                    }
                },
                custom: function({ series, seriesIndex, dataPointIndex, w }) {
                    const data = w.config.series[seriesIndex].data[dataPointIndex];
                    const key = data.key || 'Unknown';
                    const value = Math.round(data.y); // Round to whole number
                    const time = new Date(data.x).toLocaleTimeString();
                    
                    return `<div class="apexcharts-tooltip-title">${key}</div>
                            <div class="apexcharts-tooltip-series-group">
                                <span class="apexcharts-tooltip-marker" style="background-color: #16a34a"></span>
                                <div class="apexcharts-tooltip-text">
                                    <div><strong>${value} ms</strong></div>
                                    <div class="apexcharts-tooltip-y-group">
                                        <span class="apexcharts-tooltip-text-y-label">Time: </span>
                                        <span class="apexcharts-tooltip-text-y-value">${time}</span>
                                    </div>
                                </div>
                            </div>`;
                }
            }
        };

        responseTimeChart = new ApexCharts(document.getElementById('response-time-chart'), options);
        responseTimeChart.render();
    }
}

// Update requests by method chart with ApexCharts
function updateRequestsByMethodChart() {
    // Get method distribution data
    const methodDistribution = dashboardData.endpoints.by_method || [];
    
    // Prepare data for chart
    const methods = methodDistribution.map(item => item.method);
    const counts = methodDistribution.map(item => item.count);
    
    // Standard colors for HTTP methods
    const colorMap = {
        'GET': '#16a34a',    // Green
        'POST': '#4f46e5',   // Indigo
        'PUT': '#fbbf24',    // Yellow
        'DELETE': '#ef4444', // Red
        'PATCH': '#a78bfa',  // Purple
        'OPTIONS': '#7c3aed', // Violet
        'HEAD': '#10b981'    // Emerald
    };
    
    const colors = methods.map(method => colorMap[method] || '#6b7280');
    
    if (requestsByMethodChart) {
        // Update existing chart
        requestsByMethodChart.updateSeries(counts);
        requestsByMethodChart.updateOptions({
            labels: methods,
            colors: colors
        });
    } else {
        // Create a new chart
        const options = {
            series: counts,
            chart: {
                type: 'donut',
                height: 250,
                animations: {
                    animateGradually: {
                        enabled: true,
                        delay: 150
                    },
                    dynamicAnimation: {
                        enabled: true,
                        speed: 350
                    }
                }
            },
            labels: methods,
            colors: colors,
            legend: {
                position: 'right',
                formatter: function(seriesName, opts) {
                    const count = opts.w.globals.series[opts.seriesIndex];
                    const total = opts.w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                    const percentage = Math.round((count / total) * 100);
                    return `${seriesName}: ${count} (${percentage}%)`;
                },
                offsetY: 0,
                height: 200,
                fontSize: '13px'
            },
            dataLabels: {
                enabled: false
            },
            plotOptions: {
                pie: {
                    donut: {
                        size: '60%',
                        labels: {
                            show: true,
                            name: {
                                show: true,
                                fontSize: '16px',
                                fontWeight: 600
                            },
                            value: {
                                show: true,
                                fontSize: '20px',
                                fontWeight: 400,
                                formatter: function(val) {
                                    return val;
                                }
                            },
                            total: {
                                show: true,
                                label: 'Total',
                                formatter: function(w) {
                                    return w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                                }
                            }
                        }
                    }
                }
            },
            tooltip: {
                enabled: true,
                fillSeriesColor: false,
                theme: 'light',
                style: {
                    fontSize: '14px'
                },
                y: {
                    formatter: function(value, { seriesIndex, w }) {
                        const method = w.globals.labels[seriesIndex];
                        const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                        const percentage = Math.round((value / total) * 100);
                        return `${method}: ${value} requests (${percentage}%)`;
                    }
                }
            }
        };

        requestsByMethodChart = new ApexCharts(document.getElementById('requests-by-method-chart'), options);
        requestsByMethodChart.render();
    }
}

// Update endpoint distribution chart with ApexCharts
function updateEndpointDistributionChart() {
    // Get endpoint distribution data
    const endpointDistribution = dashboardData.endpoints.distribution || [];

    // Prepare data for chart
    const labels = endpointDistribution.map(stat => `${stat.method} ${stat.path}`);
    const requestCounts = endpointDistribution.map(stat => stat.count);
    const avgTimes = endpointDistribution.map(stat => stat.avg * 1000).map(val => Math.round(val)); // Round to whole numbers

    if (endpointDistributionChart) {
        // Update existing chart
        endpointDistributionChart.updateSeries([
            {
                name: 'Request Count',
                data: requestCounts
            },
            {
                name: 'Avg Time (ms)',
                data: avgTimes
            }
        ]);
        endpointDistributionChart.updateOptions({
            xaxis: {
                categories: labels
            }
        });
    } else {
        // Create a new chart
        const options = {
            series: [
                {
                    name: 'Request Count',
                    data: requestCounts,
                    type: 'column'
                },
                {
                    name: 'Avg Time (ms)',
                    data: avgTimes,
                    type: 'line'
                }
            ],
            chart: {
                height: 350,
                type: 'line',
                toolbar: {
                    show: true,
                    tools: {
                        download: true,
                        selection: false,
                        zoom: true,
                        zoomin: true,
                        zoomout: true,
                        pan: true,
                        reset: true
                    }
                },
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: 800,
                    animateGradually: {
                        enabled: true,
                        delay: 150
                    },
                    dynamicAnimation: {
                        enabled: true,
                        speed: 350
                    }
                }
            },
            stroke: {
                width: [0, 4],
                curve: 'smooth'
            },
            plotOptions: {
                bar: {
                    columnWidth: '50%',
                    borderRadius: 4
                }
            },
            dataLabels: {
                enabled: false,
                enabledOnSeries: [1]
            },
            markers: {
                size: 5,
                colors: ['transparent', '#16a34a'],
                strokeColors: '#fff',
                strokeWidth: 2,
                hover: {
                    size: 7
                }
            },
            colors: ['#4f46e5', '#16a34a'], // Indigo for count, green for time
            xaxis: {
                categories: labels,
                labels: {
                    rotate: -45,
                    trim: true,
                    style: {
                        fontSize: '12px'
                    }
                },
                tooltip: {
                    enabled: false
                }
            },
            yaxis: [
                {
                    title: {
                        text: 'Request Count'
                    },
                    labels: {
                        formatter: function(val) {
                            return val.toFixed(2);
                        }
                    }
                },
                {
                    opposite: true,
                    title: {
                        text: 'Avg Time (ms)'
                    },
                    labels: {
                        formatter: function(val) {
                            return val.toFixed(2);
                        }
                    }
                }
            ],
            legend: {
                position: 'top',
                horizontalAlign: 'center'
            },
            tooltip: {
                shared: true,
                intersect: false,
                y: {
                    formatter: function(value, { seriesIndex, dataPointIndex, w }) {
                        if (seriesIndex === 0) {
                            return `${value} requests`;
                        } else {
                            return `${value} ms`;
                        }
                    }
                }
            }
        };

        endpointDistributionChart = new ApexCharts(document.getElementById('endpoint-distribution-chart'), options);
        endpointDistributionChart.render();
    }
}

// This function is replaced by setupTablerTabs()

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

    // Global update interval configuration
    window.updateConfig = {
        enabled: true,
        interval: 1000 // Default interval in ms
    };

    // Handle refresh rate change
    refreshRateSelect.addEventListener('change', () => {
        const rate = parseInt(refreshRateSelect.value);

        // Update configuration
        if (rate > 0) {
            window.updateConfig.enabled = true;
            window.updateConfig.interval = rate;
            console.log(`Auto-refresh set to ${rate}ms`);
        } else {
            window.updateConfig.enabled = false;
            console.log('Auto-refresh disabled');
        }
    });

    // Handle manual refresh
    refreshBtn.addEventListener('click', () => {
        // Force update regardless of interaction state
        const wasInteracting = isUserInteracting;
        isUserInteracting = false;
        pendingDataUpdate = false;
        
        // Fetch data and update UI
        fetchData().then(() => {
            // Restore interaction state
            isUserInteracting = wasInteracting;
        });
    });
}

// No need for Chart.js configuration anymore

// Initialize dashboard
function initDashboard(dashboardApiPath) {
    // Set API path for data fetching
    apiPath = dashboardApiPath.replace(/\/+$/, '');  // Remove trailing slashes
    
    // Set up UI interactions
    setupTablerTabs();  // Use Tabler's tab system
    setupTableSorting();
    setupSearch();
    setupRefreshControl();
    setupInteractionTracking();
    setupTimeRangeSelector();

    // Initial data fetch
    fetchData();

    // Start optimized update loop using requestAnimationFrame
    startUpdateLoop();
}

// Set up time range selector
function setupTimeRangeSelector() {
    const timeRangeSelect = document.getElementById('time-range');
    if (timeRangeSelect) {
        timeRangeSelect.addEventListener('change', () => {
            updateResponseTimeChart();
        });
    }
}

// Optimized real-time updates using requestAnimationFrame
function startUpdateLoop() {
    let lastUpdate = 0;
    
    const update = (timestamp) => {
        // Only update if enabled and enough time has passed
        if (window.updateConfig.enabled && 
            document.visibilityState === 'visible' && 
            (!lastUpdate || timestamp - lastUpdate >= window.updateConfig.interval)) {
            
            // Don't update if user is interacting and we're not forcing an update
            if (!isUserInteracting) {
                fetchData();
                lastUpdate = timestamp;
            } else {
                pendingDataUpdate = true;
            }
        }
        requestAnimationFrame(update);
    };
    
    // Add visibility change listener to pause updates when tab is not visible
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && pendingDataUpdate) {
            fetchData();
            pendingDataUpdate = false;
        }
    });
    
    requestAnimationFrame(update);
}

// Track user interactions to prevent UI updates during hover/interaction
function setupInteractionTracking() {
    // Track mouse interactions on charts and tables
    const interactiveElements = [
        document.getElementById('response-time-chart'),
        document.getElementById('requests-by-method-chart'),
        document.getElementById('status-code-chart'),
        document.getElementById('endpoint-distribution-chart'),
        document.getElementById('slowest-endpoints-table'),
        document.getElementById('endpoints-table'),
        document.getElementById('requests-table')
    ];
    
    interactiveElements.forEach(element => {
        if (!element) return;
        
        element.addEventListener('mouseenter', () => {
            isUserInteracting = true;
        });
        
        element.addEventListener('mouseleave', () => {
            isUserInteracting = false;
            // Apply any pending updates when user stops interacting
            if (pendingDataUpdate) {
                pendingDataUpdate = false;
                updateDashboard();
            }
        });
    });
    
    // Also track focus on search inputs
    const searchInputs = [
        document.getElementById('endpoint-search'),
        document.getElementById('request-search')
    ];
    
    searchInputs.forEach(input => {
        if (!input) return;
        
        input.addEventListener('focus', () => {
            isUserInteracting = true;
        });
        
        input.addEventListener('blur', () => {
            isUserInteracting = false;
            if (pendingDataUpdate) {
                pendingDataUpdate = false;
                updateDashboard();
            }
        });
    });
}

// Export the init function for use in the HTML
window.initDashboard = initDashboard;

// Make sure initDashboard is globally available
if (typeof window !== 'undefined') {
    window.initDashboard = initDashboard;
}
