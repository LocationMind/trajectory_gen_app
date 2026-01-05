/**
 * Screenshot Capture Script with Sample Data
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'images');
const OPENROUTESERVICE_API_KEY = ''; // Add your ORS API key here for screenshots

const sampleData = {
  offices: [
    { office_id: 1, office_name: 'Tokyo Head Office', address: '1-1-1 Marunouchi, Chiyoda-ku, Tokyo', phone: '03-1234-5678', email: 'tokyo@example.com', version_number: 1 },
    { office_id: 2, office_name: 'Osaka Branch', address: '2-2-2 Umeda, Kita-ku, Osaka', phone: '06-1234-5678', email: 'osaka@example.com', version_number: 1 }
  ],
  devices: [
    { device_id: 1, serial_no: 'DEV-001', imei: '123456789012345', device_model: 'GPS Tracker Pro', status: 'active', office_id: 1, version_number: 1 },
    { device_id: 2, serial_no: 'DEV-002', imei: '123456789012346', device_model: 'GPS Tracker Lite', status: 'active', office_id: 2, version_number: 1 }
  ],
  vehicles: [
    { vehicle_id: 1, vehicle_name: 'Delivery Truck A', plate_no: 'Tokyo 100 A 1234', vehicle_type: 'truck', capacity: 2000, office_id: 1, version_number: 1 },
    { vehicle_id: 2, vehicle_name: 'Cargo Van B', plate_no: 'Osaka 200 B 5678', vehicle_type: 'van', capacity: 1000, office_id: 2, version_number: 1 }
  ],
  deployments: [
    { deploy_id: 1, device_id: 1, vehicle_id: 1, deploy_date: '2024-01-01', status: 'active', version_number: 1 },
    { deploy_id: 2, device_id: 2, vehicle_id: 2, deploy_date: '2024-02-01', status: 'active', version_number: 1 }
  ],
  geofences: [
    { id: 1, place_id: 'GF001', geofence_name: 'Tokyo Station', type: 1, description: 'Tokyo Station area', geofence: '{"type":"Polygon","coordinates":[[[139.7671,35.6812],[139.7691,35.6812],[139.7691,35.6832],[139.7671,35.6832],[139.7671,35.6812]]]}', version_number: 1 },
    { id: 2, place_id: 'GF002', geofence_name: 'Shibuya Hub', type: 2, description: 'Shibuya warehouse', geofence: '{"type":"Polygon","coordinates":[[[139.7016,35.6580],[139.7036,35.6580],[139.7036,35.6600],[139.7016,35.6600],[139.7016,35.6580]]]}', version_number: 1 }
  ],
  trips: [
    { id: 1, vehicle_id: 1, imei: '123456789012345', serial_no: 'DEV-001', origin_lat: 35.6812, origin_lng: 139.7671, origin_name: 'Tokyo Station', destination_lat: 35.6580, destination_lng: 139.7016, destination_name: 'Shibuya Hub', distance_meters: 8500, start_time: '2024-12-01T09:00:00Z', end_time: '2024-12-01T09:45:00Z', point_count: 270, settings: { interval: 10, avg_speed: 40 }, created_at: '2024-12-01T09:00:00Z' },
    { id: 2, vehicle_id: 1, imei: '123456789012345', serial_no: 'DEV-001', origin_lat: 35.6580, origin_lng: 139.7016, origin_name: 'Shibuya Hub', destination_lat: 35.6812, destination_lng: 139.7671, destination_name: 'Tokyo Station', distance_meters: 8500, start_time: '2024-12-01T11:00:00Z', end_time: '2024-12-01T11:45:00Z', point_count: 270, settings: { interval: 10, avg_speed: 40 }, created_at: '2024-12-01T11:00:00Z' },
    { id: 3, vehicle_id: 1, imei: '123456789012345', serial_no: 'DEV-001', origin_lat: 35.6812, origin_lng: 139.7671, origin_name: 'Tokyo Station', destination_lat: 35.6580, destination_lng: 139.7016, destination_name: 'Shibuya Hub', distance_meters: 8500, start_time: '2024-12-02T08:00:00Z', end_time: '2024-12-02T08:45:00Z', point_count: 270, settings: { interval: 10, avg_speed: 40 }, created_at: '2024-12-02T08:00:00Z' },
    { id: 4, vehicle_id: 1, imei: '123456789012345', serial_no: 'DEV-001', origin_lat: 35.6580, origin_lng: 139.7016, origin_name: 'Shibuya Hub', destination_lat: 35.6812, destination_lng: 139.7671, destination_name: 'Tokyo Station', distance_meters: 8500, start_time: '2024-12-02T10:00:00Z', end_time: '2024-12-02T10:45:00Z', point_count: 270, settings: { interval: 10, avg_speed: 40 }, created_at: '2024-12-02T10:00:00Z' },
    { id: 5, vehicle_id: 1, imei: '123456789012345', serial_no: 'DEV-001', origin_lat: 35.6812, origin_lng: 139.7671, origin_name: 'Tokyo Station', destination_lat: 35.6580, destination_lng: 139.7016, destination_name: 'Shibuya Hub', distance_meters: 8500, start_time: '2024-12-03T09:00:00Z', end_time: '2024-12-03T09:45:00Z', point_count: 270, settings: { interval: 10, avg_speed: 40 }, created_at: '2024-12-03T09:00:00Z' },
    { id: 6, vehicle_id: 1, imei: '123456789012345', serial_no: 'DEV-001', origin_lat: 35.6580, origin_lng: 139.7016, origin_name: 'Shibuya Hub', destination_lat: 35.6812, destination_lng: 139.7671, destination_name: 'Tokyo Station', distance_meters: 8500, start_time: '2024-12-03T14:00:00Z', end_time: '2024-12-03T14:45:00Z', point_count: 270, settings: { interval: 10, avg_speed: 40 }, created_at: '2024-12-03T14:00:00Z' }
  ]
};

// Generate simple GNSS points
function generatePoints() {
  const points = [];
  sampleData.trips.forEach(trip => {
    for (let i = 0; i < 50; i++) {
      const progress = i / 50;
      points.push({
        trip_id: trip.id,
        device_timestamp: new Date(new Date(trip.start_time).getTime() + i * 10000).toISOString(),
        received_timestamp: new Date(new Date(trip.start_time).getTime() + i * 10000).toISOString(),
        positioning_timestamp: new Date(new Date(trip.start_time).getTime() + i * 10000).toISOString(),
        imei: trip.imei,
        gps_status: 'VALID',
        gps_time: new Date(trip.start_time).getTime() / 1000 + i * 10,
        latitude: trip.origin_lat + (trip.destination_lat - trip.origin_lat) * progress + (Math.random() - 0.5) * 0.001,
        longitude: trip.origin_lng + (trip.destination_lng - trip.origin_lng) * progress + (Math.random() - 0.5) * 0.001,
        altitude: 20, speed: 40, direction: 90, hdop: 1.5, delete_flag: false
      });
    }
  });
  return points;
}

const screens = [
  { name: 'dashboard', url: '/', filename: 'screenshot-dashboard.png', delay: 1500 },
  { name: 'offices', url: '/offices.html', filename: 'screenshot-offices.png', delay: 1500 },
  { name: 'devices', url: '/devices.html', filename: 'screenshot-devices.png', delay: 1500 },
  { name: 'vehicles', url: '/vehicles.html', filename: 'screenshot-vehicles.png', delay: 1500 },
  { name: 'deployments', url: '/deployments.html', filename: 'screenshot-deployments.png', delay: 1500 },
  { name: 'geofences', url: '/geofences.html', filename: 'screenshot-geofences.png', delay: 4000 },
  { name: 'settings', url: '/settings.html', filename: 'screenshot-settings.png', delay: 1500 },
  { name: 'trajectory', url: '/trajectory.html', filename: 'screenshot-trajectory.png', delay: 4000 },
  { name: 'trajectory-batch', url: '/trajectory_batch.html', filename: 'screenshot-trajectory-batch.png', delay: 3000 },
  { name: 'trips', url: '/trips.html', filename: 'screenshot-trips.png', delay: 4000, selectTrip: true }
];

async function run() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  console.log('🚀 Starting capture...\n');
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    protocolTimeout: 60000
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });

  // Capture API key required screen first
  console.log('📸 Capturing API Key Required screen...');
  await page.goto(`${BASE_URL}/trajectory.html`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'screenshot-api-key-required.png') });
  console.log('   ✅ screenshot-api-key-required.png\n');

  // Initialize data
  console.log('📦 Initializing sample data...');
  await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'networkidle2' });
  
  const points = generatePoints();
  
  await page.evaluate(async (data, pts, apiKey) => {
    // Delete old DB and create fresh
    await new Promise(resolve => {
      const del = indexedDB.deleteDatabase('TrajectoryGenDB');
      del.onsuccess = del.onerror = () => resolve();
    });
    
    await new Promise(resolve => {
      const req = indexedDB.open('TrajectoryGenDB', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        db.createObjectStore('offices', { keyPath: 'office_id' });
        db.createObjectStore('devices', { keyPath: 'device_id' });
        db.createObjectStore('vehicles', { keyPath: 'vehicle_id' });
        db.createObjectStore('deployments', { keyPath: 'deploy_id' });
        db.createObjectStore('geofences', { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'key' });
        const trips = db.createObjectStore('trips', { keyPath: 'id' });
        trips.createIndex('vehicle_id', 'vehicle_id');
        const gnss = db.createObjectStore('gnss_points', { keyPath: 'id', autoIncrement: true });
        gnss.createIndex('trip_id', 'trip_id');
      };
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(['offices','devices','vehicles','deployments','geofences','settings','trips','gnss_points'], 'readwrite');
        data.offices.forEach(i => tx.objectStore('offices').add(i));
        data.devices.forEach(i => tx.objectStore('devices').add(i));
        data.vehicles.forEach(i => tx.objectStore('vehicles').add(i));
        data.deployments.forEach(i => tx.objectStore('deployments').add(i));
        data.geofences.forEach(i => tx.objectStore('geofences').add(i));
        data.trips.forEach(i => tx.objectStore('trips').add(i));
        pts.forEach(i => tx.objectStore('gnss_points').add(i));
        tx.objectStore('settings').add({ key: 'openrouteservice_api_key', value: apiKey });
        tx.oncomplete = () => resolve();
      };
    });
  }, sampleData, points, OPENROUTESERVICE_API_KEY);
  
  console.log('   ✅ Data initialized\n');

  // Capture screens
  console.log('📸 Capturing screenshots...\n');
  
  for (const screen of screens) {
    try {
      console.log(`   ${screen.name}...`);
      await page.goto(`${BASE_URL}${screen.url}`, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, screen.delay));
      
      if (screen.selectTrip) {
        try {
          await page.select('#vehicleFilter', '1');
          await new Promise(r => setTimeout(r, 1000));
          await page.click('.trip-item');
          await new Promise(r => setTimeout(r, 2000));
        } catch (e) {}
      }
      
      await page.screenshot({ path: path.join(OUTPUT_DIR, screen.filename) });
      console.log(`   ✅ ${screen.filename}`);
    } catch (e) {
      console.log(`   ❌ ${screen.name}: ${e.message}`);
    }
  }

  await browser.close();
  console.log('\n✨ Done!');
}

run().catch(console.error);
