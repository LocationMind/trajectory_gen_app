/**
 * Batch Trajectory Generation
 */

// State
let isRunning = false;
let shouldStop = false;
let geofences = [];
let orsApiKey = null;
let stats = {
  days: 0,
  trips: 0,
  points: 0,
  errors: 0
};

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  // Check OpenRouteService API key (required for routing)
  const hasOrsKey = await Settings.hasOpenRouteServiceApiKey();
  if (!hasOrsKey) {
    document.getElementById('apiKeyWarning').style.display = 'block';
    document.getElementById('mainContent').style.display = 'none';
    return;
  }
  
  orsApiKey = await Settings.getOpenRouteServiceApiKey();
  
  document.getElementById('apiKeyWarning').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';
  
  // Set default dates
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  document.getElementById('dateFrom').value = weekAgo.toISOString().slice(0, 10);
  document.getElementById('dateTo').value = today.toISOString().slice(0, 10);
  
  // Load data
  await loadVehicles();
  await loadGeofences();
});

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
    Toast.info('No vehicles with device deployments found.');
  }
}

// Load geofences
async function loadGeofences() {
  geofences = await Storage.get(STORAGE_KEYS.GEOFENCES);
  
  if (geofences.length < 2) {
    Toast.info('At least 2 geofences are required for batch generation.');
  }
}

// Start batch generation
async function startBatchGeneration() {
  const vehicleSelect = document.getElementById('vehicleSelect');
  if (!vehicleSelect.value) {
    Toast.error('Please select a vehicle');
    return;
  }
  
  if (geofences.length < 2) {
    Toast.error('At least 2 geofences are required');
    return;
  }
  
  const dateFrom = new Date(document.getElementById('dateFrom').value);
  const dateTo = new Date(document.getElementById('dateTo').value);
  
  if (dateFrom > dateTo) {
    Toast.error('Start date must be before end date');
    return;
  }
  
  const tripsPerDay = parseInt(document.getElementById('tripsPerDay').value);
  const selectedOption = vehicleSelect.options[vehicleSelect.selectedIndex];
  const deployment = JSON.parse(selectedOption.dataset.deployment || '{}');
  const device = JSON.parse(selectedOption.dataset.device || '{}');
  
  // Reset stats
  stats = { days: 0, trips: 0, points: 0, errors: 0 };
  updateStats();
  
  // Show progress section
  document.getElementById('progressSection').style.display = 'block';
  document.getElementById('startBtn').style.display = 'none';
  document.getElementById('stopBtn').style.display = 'inline-flex';
  
  // Clear log
  document.getElementById('logContainer').innerHTML = '';
  
  isRunning = true;
  shouldStop = false;
  
  // Calculate total days
  const totalDays = Math.ceil((dateTo - dateFrom) / (24 * 60 * 60 * 1000)) + 1;
  const totalTrips = totalDays * tripsPerDay;
  
  log('info', `Starting batch generation: ${totalDays} days, ${tripsPerDay} trips/day = ${totalTrips} trips`);
  
  // Process each day
  let currentDate = new Date(dateFrom);
  let tripIndex = 0;
  
  while (currentDate <= dateTo && !shouldStop) {
    stats.days++;
    log('info', `Processing ${currentDate.toISOString().slice(0, 10)}...`);
    
    // Track the end time of the previous trip for this day
    let lastTripEndTime = null;
    
    for (let t = 0; t < tripsPerDay && !shouldStop; t++) {
      tripIndex++;
      
      try {
        // Random geofence pair
        const originIdx = Math.floor(Math.random() * geofences.length);
        let destIdx = Math.floor(Math.random() * geofences.length);
        while (destIdx === originIdx && geofences.length > 1) {
          destIdx = Math.floor(Math.random() * geofences.length);
        }
        
        const originGeofence = geofences[originIdx];
        const destGeofence = geofences[destIdx];
        
        // Calculate start time - avoid overlap with previous trip
        let startTime;
        if (t === 0) {
          // First trip of the day: start between 6:00 and 9:00
          const startHour = 6 + Math.floor(Math.random() * 3);
          const startMinute = Math.floor(Math.random() * 60);
          startTime = new Date(currentDate);
          startTime.setHours(startHour, startMinute, 0, 0);
        } else {
          // Subsequent trips: start 30min to 2hours after the previous trip ended
          const gapMinutes = 30 + Math.floor(Math.random() * 91); // 30-120 minutes gap
          startTime = new Date(lastTripEndTime.getTime() + gapMinutes * 60 * 1000);
          
          // If start time would be after 20:00, skip remaining trips for this day
          if (startTime.getHours() >= 20) {
            log('info', `    Skipping remaining trips (too late in the day)`);
            break;
          }
        }
        
        // Random settings
        const breakOptions = [0, 10, 20, 30];
        const breakTime = breakOptions[Math.floor(Math.random() * breakOptions.length)];
        const avgSpeed = 30 + Math.floor(Math.random() * 31); // 30-60
        
        const startTimeStr = startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        log('info', `  Trip ${t + 1} (${startTimeStr}): ${originGeofence.geofence_name} → ${destGeofence.geofence_name}`);
        
        // Generate trip
        const result = await generateTrip({
          vehicleId: parseInt(vehicleSelect.value),
          deployment,
          device,
          originGeofence,
          destGeofence,
          startTime,
          interval: 10,
          avgSpeed,
          breakTime,
          minAccuracy: 3,
          maxAccuracy: 20,
          outlierRate: 0
        });
        
        if (result.success) {
          stats.trips++;
          stats.points += result.pointCount;
          lastTripEndTime = result.endTime; // Store end time for next trip calculation
          const endTimeStr = lastTripEndTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
          log('success', `    ✓ Generated ${result.pointCount} points (ended ${endTimeStr})`);
        } else {
          stats.errors++;
          log('error', `    ✗ ${result.error}`);
        }
        
      } catch (error) {
        stats.errors++;
        log('error', `    ✗ Error: ${error.message}`);
      }
      
      updateStats();
      updateProgress(tripIndex, totalTrips);
      
      // Small delay to not overwhelm the API
      await new Promise(r => setTimeout(r, 500));
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  isRunning = false;
  document.getElementById('startBtn').style.display = 'inline-flex';
  document.getElementById('stopBtn').style.display = 'none';
  
  if (shouldStop) {
    log('info', 'Generation stopped by user');
    Toast.info('Batch generation stopped');
  } else {
    log('success', `Completed! ${stats.trips} trips, ${stats.points} points generated`);
    Toast.success(`Generated ${stats.trips} trips with ${stats.points} points`);
  }
}

// Stop batch generation
function stopBatchGeneration() {
  shouldStop = true;
  log('info', 'Stopping...');
}

// Generate single trip
async function generateTrip(config) {
  return new Promise(async (resolve) => {
    try {
      // Get geofence centers
      const origin = getGeofenceCenter(config.originGeofence);
      const destination = getGeofenceCenter(config.destGeofence);
      
      // Get route from OpenRouteService
      const response = await fetch(
        `https://api.openrouteservice.org/v2/directions/driving-car?start=${origin.lng},${origin.lat}&end=${destination.lng},${destination.lat}`,
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
      const routeData = data.features[0];
      const coords = routeData.geometry.coordinates;
      const summary = routeData.properties.summary;
      
      const path = coords.map(c => ({ lat: c[1], lng: c[0] }));
      const totalDistance = summary.distance; // meters
      
      // Calculate travel time
      const travelTimeSeconds = (totalDistance / 1000) / config.avgSpeed * 3600;
      const totalPoints = Math.ceil(travelTimeSeconds / config.interval);
      
      // Generate points
      const points = [];
      let currentTime = new Date(config.startTime);
      let breakInserted = false;
      const breakPointIndex = config.breakTime > 0 ? 
        Math.floor(Math.random() * (totalPoints - 10)) + 5 : -1;
      
      for (let i = 0; i <= totalPoints; i++) {
        const progress = i / totalPoints;
        const distanceAlongRoute = progress * totalDistance;
        const position = getPositionAlongPath(path, distanceAlongRoute);
        
        const accuracy = config.minAccuracy + Math.random() * (config.maxAccuracy - config.minAccuracy);
        const offsetPosition = addRandomOffset(position, accuracy);
        
        const speed = i === 0 ? 0 : config.avgSpeed + (Math.random() - 0.5) * 10;
        const direction = i === 0 ? 0 : calculateDirection(
          points[points.length - 1],
          offsetPosition
        );
        
        const point = {
          device_timestamp: currentTime.toISOString(),
          received_timestamp: new Date(currentTime.getTime() + Math.random() * 1000).toISOString(),
          positioning_timestamp: currentTime.toISOString(),
          imei: parseInt(config.device.imei) || 0,
          gps_status: 'A',
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
          fw_version: config.device.fw_version || null,
          last_reset_reason: null,
          delete_flag: false,
          is_outlier: false,
          is_break: false
        };
        
        points.push(point);
        currentTime = new Date(currentTime.getTime() + config.interval * 1000);
        
        // Insert break
        if (config.breakTime > 0 && i === breakPointIndex && !breakInserted) {
          const breakIntervalSec = 60; // 1 minute interval during break
          const breakPoints = Math.ceil((config.breakTime * 60) / breakIntervalSec);
          const breakCenter = offsetPosition;
          
          for (let b = 0; b < breakPoints; b++) {
            const breakPosition = addRandomOffset(breakCenter, 10); // 10m radius
            
            points.push({
              device_timestamp: currentTime.toISOString(),
              received_timestamp: new Date(currentTime.getTime() + Math.random() * 1000).toISOString(),
              positioning_timestamp: currentTime.toISOString(),
              imei: parseInt(config.device.imei) || 0,
              gps_status: 'A',
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
              fw_version: config.device.fw_version || null,
              last_reset_reason: null,
              delete_flag: false,
              is_outlier: false,
              is_break: true
            });
            
            currentTime = new Date(currentTime.getTime() + breakIntervalSec * 1000); // 1 minute interval
          }
          breakInserted = true;
        }
      }
      
      // Add arrival stay points (15-60 min at destination geofence)
      const arrivalStayMinutes = 15 + Math.floor(Math.random() * 46); // 15-60 min
      const arrivalStayIntervalSec = 60; // 1 minute interval during arrival stay
      const arrivalStayPoints = Math.ceil((arrivalStayMinutes * 60) / arrivalStayIntervalSec);
      
      // Fixed 10m radius from geofence center for arrival stay
      const arrivalStayRadius = 10;
      
      for (let a = 0; a < arrivalStayPoints; a++) {
        const stayPosition = addRandomOffset(destination, arrivalStayRadius);
        const accuracy = config.minAccuracy + Math.random() * (config.maxAccuracy - config.minAccuracy);
        
        points.push({
          device_timestamp: currentTime.toISOString(),
          received_timestamp: new Date(currentTime.getTime() + Math.random() * 1000).toISOString(),
          positioning_timestamp: currentTime.toISOString(),
          imei: parseInt(config.device.imei) || 0,
          gps_status: 'A',
          gps_time: currentTime.getTime() / 1000,
          latitude: stayPosition.lat,
          longitude: stayPosition.lng,
          altitude: 10 + Math.random() * 50,
          speed: 0,
          direction: Math.random() * 360,
          authentication_status: null,
          base_info: null,
          hdop: config.minAccuracy / 5,
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
          fw_version: config.device.fw_version || null,
          last_reset_reason: null,
          delete_flag: false
        });
        
        currentTime = new Date(currentTime.getTime() + arrivalStayIntervalSec * 1000); // 1 minute interval
      }
      
      // Save trip
      const trip = {
        vehicle_id: config.vehicleId,
        imei: config.device.imei || 0,
        serial_no: config.deployment.serial_no || '',
        origin_lat: origin.lat,
        origin_lng: origin.lng,
        origin_name: config.originGeofence.geofence_name,
        destination_lat: destination.lat,
        destination_lng: destination.lng,
        destination_name: config.destGeofence.geofence_name,
        distance_meters: totalDistance,
        start_time: points[0].positioning_timestamp,
        end_time: points[points.length - 1].positioning_timestamp,
        point_count: points.length,
        settings: {
          interval: config.interval,
          avg_speed: config.avgSpeed,
          break_time: config.breakTime,
          min_accuracy: config.minAccuracy,
          max_accuracy: config.maxAccuracy,
          outlier_rate: config.outlierRate
        },
        created_at: new Date().toISOString()
      };
      
      const tripId = await Storage.add(STORAGE_KEYS.TRIPS, trip);
      
      // Save points (remove id and temp fields for auto-increment)
      const pointsToSave = points.map(p => {
        const point = { ...p, trip_id: tripId };
        delete point.id; // Let IndexedDB auto-generate
        delete point.is_outlier;
        delete point.is_break;
        return point;
      });
      
      await Storage.addBulk(STORAGE_KEYS.GNSS_POINTS, pointsToSave);
      
      // Get the end time from the last point
      const endTime = new Date(points[points.length - 1].positioning_timestamp);
      
      resolve({ success: true, pointCount: points.length, tripId, endTime });
      
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

// Helper functions
function getGeofenceCenter(geofence) {
  const geoJson = typeof geofence.geofence === 'string' ? 
    JSON.parse(geofence.geofence) : geofence.geofence;
  const coords = geoJson.coordinates[0];
  
  let lat = 0, lng = 0;
  coords.forEach(c => {
    lat += c[1];
    lng += c[0];
  });
  
  return { lat: lat / coords.length, lng: lng / coords.length };
}

// Calculate distance between two points (Haversine formula)
function haversineDistance(p1, p2) {
  const lat1 = (typeof p1.lat === 'function' ? p1.lat() : p1.lat) * Math.PI / 180;
  const lat2 = (typeof p2.lat === 'function' ? p2.lat() : p2.lat) * Math.PI / 180;
  const lng1 = (typeof p1.lng === 'function' ? p1.lng() : p1.lng) * Math.PI / 180;
  const lng2 = (typeof p2.lng === 'function' ? p2.lng() : p2.lng) * Math.PI / 180;
  
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return 6371000 * c; // Earth's radius in meters
}

// Interpolate between two points
function interpolatePosition(p1, p2, fraction) {
  const lat1 = typeof p1.lat === 'function' ? p1.lat() : p1.lat;
  const lng1 = typeof p1.lng === 'function' ? p1.lng() : p1.lng;
  const lat2 = typeof p2.lat === 'function' ? p2.lat() : p2.lat;
  const lng2 = typeof p2.lng === 'function' ? p2.lng() : p2.lng;
  
  return {
    lat: lat1 + (lat2 - lat1) * fraction,
    lng: lng1 + (lng2 - lng1) * fraction
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
  
  const lastPoint = path[path.length - 1];
  return {
    lat: typeof lastPoint.lat === 'function' ? lastPoint.lat() : lastPoint.lat,
    lng: typeof lastPoint.lng === 'function' ? lastPoint.lng() : lastPoint.lng
  };
}

function addRandomOffset(position, meters) {
  const lat = typeof position.lat === 'function' ? position.lat() : position.lat;
  const lng = typeof position.lng === 'function' ? position.lng() : position.lng;
  
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * meters;
  
  const latOffset = (distance * Math.cos(angle)) / 111320;
  const lngOffset = (distance * Math.sin(angle)) / (111320 * Math.cos(lat * Math.PI / 180));
  
  return {
    lat: lat + latOffset,
    lng: lng + lngOffset
  };
}

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

// UI helpers
function updateStats() {
  document.getElementById('statDays').textContent = stats.days;
  document.getElementById('statTrips').textContent = stats.trips;
  document.getElementById('statPoints').textContent = stats.points.toLocaleString();
  document.getElementById('statErrors').textContent = stats.errors;
}

function updateProgress(current, total) {
  const percent = Math.round((current / total) * 100);
  document.getElementById('progressBar').style.width = `${percent}%`;
  document.getElementById('progressBar').textContent = `${percent}%`;
  document.getElementById('progressText').textContent = `Processing trip ${current} of ${total}...`;
}

function log(type, message) {
  const container = document.getElementById('logContainer');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

