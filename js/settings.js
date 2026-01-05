/**
 * Settings page functionality
 */

let isOrsKeyVisible = false;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
});

// Load saved settings
async function loadSettings() {
  // Load OpenRouteService API Key
  const orsKey = await Settings.getOpenRouteServiceApiKey();
  if (orsKey) {
    document.getElementById('orsApiKey').value = orsKey;
    document.getElementById('orsApiKey').type = 'password';
    updateOrsKeyStatus(true, 'OpenRouteService API Key is configured');
  } else {
    updateOrsKeyStatus(false, 'OpenRouteService API Key is not set');
  }
}

// Save OpenRouteService API key
async function saveOrsKey(event) {
  event.preventDefault();
  
  const apiKey = document.getElementById('orsApiKey').value.trim();
  
  if (!apiKey) {
    Toast.error('Please enter an OpenRouteService API key');
    return;
  }
  
  await Settings.setOpenRouteServiceApiKey(apiKey);
  Toast.success('OpenRouteService API Key saved successfully');
  updateOrsKeyStatus(true, 'OpenRouteService API Key is configured');
}

// Toggle OpenRouteService key visibility
function toggleOrsKeyVisibility() {
  const input = document.getElementById('orsApiKey');
  const icon = document.getElementById('orsEyeIcon');
  
  isOrsKeyVisible = !isOrsKeyVisible;
  input.type = isOrsKeyVisible ? 'text' : 'password';
  
  if (isOrsKeyVisible) {
    icon.innerHTML = `
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    `;
  } else {
    icon.innerHTML = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    `;
  }
}

// Update OpenRouteService key status indicator
function updateOrsKeyStatus(isConfigured, message) {
  const statusDiv = document.getElementById('orsKeyStatus');
  statusDiv.style.display = 'flex';
  statusDiv.style.alignItems = 'center';
  statusDiv.style.gap = '8px';
  statusDiv.style.padding = '12px';
  statusDiv.style.borderRadius = '6px';
  
  if (isConfigured) {
    statusDiv.style.backgroundColor = 'rgba(46, 160, 67, 0.15)';
    statusDiv.style.color = 'var(--text-success)';
    statusDiv.innerHTML = `
      <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
        <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
      </svg>
      <span>${message}</span>
    `;
  } else {
    statusDiv.style.backgroundColor = 'rgba(248, 81, 73, 0.15)';
    statusDiv.style.color = 'var(--text-danger)';
    statusDiv.innerHTML = `
      <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
        <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm9-3a1 1 0 11-2 0 1 1 0 012 0zM8 7.5a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0v-3A.75.75 0 018 7.5z"/>
      </svg>
      <span>${message}</span>
    `;
  }
}

// Export settings
async function exportSettings() {
  const orsKey = await Settings.getOpenRouteServiceApiKey();
  
  const data = [
    { key: 'openrouteservice_api_key', value: orsKey || '' }
  ];
  
  const timestamp = new Date().toISOString().slice(0, 10);
  CSV.export(data, ['key', 'value'], `settings_${timestamp}.csv`);
  Toast.success('Settings exported successfully');
}

// Import settings
async function importSettings(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const data = await CSV.import(file);
    
    for (const row of data) {
      if (row.key === 'openrouteservice_api_key') {
        await Settings.setOpenRouteServiceApiKey(row.value);
      }
    }
    
    await loadSettings();
    Toast.success('Settings imported successfully');
  } catch (error) {
    Toast.error('Failed to import settings: ' + error.message);
  }
  
  event.target.value = '';
}

// Clear all trips data
async function clearTripsData() {
  const tripCount = await Storage.count(STORAGE_KEYS.TRIPS);
  const pointCount = await Storage.count(STORAGE_KEYS.GNSS_POINTS);
  
  if (tripCount === 0 && pointCount === 0) {
    Toast.info('No trip data to clear');
    return;
  }
  
  if (confirm(`Are you sure you want to delete all trip data?\n\nTrips: ${tripCount}\nGNSS Points: ${pointCount}\n\nThis action cannot be undone.`)) {
    await Storage.clear(STORAGE_KEYS.TRIPS);
    await Storage.clear(STORAGE_KEYS.GNSS_POINTS);
    Toast.success('All trip data cleared');
  }
}
