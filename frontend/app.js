// ParkSight - Main Application Logic

// Global state
let map;
let parkingData = null;
let parkingLayer = null;
let heatmapLayer = null;
let filteredData = null;
let currentView = 'map'; // 'map', 'heatmap', or 'analytics'
let charts = {}; // Store chart instances

// Filter state
let sizeFilters = {
    small: true,
    medium: true,
    large: true
};
let minConfidence = 0;
let searchQuery = '';

// Color mapping
const SIZE_COLORS = {
    small: '#4ECDC4',
    medium: '#FFB84D',
    large: '#E74C3C'
};

// Initialize map
function initMap() {
    // Create map centered on Atlanta
    map = L.map('map', {
        center: [33.7490, -84.3880],
        zoom: 11,
        zoomControl: false
    });

    // Add zoom control to bottom right
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    // Add CARTO Dark Matter basemap
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    console.log('Map initialized');
}

// Load GeoJSON data
async function loadParkingData() {
    try {
        // Try to load from outputs directory
        const response = await fetch('../outputs/parking_lots.geojson');

        if (!response.ok) {
            throw new Error('GeoJSON file not found');
        }

        parkingData = await response.json();
        console.log('Loaded parking data:', parkingData.features.length, 'lots');

        // Initialize filtered data
        filteredData = parkingData.features;

        // Render parking lots
        renderParkingLots();

        // Update stats
        updateStats();

    } catch (error) {
        console.error('Error loading parking data:', error);
        showErrorMessage('No parking data found. Please run the pipeline first.');
    }
}

// Render parking lots on map
function renderParkingLots() {
    // Remove existing layer
    if (parkingLayer) {
        map.removeLayer(parkingLayer);
    }

    // Create GeoJSON layer
    parkingLayer = L.geoJSON(filteredData, {
        style: (feature) => {
            const category = feature.properties.size_category;
            return {
                fillColor: SIZE_COLORS[category] || '#999',
                weight: 1,
                opacity: 0.8,
                color: SIZE_COLORS[category] || '#999',
                fillOpacity: 0.4
            };
        },
        onEachFeature: (feature, layer) => {
            // Add popup
            const props = feature.properties;
            const popupContent = `
                <div class="popup-title">Parking Lot #${props.lot_id || 'Unknown'}</div>
                <div class="popup-info">
                    <strong>Size:</strong> ${props.size_category || 'Unknown'}<br>
                    <strong>Estimated Spots:</strong> ${props.num_spots || 'N/A'}<br>
                    <strong>Area:</strong> ${Math.round(props.area_m2 || 0).toLocaleString()} m²<br>
                    <strong>Confidence:</strong> ${Math.round((props.confidence || 0) * 100)}%
                </div>
            `;
            layer.bindPopup(popupContent);

            // Add hover effect
            layer.on('mouseover', function() {
                this.setStyle({
                    weight: 2,
                    fillOpacity: 0.6
                });
            });

            layer.on('mouseout', function() {
                this.setStyle({
                    weight: 1,
                    fillOpacity: 0.4
                });
            });
        }
    }).addTo(map);

    // Fit map to bounds if data exists
    if (filteredData.length > 0) {
        try {
            map.fitBounds(parkingLayer.getBounds(), { padding: [50, 50] });
        } catch (e) {
            console.warn('Could not fit bounds:', e);
        }
    }
}

// Update statistics display
function updateStats() {
    if (!filteredData || filteredData.length === 0) {
        document.getElementById('lots-count').textContent = '0';
        document.getElementById('spots-count').textContent = '0';
        document.getElementById('coverage-area').textContent = '0 mi²';
        document.getElementById('avg-lot-size').textContent = '0 m²';
        document.getElementById('avg-confidence').textContent = '0%';
        document.getElementById('confidence-bar').style.width = '0%';
        return;
    }

    // Calculate stats
    const totalLots = filteredData.length;
    const totalSpots = filteredData.reduce((sum, f) => sum + (f.properties.num_spots || 0), 0);
    const totalAreaM2 = filteredData.reduce((sum, f) => sum + (f.properties.area_m2 || 0), 0);
    const totalAreaMi2 = totalAreaM2 / 2.59e6; // m² to mi²
    const avgLotSizeM2 = totalAreaM2 / totalLots;
    const avgConfidence = filteredData.reduce((sum, f) => sum + (f.properties.confidence || 0), 0) / totalLots;

    // Update DOM
    document.getElementById('lots-count').textContent = totalLots.toLocaleString();
    document.getElementById('spots-count').textContent = totalSpots.toLocaleString();
    document.getElementById('coverage-area').textContent = totalAreaMi2.toFixed(3) + ' mi²';
    document.getElementById('avg-lot-size').textContent = Math.round(avgLotSizeM2).toLocaleString() + ' m²';
    document.getElementById('avg-confidence').textContent = Math.round(avgConfidence * 100) + '%';
    document.getElementById('confidence-bar').style.width = (avgConfidence * 100) + '%';
}

// Apply filters
function applyFilters() {
    if (!parkingData) return;

    filteredData = parkingData.features.filter(feature => {
        const props = feature.properties;

        // Size filter
        const sizeCategory = props.size_category || 'small';
        if (!sizeFilters[sizeCategory]) {
            return false;
        }

        // Confidence filter
        const confidence = props.confidence || 0;
        if (confidence * 100 < minConfidence) {
            return false;
        }

        // Search filter (by lot ID or location)
        if (searchQuery) {
            const lotId = (props.lot_id || '').toString().toLowerCase();
            const size = (props.size_category || '').toLowerCase();
            const query = searchQuery.toLowerCase();

            if (!lotId.includes(query) && !size.includes(query)) {
                return false;
            }
        }

        return true;
    });

    console.log('Filtered:', filteredData.length, 'of', parkingData.features.length, 'lots');

    // Re-render based on current view
    if (currentView === 'map') {
        renderParkingLots();
    } else if (currentView === 'heatmap') {
        renderHeatmap();
    } else if (currentView === 'analytics') {
        createAnalyticsCharts();
    }

    updateStats();
}

// Render heatmap
function renderHeatmap() {
    // Remove existing heatmap layer
    if (heatmapLayer) {
        map.removeLayer(heatmapLayer);
    }

    // Remove polygon layer
    if (parkingLayer) {
        map.removeLayer(parkingLayer);
    }

    // Create heatmap data points
    const heatData = filteredData.map(feature => {
        const center = feature.properties;
        const lat = center.center_lat;
        const lon = center.center_lon;
        const intensity = (center.num_spots || 50) / 100; // Normalize intensity
        return [lat, lon, Math.min(intensity, 1)];
    });

    // Create heatmap layer
    heatmapLayer = L.heatLayer(heatData, {
        radius: 35,
        blur: 40,
        maxZoom: 15,
        max: 1.0,
        gradient: {
            0.0: '#4ECDC4',
            0.5: '#FFB84D',
            1.0: '#E74C3C'
        }
    }).addTo(map);

    console.log('Heatmap rendered with', heatData.length, 'points');
}

// Switch between views
function switchView(view) {
    currentView = view;

    // Update button states
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    // Show/hide appropriate content
    const mapEl = document.getElementById('map');
    const analyticsEl = document.getElementById('analytics-dashboard');

    if (view === 'map') {
        mapEl.style.display = 'block';
        analyticsEl.style.display = 'none';
        renderParkingLots();
    } else if (view === 'heatmap') {
        mapEl.style.display = 'block';
        analyticsEl.style.display = 'none';
        renderHeatmap();
    } else if (view === 'analytics') {
        mapEl.style.display = 'none';
        analyticsEl.style.display = 'block';
        createAnalyticsCharts();
    }
}

// Create analytics charts
function createAnalyticsCharts() {
    if (!filteredData || filteredData.length === 0) return;

    // Destroy existing charts
    Object.values(charts).forEach(chart => chart.destroy());
    charts = {};

    // Chart colors
    const colors = {
        small: '#4ECDC4',
        medium: '#FFB84D',
        large: '#E74C3C'
    };

    // 1. Lots by Size Category (Pie Chart)
    const sizeCounts = { small: 0, medium: 0, large: 0 };
    filteredData.forEach(f => {
        const cat = f.properties.size_category || 'small';
        sizeCounts[cat]++;
    });

    charts.sizeChart = new Chart(document.getElementById('sizeChart'), {
        type: 'doughnut',
        data: {
            labels: ['Small (<50 spots)', 'Medium (50-200)', 'Large (200+)'],
            datasets: [{
                data: [sizeCounts.small, sizeCounts.medium, sizeCounts.large],
                backgroundColor: [colors.small, colors.medium, colors.large],
                borderColor: '#1A1F3A',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: { color: '#E5E7EB' }
                }
            }
        }
    });

    // 2. Parking Spots Distribution (Bar Chart)
    const spotRanges = { '0-50': 0, '50-100': 0, '100-200': 0, '200-500': 0, '500+': 0 };
    filteredData.forEach(f => {
        const spots = f.properties.num_spots || 0;
        if (spots <= 50) spotRanges['0-50']++;
        else if (spots <= 100) spotRanges['50-100']++;
        else if (spots <= 200) spotRanges['100-200']++;
        else if (spots <= 500) spotRanges['200-500']++;
        else spotRanges['500+']++;
    });

    charts.spotsChart = new Chart(document.getElementById('spotsChart'), {
        type: 'bar',
        data: {
            labels: Object.keys(spotRanges),
            datasets: [{
                label: 'Number of Lots',
                data: Object.values(spotRanges),
                backgroundColor: '#4ECDC4',
                borderColor: '#4ECDC4',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#9CA3AF' },
                    grid: { color: '#2D3348' }
                },
                x: {
                    ticks: { color: '#9CA3AF' },
                    grid: { color: '#2D3348' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#E5E7EB' }
                }
            }
        }
    });

    // 3. Confidence Distribution (Histogram)
    const confidenceBins = { '0-20%': 0, '20-40%': 0, '40-60%': 0, '60-80%': 0, '80-100%': 0 };
    filteredData.forEach(f => {
        const conf = (f.properties.confidence || 0) * 100;
        if (conf <= 20) confidenceBins['0-20%']++;
        else if (conf <= 40) confidenceBins['20-40%']++;
        else if (conf <= 60) confidenceBins['40-60%']++;
        else if (conf <= 80) confidenceBins['60-80%']++;
        else confidenceBins['80-100%']++;
    });

    charts.confidenceChart = new Chart(document.getElementById('confidenceChart'), {
        type: 'bar',
        data: {
            labels: Object.keys(confidenceBins),
            datasets: [{
                label: 'Number of Lots',
                data: Object.values(confidenceBins),
                backgroundColor: '#60A5FA',
                borderColor: '#60A5FA',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#9CA3AF' },
                    grid: { color: '#2D3348' }
                },
                x: {
                    ticks: { color: '#9CA3AF' },
                    grid: { color: '#2D3348' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#E5E7EB' }
                }
            }
        }
    });

    // 4. Area Distribution (Histogram)
    const areaBins = { '0-1k': 0, '1k-5k': 0, '5k-10k': 0, '10k-50k': 0, '50k+': 0 };
    filteredData.forEach(f => {
        const area = f.properties.area_m2 || 0;
        if (area <= 1000) areaBins['0-1k']++;
        else if (area <= 5000) areaBins['1k-5k']++;
        else if (area <= 10000) areaBins['5k-10k']++;
        else if (area <= 50000) areaBins['10k-50k']++;
        else areaBins['50k+']++;
    });

    charts.areaChart = new Chart(document.getElementById('areaChart'), {
        type: 'bar',
        data: {
            labels: Object.keys(areaBins),
            datasets: [{
                label: 'Number of Lots',
                data: Object.values(areaBins),
                backgroundColor: '#FFB84D',
                borderColor: '#FFB84D',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#9CA3AF' },
                    grid: { color: '#2D3348' }
                },
                x: {
                    ticks: { color: '#9CA3AF' },
                    grid: { color: '#2D3348' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#E5E7EB' }
                }
            }
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    // View toggle buttons
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchView(btn.dataset.view);
        });
    });

    // Size filter buttons
    document.querySelectorAll('.size-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const size = btn.dataset.size;
            sizeFilters[size] = !sizeFilters[size];

            // Toggle active class
            btn.classList.toggle('active');

            // Apply filters
            applyFilters();
        });
    });

    // Confidence slider
    const confidenceSlider = document.getElementById('min-confidence');
    const confidenceValue = document.getElementById('min-confidence-value');

    confidenceSlider.addEventListener('input', (e) => {
        minConfidence = parseInt(e.target.value);
        confidenceValue.textContent = minConfidence + '%';
        applyFilters();
    });

    // Search input
    const searchInput = document.getElementById('search');
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        applyFilters();
    });
}

// Show error message
function showErrorMessage(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #1A1F3A;
        border: 1px solid #E74C3C;
        border-radius: 8px;
        padding: 24px;
        color: #E5E7EB;
        z-index: 10000;
        max-width: 400px;
        text-align: center;
    `;

    errorDiv.innerHTML = `
        <h3 style="color: #E74C3C; margin-bottom: 12px;">Data Not Found</h3>
        <p style="color: #9CA3AF; font-size: 14px;">${message}</p>
        <p style="color: #9CA3AF; font-size: 12px; margin-top: 12px;">
            Run the pipeline:
            <code style="background: #0A0E27; padding: 2px 6px; border-radius: 3px; display: block; margin-top: 8px;">
                python scripts/01_train_model.py<br>
                python scripts/02_download_naip.py<br>
                python scripts/03_run_inference.py<br>
                python scripts/04_generate_geojson.py
            </code>
        </p>
    `;

    document.body.appendChild(errorDiv);
}

// Initialize app
function init() {
    console.log('Initializing ParkSight...');

    // Initialize map
    initMap();

    // Setup event listeners
    setupEventListeners();

    // Load parking data
    loadParkingData();

    console.log('ParkSight initialized');
}

// Run on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
