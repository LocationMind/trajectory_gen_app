/**
 * Trip Viewer - Leaflet Version
 */

// State
let map = null;
let trips = [];
let vehicles = [];
let selectedTrip = null;
let pointMarkers = [];
let routeLine = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  await loadVehicles();
  await loadTrips();
  initMap();
});

// Initialize Leaflet map
function initMap() {
  const mapElement = document.getElementById('map');
  if (!mapElement) {
    console.error('Map element not found');
    return;
  }
  
  map = L.map('map', {
    center: [35.6812, 139.7671],
    zoom: 10
  });
  
  // Dark tile layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a> | Routing by <a href="https://openrouteservice.org/">openrouteservice.org</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);
  
  // Handle resize
  setTimeout(() => {
    map.invalidateSize();
  }, 100);
  
  window.addEventListener('resize', () => {
    if (map) {
      map.invalidateSize();
    }
  });
}

// Load vehicles
async function loadVehicles() {
  vehicles = await Storage.get(STORAGE_KEYS.VEHICLES);
  
  const select = document.getElementById('vehicleFilter');
  select.innerHTML = '<option value="">All Vehicles</option>';
  
  vehicles.forEach(v => {
    const option = document.createElement('option');
    option.value = v.vehicle_id;
    option.textContent = `${v.vehicle_name || 'Vehicle ' + v.vehicle_id}`;
    select.appendChild(option);
  });
}

// Load trips
async function loadTrips() {
  const vehicleId = document.getElementById('vehicleFilter').value;
  
  if (vehicleId) {
    trips = await Storage.getByIndex(STORAGE_KEYS.TRIPS, 'vehicle_id', parseInt(vehicleId));
  } else {
    trips = await Storage.get(STORAGE_KEYS.TRIPS);
  }
  
  // Sort by start time (newest first)
  trips.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  
  displayTrips();
}

// Display trips list
function displayTrips() {
  const container = document.getElementById('tripList');
  
  if (trips.length === 0) {
    container.innerHTML = `
      <div style="padding: 32px 16px; text-align: center; color: var(--text-secondary);">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48" style="margin-bottom: 16px; opacity: 0.5;">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        <p>No trips found</p>
        <a href="trajectory.html" class="btn btn-primary" style="margin-top: 16px; display: inline-block;">Generate Trip</a>
      </div>
    `;
    return;
  }
  
  container.innerHTML = trips.map(trip => {
    const vehicle = vehicles.find(v => v.vehicle_id === trip.vehicle_id);
    const vehicleName = vehicle?.vehicle_name || `Vehicle ${trip.vehicle_id}`;
    const startDate = new Date(trip.start_time);
    const distance = (trip.distance_meters / 1000).toFixed(1);
    
    return `
      <div class="trip-item" data-trip-id="${trip.id}" onclick="selectTrip(${trip.id})">
        <div class="trip-item-header">
          <span class="trip-id">#${trip.id}</span>
          <span class="trip-vehicle">${vehicleName}</span>
        </div>
        <div class="trip-item-route">
          <span class="origin">${trip.origin_name || 'Unknown'}</span>
          <span class="arrow">→</span>
          <span class="destination">${trip.destination_name || 'Unknown'}</span>
        </div>
        <div class="trip-item-meta">
          <span>${startDate.toLocaleDateString()}</span>
          <span>${distance} km</span>
          <span>${trip.point_count.toLocaleString()} pts</span>
        </div>
      </div>
    `;
  }).join('');
}

// Format duration
function formatDuration(start, end) {
  const ms = new Date(end) - new Date(start);
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

// Close detail panel
function closeDetailPanel() {
  document.getElementById('detailPanel').classList.remove('active');
  clearMap();
  selectedTrip = null;
  
  document.querySelectorAll('.trip-item').forEach(item => {
    item.classList.remove('selected');
  });
}

// Select trip
async function selectTrip(tripId) {
  document.querySelectorAll('.trip-item').forEach(item => {
    item.classList.remove('selected');
  });
  document.querySelector(`[data-trip-id="${tripId}"]`)?.classList.add('selected');
  
  selectedTrip = trips.find(t => t.id === tripId);
  if (!selectedTrip) return;
  
  const detailPanel = document.getElementById('detailPanel');
  detailPanel.classList.add('active');
  
  document.getElementById('detailTitle').textContent = `Trip #${tripId}`;
  document.getElementById('detailOrigin').textContent = selectedTrip.origin_name || 'Unknown';
  document.getElementById('detailDest').textContent = selectedTrip.destination_name || 'Unknown';
  document.getElementById('detailStart').textContent = new Date(selectedTrip.start_time).toLocaleString();
  document.getElementById('detailEnd').textContent = new Date(selectedTrip.end_time).toLocaleString();
  document.getElementById('detailDistance').textContent = `${(selectedTrip.distance_meters / 1000).toFixed(2)} km`;
  document.getElementById('detailPoints').textContent = selectedTrip.point_count.toLocaleString();
  document.getElementById('detailDuration').textContent = formatDuration(selectedTrip.start_time, selectedTrip.end_time);
  
  const durationHours = (new Date(selectedTrip.end_time) - new Date(selectedTrip.start_time)) / 3600000;
  const avgSpeed = durationHours > 0 ? (selectedTrip.distance_meters / 1000) / durationHours : 0;
  document.getElementById('detailSpeed').textContent = `${avgSpeed.toFixed(1)} km/h`;
  
  await displayTripPoints(tripId);
}

// Display trip points on map
async function displayTripPoints(tripId) {
  if (!map) {
    Toast.error('Map not initialized');
    return;
  }
  
  clearMap();
  
  const points = await Storage.getByIndex(STORAGE_KEYS.GNSS_POINTS, 'trip_id', tripId);
  
  if (points.length === 0) {
    Toast.info('No points found for this trip');
    return;
  }
  
  points.sort((a, b) => new Date(a.positioning_timestamp) - new Date(b.positioning_timestamp));
  
  // Draw path line
  const pathCoords = points.map(p => [p.latitude, p.longitude]);
  routeLine = L.polyline(pathCoords, {
    color: '#58a6ff',
    weight: 3,
    opacity: 0.7
  }).addTo(map);
  
  // Draw markers (sample if too many)
  const sampleRate = points.length > 500 ? Math.ceil(points.length / 500) : 1;
  
  points.forEach((point, index) => {
    if (index % sampleRate !== 0 && index !== 0 && index !== points.length - 1) return;
    
    let color = '#58a6ff';
    let radius = 4;
    
    if (index === 0) {
      color = '#2ea043';
      radius = 10;
    } else if (index === points.length - 1) {
      color = '#f85149';
      radius = 10;
    }
    
    const marker = L.circleMarker([point.latitude, point.longitude], {
      radius: radius,
      fillColor: color,
      fillOpacity: 0.9,
      color: '#fff',
      weight: index === 0 || index === points.length - 1 ? 2 : 1
    }).addTo(map);
    
    if (index === 0 || index === points.length - 1) {
      marker.bindPopup(`
        <strong>${index === 0 ? 'Start' : 'End'} Point</strong><br>
        Time: ${new Date(point.positioning_timestamp).toLocaleString()}<br>
        Lat: ${point.latitude.toFixed(6)}<br>
        Lng: ${point.longitude.toFixed(6)}
      `);
    }
    
    pointMarkers.push(marker);
  });
  
  // Fit bounds
  map.fitBounds(routeLine.getBounds(), { padding: [100, 100] });
}

// Clear map
function clearMap() {
  pointMarkers.forEach(m => map.removeLayer(m));
  pointMarkers = [];
  
  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }
}

// Export selected trip
async function exportSelectedTrip() {
  if (!selectedTrip) {
    Toast.error('No trip selected');
    return;
  }
  
  await exportTripData([selectedTrip]);
  Toast.success('Trip exported successfully');
}

// Export all trips
async function exportAllTrips() {
  if (trips.length === 0) {
    Toast.error('No trips to export');
    return;
  }
  
  await exportTripData(trips);
  Toast.success(`${trips.length} trips exported successfully`);
}

// Export trip data
async function exportTripData(tripsToExport) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  
  const tripData = tripsToExport.map(trip => ({
    id: trip.id,
    vehicle_id: trip.vehicle_id,
    imei: trip.imei,
    serial_no: trip.serial_no,
    origin_lat: trip.origin_lat,
    origin_lng: trip.origin_lng,
    origin_name: trip.origin_name,
    destination_lat: trip.destination_lat,
    destination_lng: trip.destination_lng,
    destination_name: trip.destination_name,
    distance_meters: trip.distance_meters,
    start_time: trip.start_time,
    end_time: trip.end_time,
    point_count: trip.point_count,
    interval_sec: trip.settings?.interval,
    avg_speed_kmh: trip.settings?.avg_speed,
    break_time_min: trip.settings?.break_time,
    min_accuracy_m: trip.settings?.min_accuracy,
    max_accuracy_m: trip.settings?.max_accuracy,
    outlier_rate_pct: trip.settings?.outlier_rate,
    created_at: trip.created_at
  }));
  
  const filename = tripsToExport.length === 1 
    ? `trip_${tripsToExport[0].id}_${timestamp}.csv`
    : `trips_all_${timestamp}.csv`;
    
  CSV.export(tripData, Object.keys(tripData[0]), filename);
  
  // Export GNSS points
  for (const trip of tripsToExport) {
    const points = await Storage.getByIndex(STORAGE_KEYS.GNSS_POINTS, 'trip_id', trip.id);
    
    if (points.length > 0) {
      points.sort((a, b) => new Date(a.positioning_timestamp) - new Date(b.positioning_timestamp));
      
      const pointData = points.map((p, idx) => ({
        id: idx + 1,
        trip_id: p.trip_id,
        device_timestamp: p.device_timestamp,
        received_timestamp: p.received_timestamp,
        positioning_timestamp: p.positioning_timestamp,
        imei: p.imei,
        gps_status: p.gps_status,
        gps_time: p.gps_time,
        latitude: p.latitude,
        longitude: p.longitude,
        altitude: p.altitude,
        speed: p.speed,
        direction: p.direction,
        hdop: p.hdop,
        delete_flag: p.delete_flag
      }));
      
      const pointFilename = tripsToExport.length === 1
        ? `gnss_points_trip${trip.id}_${timestamp}.csv`
        : `gnss_points_trip${trip.id}_batch_${timestamp}.csv`;
        
      CSV.export(pointData, Object.keys(pointData[0]), pointFilename);
    }
  }
}

// Delete selected trip
async function deleteSelectedTrip() {
  if (!selectedTrip) {
    Toast.error('No trip selected');
    return;
  }
  
  if (!confirm(`Delete Trip #${selectedTrip.id}?\n\nThis will also delete all ${selectedTrip.point_count} GNSS points.\n\nThis action cannot be undone.`)) {
    return;
  }
  
  try {
    // Delete GNSS points first
    const points = await Storage.getByIndex(STORAGE_KEYS.GNSS_POINTS, 'trip_id', selectedTrip.id);
    for (const point of points) {
      await Storage.delete(STORAGE_KEYS.GNSS_POINTS, point.id);
    }
    
    // Delete trip
    await Storage.delete(STORAGE_KEYS.TRIPS, selectedTrip.id);
    
    Toast.success('Trip deleted successfully');
    closeDetailPanel();
    await loadTrips();
    
  } catch (error) {
    Toast.error('Failed to delete trip: ' + error.message);
  }
}

// Clear all trips
async function clearAllTrips() {
  const tripCount = trips.length;
  
  if (tripCount === 0) {
    Toast.info('No trips to clear');
    return;
  }
  
  if (!confirm(`Delete ALL ${tripCount} trips for this vehicle filter?\n\nThis will also delete all associated GNSS points.\n\nThis action cannot be undone.`)) {
    return;
  }
  
  try {
    for (const trip of trips) {
      const points = await Storage.getByIndex(STORAGE_KEYS.GNSS_POINTS, 'trip_id', trip.id);
      for (const point of points) {
        await Storage.delete(STORAGE_KEYS.GNSS_POINTS, point.id);
      }
      await Storage.delete(STORAGE_KEYS.TRIPS, trip.id);
    }
    
    Toast.success(`${tripCount} trips deleted successfully`);
    closeDetailPanel();
    await loadTrips();
    
  } catch (error) {
    Toast.error('Failed to clear trips: ' + error.message);
  }
}

// ============================================
// CONSISTENCY CHECK FUNCTIONALITY
// ============================================

let consistencyIssues = [];
let orsApiKeyForConsistency = null;

// Open consistency check panel
async function openConsistencyCheck() {
  const vehicleId = document.getElementById('vehicleFilter').value;
  
  if (!vehicleId) {
    Toast.error('Please select a vehicle first');
    return;
  }
  
  // Check OpenRouteService API key
  const hasOrsKey = await Settings.hasOpenRouteServiceApiKey();
  if (!hasOrsKey) {
    Toast.error('OpenRouteService API key required for consistency fix. Please configure in Settings.');
    return;
  }
  orsApiKeyForConsistency = await Settings.getOpenRouteServiceApiKey();
  
  document.getElementById('consistencyOverlay').classList.add('active');
  document.getElementById('consistencyPanel').classList.add('active');
  document.getElementById('consistencyFooter').style.display = 'none';
  document.getElementById('consistencyBody').innerHTML = `
    <div class="progress-indicator">
      <div class="spinner"></div>
      <span>Analyzing trips for consistency...</span>
    </div>
  `;
  
  await analyzeConsistency(parseInt(vehicleId));
}

// Close consistency panel
function closeConsistencyPanel() {
  document.getElementById('consistencyOverlay').classList.remove('active');
  document.getElementById('consistencyPanel').classList.remove('active');
  consistencyIssues = [];
}

// Analyze consistency
async function analyzeConsistency(vehicleId) {
  try {
    const vehicleTrips = await Storage.getByIndex(STORAGE_KEYS.TRIPS, 'vehicle_id', vehicleId);
    
    if (vehicleTrips.length < 2) {
      displayConsistencyResults([], vehicleTrips.length);
      return;
    }
    
    vehicleTrips.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    
    consistencyIssues = [];
    
    for (let i = 0; i < vehicleTrips.length - 1; i++) {
      const currentTrip = vehicleTrips[i];
      const nextTrip = vehicleTrips[i + 1];
      
      const currentEndTime = new Date(currentTrip.end_time);
      const nextStartTime = new Date(nextTrip.start_time);
      
      // Check time overlap
      if (currentEndTime > nextStartTime) {
        consistencyIssues.push({
          type: 'time_overlap',
          fromTrip: currentTrip,
          toTrip: nextTrip,
          overlapMs: currentEndTime - nextStartTime,
          message: `Trip #${currentTrip.id} ends after Trip #${nextTrip.id} starts`
        });
      }
      
      // Check location gap
      const distance = haversineDistanceTrips(
        { lat: currentTrip.destination_lat, lng: currentTrip.destination_lng },
        { lat: nextTrip.origin_lat, lng: nextTrip.origin_lng }
      );
      
      if (distance > 500) { // 500m threshold
        consistencyIssues.push({
          type: 'location_gap',
          fromTrip: currentTrip,
          toTrip: nextTrip,
          fromLocation: { lat: currentTrip.destination_lat, lng: currentTrip.destination_lng },
          toLocation: { lat: nextTrip.origin_lat, lng: nextTrip.origin_lng },
          distance: distance,
          message: `Gap of ${(distance/1000).toFixed(2)}km between trips #${currentTrip.id} → #${nextTrip.id}`
        });
      }
    }
    
    displayConsistencyResults(consistencyIssues, vehicleTrips.length);
    
  } catch (error) {
    document.getElementById('consistencyBody').innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-danger);">
        Error analyzing trips: ${error.message}
      </div>
    `;
    console.error('Consistency analysis error:', error);
  }
}

// Display consistency results
function displayConsistencyResults(issues, totalTrips) {
  const body = document.getElementById('consistencyBody');
  const footer = document.getElementById('consistencyFooter');
  const executeBtn = document.getElementById('executeFixBtn');
  
  if (issues.length === 0) {
    body.innerHTML = `
      <div class="no-issues">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48" style="margin-bottom: 16px;">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <h4>No Consistency Issues Found</h4>
        <p>${totalTrips} trips analyzed - All trajectories are consistent</p>
      </div>
    `;
    footer.style.display = 'flex';
    executeBtn.textContent = 'Done - Close';
    executeBtn.disabled = false;
    executeBtn.onclick = closeConsistencyPanel;
    return;
  }
  
  const locationGaps = issues.filter(i => i.type === 'location_gap');
  const timeOverlaps = issues.filter(i => i.type === 'time_overlap');
  
  body.innerHTML = `
    <div class="plan-summary">
      <div class="plan-stats">
        <div class="stat">
          <span class="stat-value">${issues.length}</span>
          <span class="stat-label">Issues Found</span>
        </div>
        <div class="stat">
          <span class="stat-value">${locationGaps.length}</span>
          <span class="stat-label">Location Gaps</span>
        </div>
        <div class="stat">
          <span class="stat-value">${timeOverlaps.length}</span>
          <span class="stat-label">Time Overlaps</span>
        </div>
      </div>
    </div>
    <div class="issues-list">
      ${issues.map(issue => `
        <div class="issue-item ${issue.type}">
          <span class="issue-badge ${issue.type}">${issue.type === 'location_gap' ? 'Gap' : 'Overlap'}</span>
          <div class="issue-content">
            <div class="issue-arrow">Trip #${issue.fromTrip.id} → Trip #${issue.toTrip.id}</div>
            <div class="issue-detail">${issue.message}</div>
          </div>
        </div>
      `).join('')}
    </div>
    <div style="padding: 16px; background: var(--bg-surface-active); border-radius: 6px; margin-top: 16px;">
      <h4 style="margin-bottom: 8px;">Fix Plan</h4>
      <ul style="font-size: 13px; color: var(--text-secondary); margin: 0; padding-left: 20px;">
        ${locationGaps.length > 0 ? '<li>Generate connecting trips for location gaps</li>' : ''}
        ${timeOverlaps.length > 0 ? '<li>Shift trip times to resolve overlaps</li>' : ''}
        <li>Trips crossing midnight will be deleted</li>
      </ul>
    </div>
  `;
  
  footer.style.display = 'flex';
  document.getElementById('footerStatus').textContent = `${issues.length} issues to fix`;
  executeBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
    Execute Fix
  `;
  executeBtn.disabled = false;
  executeBtn.onclick = executeConsistencyFix;
}

// Execute consistency fix
async function executeConsistencyFix() {
  const executeBtn = document.getElementById('executeFixBtn');
  const statusDiv = document.getElementById('footerStatus');
  
  executeBtn.disabled = true;
  executeBtn.innerHTML = `
    <div class="spinner" style="width:16px;height:16px;"></div>
    Fixing...
  `;
  
  const vehicleId = parseInt(document.getElementById('vehicleFilter').value);
  const deletedTripIds = new Set();
  
  try {
    // Process location gaps - generate connecting trips
    const locationGaps = consistencyIssues.filter(i => i.type === 'location_gap');
    let cumulativeTimeShift = 0;
    
    for (let i = 0; i < locationGaps.length; i++) {
      const issue = locationGaps[i];
      statusDiv.textContent = `Generating connecting trip ${i + 1}/${locationGaps.length}...`;
      
      if (deletedTripIds.has(issue.fromTrip.id) || deletedTripIds.has(issue.toTrip.id)) {
        continue;
      }
      
      const result = await generateConnectingTrip(issue, cumulativeTimeShift);
      if (result.deleted) {
        deletedTripIds.add(issue.fromTrip.id);
        if (result.deletedPrevious) {
          const prevIssue = locationGaps[i - 1];
          if (prevIssue) {
            deletedTripIds.add(prevIssue.fromTrip.id);
          }
        }
      } else {
        cumulativeTimeShift = result.newCumulativeShift || cumulativeTimeShift;
      }
    }
    
    // Handle time overlaps
    const timeOverlaps = consistencyIssues.filter(i => i.type === 'time_overlap');
    if (timeOverlaps.length > 0) {
      statusDiv.textContent = 'Resolving time overlaps...';
      const shiftResult = await shiftSubsequentTrips(vehicleId, deletedTripIds);
      shiftResult.deletedTripIds.forEach(id => deletedTripIds.add(id));
    }
    
    // Re-analyze
    statusDiv.textContent = 'Re-analyzing...';
    await analyzeConsistency(vehicleId);
    await loadTrips();
    
    if (consistencyIssues.length === 0) {
      Toast.success('All consistency issues resolved!');
    } else {
      Toast.info(`${consistencyIssues.length} issues remaining. Run fix again if needed.`);
    }
    
  } catch (error) {
    Toast.error('Fix failed: ' + error.message);
    console.error('Consistency fix error:', error);
    executeBtn.disabled = false;
    executeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      Retry Fix
    `;
  }
}

// Generate connecting trip
async function generateConnectingTrip(issue, cumulativeTimeShift = 0) {
  if (!orsApiKeyForConsistency) {
    throw new Error('OpenRouteService API key not available');
  }
  
  // Get route from OpenRouteService
  const response = await fetch(
    `https://api.openrouteservice.org/v2/directions/driving-car?start=${issue.fromLocation.lng},${issue.fromLocation.lat}&end=${issue.toLocation.lng},${issue.toLocation.lat}`,
    {
      headers: {
        'Authorization': orsApiKeyForConsistency,
        'Accept': 'application/json, application/geo+json'
      }
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Route calculation failed');
  }
  
  const data = await response.json();
  const routeData = data.features[0];
  const coords = routeData.geometry.coordinates;
  const summary = routeData.properties.summary;
  
  const path = coords.map(c => ({ lat: c[1], lng: c[0] }));
  const totalDistance = summary.distance;
  
  const interval = 10;
  const avgSpeed = 40;
  const minAccuracy = 3;
  const maxAccuracy = 20;
  
  const travelTimeSeconds = (totalDistance / 1000) / avgSpeed * 3600;
  const totalTravelPoints = Math.ceil(travelTimeSeconds / interval);
  
  let currentTime = new Date(new Date(issue.fromTrip.end_time).getTime() + cumulativeTimeShift);
  
  const points = [];
  
  // Generate travel points
  for (let i = 0; i <= totalTravelPoints; i++) {
    const progress = i / totalTravelPoints;
    const distanceAlongRoute = progress * totalDistance;
    const position = getPositionAlongPath(path, distanceAlongRoute);
    
    const accuracy = minAccuracy + Math.random() * (maxAccuracy - minAccuracy);
    const offsetPosition = addRandomOffset(position, accuracy);
    
    const speed = i === 0 ? 0 : avgSpeed + (Math.random() - 0.5) * 10;
    const direction = i === 0 || points.length === 0 ? 0 : calculateBearing(
      points[points.length - 1].latitude,
      points[points.length - 1].longitude,
      offsetPosition.lat,
      offsetPosition.lng
    );
    
    points.push({
      trip_id: null,
      device_timestamp: currentTime.toISOString(),
      received_timestamp: new Date(currentTime.getTime() + Math.random() * 1000).toISOString(),
      positioning_timestamp: currentTime.toISOString(),
      imei: issue.fromTrip.imei || 0,
      gps_status: 'A',
      gps_time: currentTime.getTime() / 1000,
      latitude: offsetPosition.lat,
      longitude: offsetPosition.lng,
      altitude: 10 + Math.random() * 50,
      speed: speed,
      direction: direction,
      hdop: accuracy / 5,
      delete_flag: false
    });
    
    currentTime = new Date(currentTime.getTime() + interval * 1000);
  }
  
  // Add arrival stay
  const arrivalStayMinutes = 15 + Math.floor(Math.random() * 46);
  const arrivalStayPoints = Math.ceil((arrivalStayMinutes * 60) / interval);
  
  for (let a = 0; a < arrivalStayPoints; a++) {
    const stayPosition = addRandomOffset(issue.toLocation, 50);
    
    points.push({
      trip_id: null,
      device_timestamp: currentTime.toISOString(),
      received_timestamp: new Date(currentTime.getTime() + Math.random() * 1000).toISOString(),
      positioning_timestamp: currentTime.toISOString(),
      imei: issue.fromTrip.imei || 0,
      gps_status: 'A',
      gps_time: currentTime.getTime() / 1000,
      latitude: stayPosition.lat,
      longitude: stayPosition.lng,
      altitude: 10 + Math.random() * 50,
      speed: 0,
      direction: Math.random() * 360,
      hdop: (minAccuracy + Math.random() * (maxAccuracy - minAccuracy)) / 5,
      delete_flag: false
    });
    
    currentTime = new Date(currentTime.getTime() + interval * 1000);
  }
  
  const tripEndTime = currentTime;
  const nextTripStartTime = new Date(issue.toTrip.start_time);
  
  // Check if trip crosses midnight
  const tripStartDate = new Date(issue.fromTrip.end_time).toDateString();
  const tripEndDate = tripEndTime.toDateString();
  
  if (tripStartDate !== tripEndDate || tripEndTime > nextTripStartTime) {
    // Delete this connecting trip and the previous trip
    await deleteTripAndPoints(issue.fromTrip.id);
    return { deleted: true, deletedPrevious: true };
  }
  
  // Create trip record
  const newTrip = {
    vehicle_id: issue.fromTrip.vehicle_id,
    imei: issue.fromTrip.imei || 0,
    serial_no: issue.fromTrip.serial_no || '',
    origin_lat: issue.fromLocation.lat,
    origin_lng: issue.fromLocation.lng,
    origin_name: issue.fromTrip.destination_name || 'Auto-generated',
    destination_lat: issue.toLocation.lat,
    destination_lng: issue.toLocation.lng,
    destination_name: issue.toTrip.origin_name || 'Auto-generated',
    distance_meters: totalDistance,
    start_time: points[0].positioning_timestamp,
    end_time: points[points.length - 1].positioning_timestamp,
    point_count: points.length,
    settings: {
      interval: interval,
      avg_speed: avgSpeed,
      break_time: 0,
      min_accuracy: minAccuracy,
      max_accuracy: maxAccuracy,
      outlier_rate: 0
    },
    created_at: new Date().toISOString(),
    is_connecting_trip: true
  };
  
  const tripId = await Storage.add(STORAGE_KEYS.TRIPS, newTrip);
  
  const pointsToSave = points.map(p => {
    const point = { ...p, trip_id: tripId };
    delete point.id;
    return point;
  });
  
  await Storage.addBulk(STORAGE_KEYS.GNSS_POINTS, pointsToSave);
  
  return { 
    deleted: false, 
    newCumulativeShift: tripEndTime.getTime() - nextTripStartTime.getTime()
  };
}

// Shift subsequent trips to resolve time overlaps
async function shiftSubsequentTrips(vehicleId, deletedTripIds) {
  const vehicleTrips = await Storage.getByIndex(STORAGE_KEYS.TRIPS, 'vehicle_id', vehicleId);
  vehicleTrips.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  
  const deletedIds = [];
  let currentDayShift = 0;
  
  for (let i = 0; i < vehicleTrips.length - 1; i++) {
    const currentTrip = vehicleTrips[i];
    const nextTrip = vehicleTrips[i + 1];
    
    if (deletedTripIds.has(currentTrip.id) || deletedTripIds.has(nextTrip.id)) continue;
    
    const currentEndTime = new Date(currentTrip.end_time);
    let nextStartTime = new Date(nextTrip.start_time);
    
    // Apply current day shift
    if (currentDayShift > 0) {
      nextStartTime = new Date(nextStartTime.getTime() + currentDayShift);
    }
    
    if (currentEndTime > nextStartTime) {
      const overlapMs = currentEndTime - nextStartTime + 30 * 60 * 1000; // Add 30 min buffer
      currentDayShift += overlapMs;
      
      const newStartTime = new Date(nextTrip.start_time).getTime() + currentDayShift;
      const newEndTime = new Date(nextTrip.end_time).getTime() + currentDayShift;
      
      // Check if crosses midnight
      const originalDate = new Date(nextTrip.start_time).toDateString();
      const newDate = new Date(newStartTime).toDateString();
      
      if (originalDate !== newDate) {
        // Delete trip if it crosses midnight
        await deleteTripAndPoints(nextTrip.id);
        deletedIds.push(nextTrip.id);
        deletedTripIds.add(nextTrip.id);
        currentDayShift = 0;
        continue;
      }
      
      // Update trip times
      nextTrip.start_time = new Date(newStartTime).toISOString();
      nextTrip.end_time = new Date(newEndTime).toISOString();
      await Storage.update(STORAGE_KEYS.TRIPS, nextTrip);
      
      // Update GNSS points
      const points = await Storage.getByIndex(STORAGE_KEYS.GNSS_POINTS, 'trip_id', nextTrip.id);
      for (const point of points) {
        point.device_timestamp = new Date(new Date(point.device_timestamp).getTime() + currentDayShift).toISOString();
        point.received_timestamp = new Date(new Date(point.received_timestamp).getTime() + currentDayShift).toISOString();
        point.positioning_timestamp = new Date(new Date(point.positioning_timestamp).getTime() + currentDayShift).toISOString();
        point.gps_time = new Date(point.positioning_timestamp).getTime() / 1000;
        await Storage.update(STORAGE_KEYS.GNSS_POINTS, point);
      }
    }
  }
  
  return { shiftedCount: 0, deletedCount: deletedIds.length, deletedTripIds: deletedIds };
}

// Delete trip and its points
async function deleteTripAndPoints(tripId) {
  const points = await Storage.getByIndex(STORAGE_KEYS.GNSS_POINTS, 'trip_id', tripId);
  for (const point of points) {
    await Storage.delete(STORAGE_KEYS.GNSS_POINTS, point.id);
  }
  await Storage.delete(STORAGE_KEYS.TRIPS, tripId);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function haversineDistanceTrips(p1, p2) {
  const lat1 = p1.lat * Math.PI / 180;
  const lat2 = p2.lat * Math.PI / 180;
  const lng1 = p1.lng * Math.PI / 180;
  const lng2 = p2.lng * Math.PI / 180;
  
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return 6371000 * c;
}

function interpolatePositionTrips(p1, p2, fraction) {
  return {
    lat: p1.lat + (p2.lat - p1.lat) * fraction,
    lng: p1.lng + (p2.lng - p1.lng) * fraction
  };
}

function getPositionAlongPath(path, distance) {
  let accumulated = 0;
  
  for (let i = 0; i < path.length - 1; i++) {
    const segmentLength = haversineDistanceTrips(path[i], path[i + 1]);
    
    if (accumulated + segmentLength >= distance) {
      const fraction = (distance - accumulated) / segmentLength;
      return interpolatePositionTrips(path[i], path[i + 1], fraction);
    }
    
    accumulated += segmentLength;
  }
  
  return path[path.length - 1];
}

function addRandomOffset(position, meters) {
  const lat = position.lat;
  const lng = position.lng;
  
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * meters;
  
  const latOffset = (distance * Math.cos(angle)) / 111320;
  const lngOffset = (distance * Math.sin(angle)) / (111320 * Math.cos(lat * Math.PI / 180));
  
  return {
    lat: lat + latOffset,
    lng: lng + lngOffset
  };
}

function calculateBearing(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  
  const x = Math.sin(dLng) * Math.cos(lat2Rad);
  const y = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
  
  let bearing = Math.atan2(x, y) * 180 / Math.PI;
  return (bearing + 360) % 360;
}
