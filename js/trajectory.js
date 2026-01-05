/**
 * Individual Trajectory Generation - Leaflet Version
 */

// State
let map = null;
let routePolyline = null;
let originMarker = null;
let destinationMarker = null;
let geofenceLayers = [];
let gnssMarkers = [];
let generatedPoints = [];
let currentRoute = null;
let selectedVehicle = null;
let selectedDeployment = null;

// Custom icons
const originIcon = L.divIcon({
  className: 'custom-marker',
  html: '<div style="width:20px;height:20px;background:#2ea043;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

const destinationIcon = L.divIcon({
  className: 'custom-marker',
  html: '<div style="width:20px;height:20px;background:#f85149;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  // Check OpenRouteService API key (required for routing)
  const hasOrsKey = await Settings.hasOpenRouteServiceApiKey();
  if (!hasOrsKey) {
    document.getElementById('apiKeyWarning').style.display = 'block';
    document.getElementById('mainContent').style.display = 'none';
    return;
  }
  
  document.getElementById('apiKeyWarning').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';
  
  // Set default start time to now
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('startDatetime').value = now.toISOString().slice(0, 16);
  
  // Initialize Leaflet map
  initMap();
  
  // Load data
  await loadVehicles();
  await loadGeofences();
});

// Initialize Leaflet map
function initMap() {
  // Create map centered on Tokyo
  map = L.map('map', {
    center: [35.6812, 139.7671],
    zoom: 11
  });
  
  // Add dark tile layer (CartoDB Dark Matter)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a> | Routing by <a href="https://openrouteservice.org/">openrouteservice.org</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);
  
  // Click handler
  map.on('click', (e) => {
    handleMapClick(e.latlng);
  });
}

// Load vehicles with deployments
async function loadVehicles() {
  const vehicles = await Storage.get(STORAGE_KEYS.VEHICLES);
  const deployments = await Storage.get(STORAGE_KEYS.DEPLOYMENTS);
  const devices = await Storage.get(STORAGE_KEYS.DEVICES);
  
  const vehiclesWithDeployments = vehicles.filter(v => {
    return deployments.some(d => 
      d.vehicle_id == v.vehicle_id && 
      d.delete_flag !== true && 
      d.delete_flag !== 'true'
    );
  });
  
  const select = document.getElementById('vehicleSelect');
  select.innerHTML = '<option value="">-- Select Vehicle --</option>';
  
  vehiclesWithDeployments.forEach(v => {
    const deployment = deployments.find(d => d.vehicle_id == v.vehicle_id);
    const device = devices.find(d => d.serial_no === deployment?.serial_no);
    
    const option = document.createElement('option');
    option.value = v.vehicle_id;
    option.textContent = `${v.vehicle_name || 'Vehicle ' + v.vehicle_id} (${v.vehicle_number || 'No number'})`;
    option.dataset.deployment = JSON.stringify(deployment);
    option.dataset.device = JSON.stringify(device);
    select.appendChild(option);
  });
  
  if (vehiclesWithDeployments.length === 0) {
    Toast.info('No vehicles with device deployments found. Please create deployments first.');
  }
}

// Load geofences
async function loadGeofences() {
  const geofences = await Storage.get(STORAGE_KEYS.GEOFENCES);
  
  const originSelect = document.getElementById('originSelect');
  const destSelect = document.getElementById('destinationSelect');
  
  originSelect.innerHTML = '<option value="">-- Select Origin Geofence --</option>';
  destSelect.innerHTML = '<option value="">-- Select Destination Geofence --</option>';
  
  geofences.forEach(g => {
    const option1 = document.createElement('option');
    option1.value = g.id;
    option1.textContent = g.geofence_name || `Geofence ${g.id}`;
    option1.dataset.geofence = JSON.stringify(g);
    
    const option2 = option1.cloneNode(true);
    option2.dataset.geofence = option1.dataset.geofence;
    
    originSelect.appendChild(option1);
    destSelect.appendChild(option2);
  });
  
  drawGeofences(geofences);
}

// Draw geofences on map
function drawGeofences(geofences) {
  geofenceLayers.forEach(l => map.removeLayer(l));
  geofenceLayers = [];
  
  geofences.forEach(g => {
    try {
      const geoJson = typeof g.geofence === 'string' ? JSON.parse(g.geofence) : g.geofence;
      if (geoJson && geoJson.coordinates) {
        const coords = geoJson.coordinates[0].map(c => [c[1], c[0]]);
        
        const polygon = L.polygon(coords, {
          color: '#a371f7',
          weight: 2,
          fillColor: '#a371f7',
          fillOpacity: 0.2
        }).addTo(map);
        
        polygon.bindTooltip(g.geofence_name || 'Geofence ' + g.id);
        polygon.on('click', () => selectGeofenceFromMap(g));
        polygon.geofenceData = g;
        geofenceLayers.push(polygon);
      }
    } catch (e) {
      console.error('Error parsing geofence:', e);
    }
  });
}

// Select geofence from dropdown
function selectGeofence(type) {
  const select = document.getElementById(type === 'origin' ? 'originSelect' : 'destinationSelect');
  const selectedOption = select.options[select.selectedIndex];
  
  if (!selectedOption.value) return;
  
  const geofence = JSON.parse(selectedOption.dataset.geofence);
  const center = getGeofenceCenter(geofence);
  
  if (type === 'origin') {
    setOrigin(center);
  } else {
    setDestination(center);
  }
}

// Select geofence from map click
function selectGeofenceFromMap(geofence) {
  const center = getGeofenceCenter(geofence);
  
  if (!originMarker) {
    setOrigin(center);
    document.getElementById('originSelect').value = geofence.id;
  } else if (!destinationMarker) {
    setDestination(center);
    document.getElementById('destinationSelect').value = geofence.id;
  }
}

// Get center of geofence
function getGeofenceCenter(geofence) {
  const geoJson = typeof geofence.geofence === 'string' ? JSON.parse(geofence.geofence) : geofence.geofence;
  const coords = geoJson.coordinates[0];
  
  let lat = 0, lng = 0;
  coords.forEach(c => {
    lat += c[1];
    lng += c[0];
  });
  
  return { lat: lat / coords.length, lng: lng / coords.length };
}

// Handle map click
function handleMapClick(latlng) {
  if (!originMarker) {
    setOrigin({ lat: latlng.lat, lng: latlng.lng });
  } else if (!destinationMarker) {
    setDestination({ lat: latlng.lat, lng: latlng.lng });
  } else {
    clearRoute();
    setOrigin({ lat: latlng.lat, lng: latlng.lng });
  }
}

// Set origin marker
function setOrigin(position) {
  if (originMarker) {
    map.removeLayer(originMarker);
  }
  
  originMarker = L.marker([position.lat, position.lng], { icon: originIcon })
    .addTo(map)
    .bindTooltip('Origin');
  
  checkAndCalculateRoute();
}

// Set destination marker
function setDestination(position) {
  if (destinationMarker) {
    map.removeLayer(destinationMarker);
  }
  
  destinationMarker = L.marker([position.lat, position.lng], { icon: destinationIcon })
    .addTo(map)
    .bindTooltip('Destination');
  
  checkAndCalculateRoute();
}

// Clear route
function clearRoute() {
  if (originMarker) {
    map.removeLayer(originMarker);
    originMarker = null;
  }
  if (destinationMarker) {
    map.removeLayer(destinationMarker);
    destinationMarker = null;
  }
  if (routePolyline) {
    map.removeLayer(routePolyline);
    routePolyline = null;
  }
  clearGnssMarkers();
  document.getElementById('routeInfo').style.display = 'none';
  document.getElementById('generateBtn').disabled = true;
  document.getElementById('saveBtn').disabled = true;
  currentRoute = null;
  generatedPoints = [];
}

// Check and calculate route
async function checkAndCalculateRoute() {
  if (!originMarker || !destinationMarker) return;
  
  try {
    const originPos = originMarker.getLatLng();
    const destPos = destinationMarker.getLatLng();
    
    const orsApiKey = await Settings.getOpenRouteServiceApiKey();
    
    const response = await fetch(
      `https://api.openrouteservice.org/v2/directions/driving-car?start=${originPos.lng},${originPos.lat}&end=${destPos.lng},${destPos.lat}`,
      {
        headers: {
          'Authorization': orsApiKey,
          'Accept': 'application/json, application/geo+json'
        }
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Route calculation failed');
    }
    
    const data = await response.json();
    const route = data.features[0];
    const coords = route.geometry.coordinates;
    const summary = route.properties.summary;
    
    const path = coords.map(c => ({ lat: c[1], lng: c[0] }));
    
    currentRoute = {
      path: path,
      distance: summary.distance,
      duration: summary.duration
    };
    
    // Draw route
    if (routePolyline) {
      map.removeLayer(routePolyline);
    }
    
    routePolyline = L.polyline(path.map(p => [p.lat, p.lng]), {
      color: '#58a6ff',
      weight: 4,
      opacity: 0.8
    }).addTo(map);
    
    // Show route info
    const distanceKm = (summary.distance / 1000).toFixed(1);
    const durationMin = Math.round(summary.duration / 60);
    document.getElementById('routeDistance').textContent = `${distanceKm} km`;
    document.getElementById('routeDuration').textContent = `${durationMin} min`;
    document.getElementById('pointCount').textContent = '-';
    document.getElementById('routeInfo').style.display = 'flex';
    
    updateGenerateButton();
    
    // Fit bounds
    map.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });
    
  } catch (error) {
    Toast.error('Failed to calculate route: ' + error.message);
    console.error('Route calculation error:', error);
  }
}

// Update generate button state
function updateGenerateButton() {
  const vehicle = document.getElementById('vehicleSelect').value;
  const hasRoute = currentRoute !== null;
  document.getElementById('generateBtn').disabled = !vehicle || !hasRoute;
}

// On vehicle change
function onVehicleChange() {
  const select = document.getElementById('vehicleSelect');
  const selectedOption = select.options[select.selectedIndex];
  
  if (!selectedOption.value) {
    selectedVehicle = null;
    selectedDeployment = null;
    document.getElementById('vehicleInfo').textContent = '';
  } else {
    const deployment = JSON.parse(selectedOption.dataset.deployment || '{}');
    const device = JSON.parse(selectedOption.dataset.device || '{}');
    
    selectedDeployment = deployment;
    document.getElementById('vehicleInfo').textContent = 
      `IMEI: ${device.imei || 'N/A'} | Serial: ${deployment.serial_no || 'N/A'}`;
  }
  
  updateGenerateButton();
}

// Generate trajectory
async function generateTrajectory() {
  if (!currentRoute) {
    Toast.error('Please select origin and destination first');
    return;
  }
  
  const select = document.getElementById('vehicleSelect');
  if (!select.value) {
    Toast.error('Please select a vehicle');
    return;
  }
  
  const deployment = JSON.parse(select.options[select.selectedIndex].dataset.deployment || '{}');
  const device = JSON.parse(select.options[select.selectedIndex].dataset.device || '{}');
  
  const startDatetime = new Date(document.getElementById('startDatetime').value);
  const interval = parseInt(document.getElementById('interval').value) || 10;
  const avgSpeed = parseFloat(document.getElementById('avgSpeed').value) || 40;
  const breakTime = parseInt(document.getElementById('breakTime').value) || 0;
  const minAccuracy = parseFloat(document.getElementById('minAccuracy').value) || 3;
  const maxAccuracy = parseFloat(document.getElementById('maxAccuracy').value) || 20;
  const outlierRate = parseFloat(document.getElementById('outlierRate').value) || 0;
  
  showProgress('Generating Points...', 0, 0);
  
  try {
    const path = currentRoute.path;
    const totalDistance = currentRoute.distance;
    
    const travelTimeSeconds = (totalDistance / 1000) / avgSpeed * 3600;
    const totalPoints = Math.ceil(travelTimeSeconds / interval);
    
    generatedPoints = [];
    let currentTime = new Date(startDatetime);
    let breakInserted = false;
    let breakPointIndex = breakTime > 0 ? Math.floor(Math.random() * (totalPoints - 10)) + 5 : -1;
    
    for (let i = 0; i <= totalPoints; i++) {
      if (i % 10 === 0) {
        updateProgress(i, totalPoints);
        await new Promise(r => setTimeout(r, 0));
      }
      
      const progress = i / totalPoints;
      const distanceAlongRoute = progress * totalDistance;
      const position = getPositionAlongPath(path, distanceAlongRoute);
      
      const accuracy = minAccuracy + Math.random() * (maxAccuracy - minAccuracy);
      let offsetPosition = addRandomOffset(position, accuracy);
      
      let isOutlier = false;
      if (Math.random() * 100 < outlierRate) {
        const outlierOffset = 100 + Math.random() * 1900;
        offsetPosition = addRandomOffset(position, outlierOffset);
        isOutlier = true;
      }
      
      const speed = i === 0 ? 0 : avgSpeed + (Math.random() - 0.5) * 10;
      const direction = i === 0 ? 0 : calculateDirection(
        generatedPoints[generatedPoints.length - 1],
        offsetPosition
      );
      
      const point = {
        device_timestamp: currentTime.toISOString(),
        received_timestamp: new Date(currentTime.getTime() + Math.random() * 1000).toISOString(),
        positioning_timestamp: currentTime.toISOString(),
        imei: parseInt(device.imei) || 0,
        gps_status: isOutlier ? 'LOW_ACCURACY' : 'VALID',
        gps_time: currentTime.getTime() / 1000,
        latitude: offsetPosition.lat,
        longitude: offsetPosition.lng,
        altitude: 10 + Math.random() * 50,
        speed: speed,
        direction: direction,
        authentication_status: null,
        base_info: null,
        hdop: accuracy / 5,
        lte_rssi: null,
        mmri_score: null,
        mmri_base: null,
        mmri_presence: null,
        mmri_synergy: null,
        mmri_auth_boost: null,
        cellular_latitude: null,
        cellular_longitude: null,
        cellular_accuracy: null,
        cellular_mcc: null,
        cellular_mnc: null,
        cellular_lac_tac: null,
        cellular_cell_id: null,
        gnss_vs_cellular_distance: null,
        ekf_latitude: null,
        ekf_longitude: null,
        gnss_vs_ekf_distance: null,
        pdop: null,
        vdop: null,
        tracking_satellites: null,
        used_satellites: null,
        authenticated_satellites: null,
        uptime: null,
        free_heap: null,
        nmea_checksum_error_count: null,
        modem_error_count: null,
        modem_reconnect_count: null,
        imu_error_count: null,
        fw_version: device.fw_version || null,
        last_reset_reason: null,
        delete_flag: false,
        is_outlier: isOutlier,
        is_break: false
      };
      
      generatedPoints.push(point);
      currentTime = new Date(currentTime.getTime() + interval * 1000);
      
      // Insert break points
      if (breakTime > 0 && i === breakPointIndex && !breakInserted) {
        const breakIntervalSec = 60; // 1 minute interval during break
        const breakPoints = Math.ceil((breakTime * 60) / breakIntervalSec);
        const breakCenter = offsetPosition;
        
        for (let b = 0; b < breakPoints; b++) {
          const breakPosition = addRandomOffset(breakCenter, 10); // 10m radius
          
          const breakPoint = {
            device_timestamp: currentTime.toISOString(),
            received_timestamp: new Date(currentTime.getTime() + Math.random() * 1000).toISOString(),
            positioning_timestamp: currentTime.toISOString(),
            imei: parseInt(device.imei) || 0,
            gps_status: 'VALID',
            gps_time: currentTime.getTime() / 1000,
            latitude: breakPosition.lat,
            longitude: breakPosition.lng,
            altitude: 10 + Math.random() * 50,
            speed: 0,
            direction: 0,
            authentication_status: null,
            base_info: null,
            hdop: accuracy / 5,
            lte_rssi: null,
            mmri_score: null,
            mmri_base: null,
            mmri_presence: null,
            mmri_synergy: null,
            mmri_auth_boost: null,
            cellular_latitude: null,
            cellular_longitude: null,
            cellular_accuracy: null,
            cellular_mcc: null,
            cellular_mnc: null,
            cellular_lac_tac: null,
            cellular_cell_id: null,
            gnss_vs_cellular_distance: null,
            ekf_latitude: null,
            ekf_longitude: null,
            gnss_vs_ekf_distance: null,
            pdop: null,
            vdop: null,
            tracking_satellites: null,
            used_satellites: null,
            authenticated_satellites: null,
            uptime: null,
            free_heap: null,
            nmea_checksum_error_count: null,
            modem_error_count: null,
            modem_reconnect_count: null,
            imu_error_count: null,
            fw_version: device.fw_version || null,
            last_reset_reason: null,
            delete_flag: false,
            is_outlier: false,
            is_break: true
          };
          
          generatedPoints.push(breakPoint);
          currentTime = new Date(currentTime.getTime() + breakIntervalSec * 1000); // 1 minute interval
          
          if (b % 5 === 0) {
            updateProgress(i + b, totalPoints + breakPoints);
            await new Promise(r => setTimeout(r, 0));
          }
        }
        breakInserted = true;
      }
    }
    
    // Add arrival stay points
    const arrivalStayMinutes = 15 + Math.floor(Math.random() * 46);
    const arrivalStayIntervalSec = 60; // 1 minute interval during arrival stay
    const arrivalStayPoints = Math.ceil((arrivalStayMinutes * 60) / arrivalStayIntervalSec);
    const destinationCenter = destinationMarker.getLatLng();
    
    // Fixed 10m radius from geofence center for arrival stay
    const arrivalStayRadius = 10;
    
    for (let a = 0; a < arrivalStayPoints; a++) {
      const stayPosition = addRandomOffset({ lat: destinationCenter.lat, lng: destinationCenter.lng }, arrivalStayRadius);
      
      const stayPoint = {
        device_timestamp: currentTime.toISOString(),
        received_timestamp: new Date(currentTime.getTime() + Math.random() * 1000).toISOString(),
        positioning_timestamp: currentTime.toISOString(),
        imei: parseInt(device.imei) || 0,
        gps_status: 'VALID',
        gps_time: currentTime.getTime() / 1000,
        latitude: stayPosition.lat,
        longitude: stayPosition.lng,
        altitude: 10 + Math.random() * 50,
        speed: 0,
        direction: Math.random() * 360,
        authentication_status: null,
        base_info: null,
        hdop: (minAccuracy + Math.random() * (maxAccuracy - minAccuracy)) / 5,
        lte_rssi: null,
        mmri_score: null,
        mmri_base: null,
        mmri_presence: null,
        mmri_synergy: null,
        mmri_auth_boost: null,
        cellular_latitude: null,
        cellular_longitude: null,
        cellular_accuracy: null,
        cellular_mcc: null,
        cellular_mnc: null,
        cellular_lac_tac: null,
        cellular_cell_id: null,
        gnss_vs_cellular_distance: null,
        ekf_latitude: null,
        ekf_longitude: null,
        gnss_vs_ekf_distance: null,
        pdop: null,
        vdop: null,
        tracking_satellites: null,
        used_satellites: null,
        authenticated_satellites: null,
        uptime: null,
        free_heap: null,
        nmea_checksum_error_count: null,
        modem_error_count: null,
        modem_reconnect_count: null,
        imu_error_count: null,
        fw_version: device.fw_version || null,
        last_reset_reason: null,
        delete_flag: false,
        is_outlier: false,
        is_break: false,
        is_arrival_stay: true
      };
      
      generatedPoints.push(stayPoint);
      currentTime = new Date(currentTime.getTime() + arrivalStayIntervalSec * 1000); // 1 minute interval
      
      if (a % 10 === 0) {
        updateProgress(totalPoints + a, totalPoints + arrivalStayPoints);
        await new Promise(r => setTimeout(r, 0));
      }
    }
    
    hideProgress();
    displayGeneratedPoints();
    
    document.getElementById('pointCount').textContent = generatedPoints.length.toString();
    document.getElementById('saveBtn').disabled = false;
    
    Toast.success(`Generated ${generatedPoints.length} GNSS points`);
    
  } catch (error) {
    hideProgress();
    Toast.error('Generation failed: ' + error.message);
    console.error(error);
  }
}

// Haversine distance
function haversineDistance(p1, p2) {
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

// Interpolate position
function interpolatePosition(p1, p2, fraction) {
  return {
    lat: p1.lat + (p2.lat - p1.lat) * fraction,
    lng: p1.lng + (p2.lng - p1.lng) * fraction
  };
}

function getPositionAlongPath(path, distance) {
  let accumulated = 0;
  
  for (let i = 0; i < path.length - 1; i++) {
    const segmentLength = haversineDistance(path[i], path[i + 1]);
    
    if (accumulated + segmentLength >= distance) {
      const fraction = (distance - accumulated) / segmentLength;
      return interpolatePosition(path[i], path[i + 1], fraction);
    }
    
    accumulated += segmentLength;
  }
  
  return path[path.length - 1];
}

// Add random offset
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

// Calculate direction
function calculateDirection(from, to) {
  const fromLat = from.latitude * Math.PI / 180;
  const fromLng = from.longitude * Math.PI / 180;
  const toLat = to.lat * Math.PI / 180;
  const toLng = to.lng * Math.PI / 180;
  
  const dLng = toLng - fromLng;
  
  const x = Math.sin(dLng) * Math.cos(toLat);
  const y = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLng);
  
  let bearing = Math.atan2(x, y) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

// Display generated points
function displayGeneratedPoints() {
  clearGnssMarkers();
  
  generatedPoints.forEach((point, index) => {
    let color = '#58a6ff';
    let size = 8;
    if (point.is_outlier) {
      color = '#d29922';
      size = 12;
    }
    if (point.is_break) {
      color = '#a371f7';
      size = 10;
    }
    if (point.is_arrival_stay) {
      color = '#2ea043';
      size = 8;
    }
    
    const marker = L.circleMarker([point.latitude, point.longitude], {
      radius: size / 2,
      fillColor: color,
      fillOpacity: 0.8,
      color: '#fff',
      weight: 1
    }).addTo(map);
    
    marker.bindTooltip(`Point ${index + 1}: ${point.gps_status}${point.is_arrival_stay ? ' (Arrival Stay)' : ''}`);
    gnssMarkers.push(marker);
  });
}

// Clear GNSS markers
function clearGnssMarkers() {
  gnssMarkers.forEach(m => map.removeLayer(m));
  gnssMarkers = [];
}

// Save trip
async function saveTrip() {
  if (generatedPoints.length === 0) {
    Toast.error('No points to save');
    return;
  }
  
  const select = document.getElementById('vehicleSelect');
  const selectedOption = select.options[select.selectedIndex];
  const deployment = JSON.parse(selectedOption.dataset.deployment || '{}');
  const device = JSON.parse(selectedOption.dataset.device || '{}');
  
  const origin = originMarker.getLatLng();
  const destination = destinationMarker.getLatLng();
  
  const trip = {
    vehicle_id: parseInt(select.value),
    imei: device.imei || 0,
    serial_no: deployment.serial_no || '',
    origin_lat: origin.lat,
    origin_lng: origin.lng,
    origin_name: document.getElementById('originSelect').options[document.getElementById('originSelect').selectedIndex].textContent,
    destination_lat: destination.lat,
    destination_lng: destination.lng,
    destination_name: document.getElementById('destinationSelect').options[document.getElementById('destinationSelect').selectedIndex].textContent,
    distance_meters: currentRoute.distance,
    start_time: generatedPoints[0].positioning_timestamp,
    end_time: generatedPoints[generatedPoints.length - 1].positioning_timestamp,
    point_count: generatedPoints.length,
    settings: {
      interval: parseInt(document.getElementById('interval').value),
      avg_speed: parseFloat(document.getElementById('avgSpeed').value),
      break_time: parseInt(document.getElementById('breakTime').value),
      min_accuracy: parseFloat(document.getElementById('minAccuracy').value),
      max_accuracy: parseFloat(document.getElementById('maxAccuracy').value),
      outlier_rate: parseFloat(document.getElementById('outlierRate').value)
    },
    created_at: new Date().toISOString()
  };
  
  try {
    const tripId = await Storage.add(STORAGE_KEYS.TRIPS, trip);
    
    const pointsToSave = generatedPoints.map((p, idx) => {
      const point = { ...p };
      delete point.id;
      delete point.is_outlier;
      delete point.is_break;
      delete point.is_arrival_stay;
      return point;
    });
    
    await Storage.addBulk(STORAGE_KEYS.GNSS_POINTS, pointsToSave);
    
    Toast.success('Trip saved to database');
    
    exportTripCSV(trip, tripId);
    exportPointsCSV(pointsToSave, tripId);
    
  } catch (error) {
    Toast.error('Failed to save: ' + error.message);
    console.error(error);
  }
}

// Export trip CSV
function exportTripCSV(trip, tripId) {
  const data = [{
    id: tripId,
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
    interval_sec: trip.settings.interval,
    avg_speed_kmh: trip.settings.avg_speed,
    break_time_min: trip.settings.break_time,
    min_accuracy_m: trip.settings.min_accuracy,
    max_accuracy_m: trip.settings.max_accuracy,
    outlier_rate_pct: trip.settings.outlier_rate,
    created_at: trip.created_at
  }];
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  CSV.export(data, Object.keys(data[0]), `trip_${tripId}_${timestamp}.csv`);
}

// Export points CSV
function exportPointsCSV(points, tripId) {
  const data = points.map((p, idx) => ({
    id: idx + 1,
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
    authentication_status: p.authentication_status,
    base_info: p.base_info,
    hdop: p.hdop,
    lte_rssi: p.lte_rssi,
    mmri_score: p.mmri_score,
    mmri_base: p.mmri_base,
    mmri_presence: p.mmri_presence,
    mmri_synergy: p.mmri_synergy,
    mmri_auth_boost: p.mmri_auth_boost,
    cellular_latitude: p.cellular_latitude,
    cellular_longitude: p.cellular_longitude,
    cellular_accuracy: p.cellular_accuracy,
    cellular_mcc: p.cellular_mcc,
    cellular_mnc: p.cellular_mnc,
    cellular_lac_tac: p.cellular_lac_tac,
    cellular_cell_id: p.cellular_cell_id,
    gnss_vs_cellular_distance: p.gnss_vs_cellular_distance,
    ekf_latitude: p.ekf_latitude,
    ekf_longitude: p.ekf_longitude,
    gnss_vs_ekf_distance: p.gnss_vs_ekf_distance,
    pdop: p.pdop,
    vdop: p.vdop,
    tracking_satellites: p.tracking_satellites,
    used_satellites: p.used_satellites,
    authenticated_satellites: p.authenticated_satellites,
    uptime: p.uptime,
    free_heap: p.free_heap,
    nmea_checksum_error_count: p.nmea_checksum_error_count,
    modem_error_count: p.modem_error_count,
    modem_reconnect_count: p.modem_reconnect_count,
    imu_error_count: p.imu_error_count,
    fw_version: p.fw_version,
    last_reset_reason: p.last_reset_reason,
    delete_flag: p.delete_flag,
    insert_by: 'trajectory_gen',
    insert_datetime: new Date().toISOString(),
    update_by: 'trajectory_gen',
    update_datetime: new Date().toISOString()
  }));
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  CSV.export(data, Object.keys(data[0]), `gnss_points_trip${tripId}_${timestamp}.csv`);
}

// Progress helpers
function showProgress(title, current, total) {
  document.getElementById('progressTitle').textContent = title;
  document.getElementById('progressText').textContent = `${current} / ${total} points`;
  document.getElementById('progressBar').style.width = total ? `${(current / total) * 100}%` : '0%';
  document.getElementById('progressOverlay').classList.add('active');
}

function updateProgress(current, total) {
  document.getElementById('progressText').textContent = `${current} / ${total} points`;
  document.getElementById('progressBar').style.width = `${(current / total) * 100}%`;
}

function hideProgress() {
  document.getElementById('progressOverlay').classList.remove('active');
}
