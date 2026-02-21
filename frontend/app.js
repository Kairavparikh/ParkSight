// ParkSight - Main Application Logic

// Global state
let map;
let parkingData = null;
let parkingLayer = null;
let heatmapLayer = null;
let filteredData = null;
let garageData = null;
let garageLayer = null;
let streetParkingData = null;
let streetParkingLayer = null;
let userLocationMarker = null;
let currentView = 'map'; // 'map', 'heatmap', or 'analytics'
let charts = {}; // Store chart instances
let recommendationMarkers = []; // Track chatbot recommendation markers
let recommendationData = []; // Track what each marker represents

// Filter state
let sizeFilters = {
    small: true,
    medium: true,
    large: true
};
let minConfidence = 0;
let searchQuery = '';
let showGarages = true;
let showStreetParking = true;

// Color mapping
const SIZE_COLORS = {
    small: '#4ECDC4',
    medium: '#FFB84D',
    large: '#E74C3C'
};

// Atlanta neighborhood coordinates (center points)
const ATLANTA_NEIGHBORHOODS = {
    'midtown': { lat: 33.7838, lon: -84.3831, name: 'Midtown' },
    'downtown': { lat: 33.7580, lon: -84.3900, name: 'Downtown' },
    'buckhead': { lat: 33.8490, lon: -84.3670, name: 'Buckhead' },
    'old fourth ward': { lat: 33.7640, lon: -84.3680, name: 'Old Fourth Ward' },
    'virginia-highland': { lat: 33.7770, lon: -84.3500, name: 'Virginia-Highland' },
    'virginia highland': { lat: 33.7770, lon: -84.3500, name: 'Virginia-Highland' },
    'inman park': { lat: 33.7570, lon: -84.3520, name: 'Inman Park' },
    'little five points': { lat: 33.7640, lon: -84.3480, name: 'Little Five Points' },
    'west end': { lat: 33.7350, lon: -84.4170, name: 'West End' },
    'east atlanta': { lat: 33.7370, lon: -84.3420, name: 'East Atlanta' },
    'grant park': { lat: 33.7410, lon: -84.3700, name: 'Grant Park' },
    'reynoldstown': { lat: 33.7460, lon: -84.3560, name: 'Reynoldstown' },
    'cabbagetown': { lat: 33.7530, lon: -84.3630, name: 'Cabbagetown' },
    'poncey-highland': { lat: 33.7730, lon: -84.3500, name: 'Poncey-Highland' },
    'decatur': { lat: 33.7748, lon: -84.2963, name: 'Decatur' }
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

    // Add current location button
    L.Control.CurrentLocation = L.Control.extend({
        onAdd: function(map) {
            const btn = L.DomUtil.create('button', 'location-btn');
            btn.innerHTML = '📍';
            btn.title = 'Show my location';
            btn.onclick = getCurrentLocation;
            return btn;
        }
    });

    L.control.currentLocation = function(opts) {
        return new L.Control.CurrentLocation(opts);
    }

    L.control.currentLocation({ position: 'bottomright' }).addTo(map);

    console.log('Map initialized');

    // Request location access on load
    getCurrentLocation();
}

// Get user's current location
function getCurrentLocation() {
    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            // Remove existing location marker
            if (userLocationMarker) {
                map.removeLayer(userLocationMarker);
            }

            // Create custom icon for user location
            const userIcon = L.divIcon({
                html: '<div style="background: #4ECDC4; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(78, 205, 196, 0.8);"></div>',
                className: 'user-location-marker',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });

            // Add marker at user location
            userLocationMarker = L.marker([lat, lon], { icon: userIcon })
                .addTo(map)
                .bindPopup('<div class="popup-title">📍 Your Location</div>')
                .openPopup();

            // Pan and zoom to user location
            map.setView([lat, lon], 14);
        },
        (error) => {
            let message = 'Unable to retrieve your location';
            if (error.code === 1) {
                message = 'Location access denied. Please enable location services.';
            } else if (error.code === 2) {
                message = 'Location unavailable. Please try again.';
            } else if (error.code === 3) {
                message = 'Location request timed out. Please try again.';
            }
            alert(message);
        }
    );
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

// Load garage data from Google Places
async function loadGarageData() {
    try {
        const response = await fetch('../outputs/parking_garages.geojson');

        if (!response.ok) {
            console.log('No garage data found (run scripts/05_fetch_garages.py)');
            return;
        }

        garageData = await response.json();
        console.log('Loaded garage data:', garageData.features.length, 'garages');

        // Render garages
        renderGarages();

    } catch (error) {
        console.log('No garage data available');
    }
}

// Load street parking data from OpenStreetMap
async function loadStreetParkingData() {
    try {
        const response = await fetch('../outputs/street_parking.geojson');

        if (!response.ok) {
            console.log('No street parking data found (run scripts/06_fetch_street_parking.py)');
            return;
        }

        streetParkingData = await response.json();
        console.log('Loaded street parking data:', streetParkingData.features.length, 'zones');

        // Render street parking
        renderStreetParking();

    } catch (error) {
        console.log('No street parking data available');
    }
}

// Render garage markers on map
function renderGarages() {
    if (!garageData || !showGarages) {
        if (garageLayer) {
            map.removeLayer(garageLayer);
        }
        return;
    }

    // Remove existing layer
    if (garageLayer) {
        map.removeLayer(garageLayer);
    }

    // Create custom garage icon
    const garageIcon = L.divIcon({
        html: '<div style="background: #9333EA; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 16px;">🅿️</div>',
        className: 'garage-marker',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });

    garageLayer = L.geoJSON(garageData, {
        pointToLayer: (feature, latlng) => {
            return L.marker(latlng, { icon: garageIcon });
        },
        onEachFeature: (feature, layer) => {
            const props = feature.properties;

            // Generate stars for rating
            const rating = props.rating || 0;
            const stars = '⭐'.repeat(Math.round(rating));

            // Price level to $ symbols
            const priceLevel = props.price_level;
            let priceSymbols = 'N/A';
            if (priceLevel !== null && priceLevel !== undefined) {
                priceSymbols = '$'.repeat(Math.max(1, priceLevel + 1));
            }

            // Estimated pricing
            const estimatedHourly = props.estimated_hourly || 'N/A';
            const estimatedDaily = props.estimated_daily || 'N/A';

            const popupContent = `
                <div class="popup-title">🏢 ${props.name || 'Parking Garage'}</div>
                <div class="popup-info">
                    <strong>Type:</strong> Parking Garage<br>
                    <strong>Rating:</strong> ${rating ? rating.toFixed(1) : 'N/A'}/5.0 ${stars}<br>
                    <strong>Reviews:</strong> ${(props.total_ratings || 0).toLocaleString()}<br>
                    <strong>Price Level:</strong> ${priceSymbols} (${props.price_description || 'Unknown'})<br>
                    <strong>Est. Hourly:</strong> ${estimatedHourly}<br>
                    <strong>Est. Daily Max:</strong> ${estimatedDaily}<br>
                    ${props.address ? `<strong>Address:</strong> ${props.address}<br>` : ''}
                    ${props.phone ? `<strong>Phone:</strong> ${props.phone}<br>` : ''}
                    ${props.website ? `<br><a href="${props.website}" target="_blank" style="color: #4ECDC4;">Visit Website →</a><br>` : ''}
                    <button onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${layer.getLatLng().lat},${layer.getLatLng().lng}', '_blank')"
                            style="margin-top: 10px; width: 100%; padding: 8px 12px; background: #4ECDC4; border: none; border-radius: 6px; color: white; font-weight: 600; cursor: pointer; font-size: 13px;">
                        📍 Get Directions
                    </button>
                </div>
            `;
            layer.bindPopup(popupContent, { maxWidth: 300 });

            // Add hover effect
            layer.on('mouseover', function() {
                this.setIcon(L.divIcon({
                    html: '<div style="background: #A855F7; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 12px rgba(168,85,247,0.5); display: flex; align-items: center; justify-content: center; font-size: 18px; transform: scale(1.1);">🅿️</div>',
                    className: 'garage-marker',
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                }));
            });

            layer.on('mouseout', function() {
                this.setIcon(garageIcon);
            });
        }
    }).addTo(map);
}

// Render street parking zones on map
function renderStreetParking() {
    if (!streetParkingData || !showStreetParking) {
        if (streetParkingLayer) {
            map.removeLayer(streetParkingLayer);
        }
        return;
    }

    // Remove existing layer
    if (streetParkingLayer) {
        map.removeLayer(streetParkingLayer);
    }

    streetParkingLayer = L.geoJSON(streetParkingData, {
        style: (feature) => {
            const occupancy = feature.properties.occupancy_rate || 0;

            // Color based on occupancy: green (low), yellow (medium), red (high)
            let color;
            if (occupancy < 40) {
                color = '#10B981'; // Green - low occupancy (more available)
            } else if (occupancy < 70) {
                color = '#F59E0B'; // Yellow - medium occupancy
            } else {
                color = '#EF4444'; // Red - high occupancy (less available)
            }

            return {
                color: color,
                weight: 4,
                opacity: 0.8,
                lineCap: 'round'
            };
        },
        onEachFeature: (feature, layer) => {
            const props = feature.properties;
            const occupancy = props.occupancy_rate || 0;

            // Availability indicator
            let availabilityIcon = '🟢';
            let availabilityText = 'Good availability';
            if (occupancy >= 70) {
                availabilityIcon = '🔴';
                availabilityText = 'Limited availability';
            } else if (occupancy >= 40) {
                availabilityIcon = '🟡';
                availabilityText = 'Moderate availability';
            }

            const popupContent = `
                <div class="popup-title">🅿️ ${props.name || 'Street Parking'}</div>
                <div class="popup-info">
                    <strong>Type:</strong> Street Parking Zone<br>
                    <strong>Street:</strong> ${props.street || 'Unknown'}<br>
                    <strong>Total Spaces:</strong> ${props.total_spaces || 'N/A'}<br>
                    <strong>Available:</strong> ${props.available || 0} spots<br>
                    <strong>Occupancy:</strong> ${occupancy.toFixed(1)}% ${availabilityIcon}<br>
                    <strong>Status:</strong> ${availabilityText}<br>
                    <strong>Hourly Rate:</strong> ${props.hourly_rate || 'N/A'}<br>
                    <strong>Time Limit:</strong> ${props.time_limit || 'N/A'}<br>
                    <strong>Payment:</strong> ${(props.payment_methods || []).join(', ')}<br>
                    <br>
                    <div style="background: rgba(16, 185, 129, 0.1); padding: 8px; border-radius: 4px; font-size: 11px; color: #9CA3AF;">
                        💡 <strong>Availability estimated from typical occupancy patterns.</strong><br>
                        For real-time updates, integrate with ParkMobile or city APIs.
                    </div>
                </div>
            `;
            layer.bindPopup(popupContent, { maxWidth: 300 });

            // Add hover effect
            layer.on('mouseover', function() {
                this.setStyle({
                    weight: 6,
                    opacity: 1.0
                });
            });

            layer.on('mouseout', function() {
                this.setStyle({
                    weight: 4,
                    opacity: 0.8
                });
            });
        }
    }).addTo(map);
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

    // Garage toggle
    const garageToggle = document.getElementById('show-garages');
    if (garageToggle) {
        garageToggle.addEventListener('change', (e) => {
            showGarages = e.target.checked;
            renderGarages();
        });
    }

    // Street parking toggle
    const streetParkingToggle = document.getElementById('show-street-parking');
    if (streetParkingToggle) {
        streetParkingToggle.addEventListener('change', (e) => {
            showStreetParking = e.target.checked;
            renderStreetParking();
        });
    }

    // Chatbot toggle
    const chatbotToggle = document.getElementById('chatbot-toggle');
    const chatbotPanel = document.getElementById('chatbot-panel');
    const chatbotClose = document.getElementById('chatbot-close');

    if (chatbotToggle && chatbotPanel) {
        chatbotToggle.addEventListener('click', () => {
            chatbotPanel.classList.add('open');
            chatbotToggle.style.display = 'none';
        });

        chatbotClose.addEventListener('click', () => {
            chatbotPanel.classList.remove('open');
            chatbotToggle.style.display = 'flex';
        });
    }

    // Chatbot send message
    const chatbotInput = document.getElementById('chatbot-input');
    const chatbotSend = document.getElementById('chatbot-send');

    if (chatbotSend && chatbotInput) {
        chatbotSend.addEventListener('click', () => {
            sendChatMessage();
        });

        chatbotInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });
    }

    // Suggestion buttons
    document.querySelectorAll('.suggestion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const query = btn.dataset.query;
            chatbotInput.value = query;
            sendChatMessage();
        });
    });
}

// Send chat message
// Old chatbot functions removed - now using chatbot.js with RAG API

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

// Highlight recommended neighborhood on map
function highlightNeighborhood(neighborhoodName, businessType) {
    // Normalize neighborhood name for lookup
    const normalizedName = neighborhoodName.toLowerCase().trim();

    // Check if we have coordinates for this neighborhood
    const neighborhood = ATLANTA_NEIGHBORHOODS[normalizedName];

    if (!neighborhood) {
        console.log('Unknown neighborhood:', neighborhoodName);
        return;
    }

    // Check if already marked
    const existingMarker = recommendationData.find(r => r.neighborhood === normalizedName);
    if (existingMarker) {
        console.log('Neighborhood already marked:', neighborhoodName);
        return;
    }

    // Create circular highlight area (approx 1km radius)
    const circle = L.circle([neighborhood.lat, neighborhood.lon], {
        color: '#9B59B6',
        fillColor: '#9B59B6',
        fillOpacity: 0.15,
        weight: 3,
        radius: 1000 // meters
    }).addTo(map);

    // Create marker
    const marker = L.marker([neighborhood.lat, neighborhood.lon], {
        icon: L.divIcon({
            html: `<div style="background: #9B59B6; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 15px rgba(155, 89, 182, 0.8); display: flex; align-items: center; justify-content: center; font-size: 16px;">🎯</div>`,
            className: 'recommendation-marker',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        })
    }).addTo(map);

    // Create popup
    const popupContent = `
        <div class="popup-title">🎯 Recommended: ${neighborhood.name}</div>
        <div class="popup-content">
            ${businessType ? `<p><strong>For:</strong> ${businessType}</p>` : ''}
            <p style="color: #9B59B6; font-weight: 500; margin-top: 8px;">Business Advisor Recommendation</p>
        </div>
    `;

    marker.bindPopup(popupContent);

    // Store marker and circle
    recommendationMarkers.push(marker);
    recommendationMarkers.push(circle);
    recommendationData.push({
        neighborhood: normalizedName,
        businessType: businessType
    });

    console.log('Highlighted neighborhood:', neighborhood.name, 'for', businessType);

    // Pan to show the recommendation (if not too far from current view)
    const currentBounds = map.getBounds();
    const markerLatLng = L.latLng(neighborhood.lat, neighborhood.lon);

    if (!currentBounds.contains(markerLatLng)) {
        map.setView(markerLatLng, 13, { animate: true });
    }
}

// Clear all recommendation markers
function clearRecommendations() {
    // Remove all markers and circles from map
    recommendationMarkers.forEach(marker => {
        map.removeLayer(marker);
    });

    // Clear arrays
    recommendationMarkers = [];
    recommendationData = [];

    console.log('Cleared all recommendation markers');
}

// Parse chatbot response and highlight neighborhoods
function processChatbotRecommendation(response, businessType = null) {
    // Extract neighborhood names from response
    const responseText = response.toLowerCase();

    // Check each neighborhood
    for (const [key, data] of Object.entries(ATLANTA_NEIGHBORHOODS)) {
        // Check if neighborhood name appears in response
        // Match variations like "**Midtown**", "Midtown", "midtown", etc.
        const escapedName = data.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\*\\*${escapedName}\\*\\*|\\b${escapedName}\\b`, 'i');

        if (regex.test(responseText)) {
            highlightNeighborhood(data.name, businessType);
        }
    }
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

    // Load garage data
    loadGarageData();

    // Load street parking data
    loadStreetParkingData();

    console.log('ParkSight initialized');
}

// Run on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
