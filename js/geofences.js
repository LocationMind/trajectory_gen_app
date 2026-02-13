/**
 * Geofences management with Leaflet map (IndexedDB version)
 */

const STORAGE_KEY = STORAGE_KEYS.GEOFENCES;
const CSV_COLUMNS = ['id', 'place_id', 'geofence_number', 'geofence_name', 'type', 'geofence', 'version_number', 'custom_geofence_flag'];

const GEOFENCE_TYPES = {
  0: 'Standard',
  1: 'Loading Zone',
  2: 'Unloading Zone',
  3: 'Restricted Area',
  4: 'Parking Area'
};

const TYPE_COLORS = {
  0: '#1f6feb',
  1: '#238636',
  2: '#a371f7',
  3: '#da3633',
  4: '#d29922'
};

let map;
let drawnItems;
let drawControl;
let currentDrawnLayer = null;
let geofenceLayers = {};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await Storage.init();
  initMap();
  await loadData();
});

// Initialize Leaflet map
function initMap() {
  // Create map centered on Tokyo
  map = L.map('map').setView([35.6762, 139.6503], 10);

  // Add dark theme tile layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  // Initialize feature group for drawn items
  drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  // Initialize draw control
  drawControl = new L.Control.Draw({
    draw: {
      polygon: {
        allowIntersection: false,
        drawError: {
          color: '#da3633',
          message: '<strong>Error:</strong> Polygon edges cannot cross!'
        },
        shapeOptions: {
          color: '#1f6feb',
          fillColor: '#1f6feb',
          fillOpacity: 0.3
        }
      },
      rectangle: {
        shapeOptions: {
          color: '#1f6feb',
          fillColor: '#1f6feb',
          fillOpacity: 0.3
        }
      },
      circle: false,
      circlemarker: false,
      marker: false,
      polyline: false
    },
    edit: {
      featureGroup: drawnItems,
      remove: true
    }
  });
  map.addControl(drawControl);

  // Handle draw events
  map.on(L.Draw.Event.CREATED, function (e) {
    const layer = e.layer;

    // Remove previous drawn layer if exists
    if (currentDrawnLayer) {
      drawnItems.removeLayer(currentDrawnLayer);
    }

    currentDrawnLayer = layer;
    drawnItems.addLayer(layer);

    // Convert to GeoJSON and update form
    const geojson = layer.toGeoJSON();
    document.getElementById('geofenceData').value = JSON.stringify(geojson.geometry);
    document.getElementById('geofenceDisplay').value = JSON.stringify(geojson.geometry, null, 2);

    // Open add modal
    openAddModal(true);
  });

  map.on(L.Draw.Event.EDITED, function (e) {
    const layers = e.layers;
    layers.eachLayer(function (layer) {
      if (layer === currentDrawnLayer) {
        const geojson = layer.toGeoJSON();
        document.getElementById('geofenceData').value = JSON.stringify(geojson.geometry);
        document.getElementById('geofenceDisplay').value = JSON.stringify(geojson.geometry, null, 2);
      }
    });
  });

  map.on(L.Draw.Event.DELETED, function (e) {
    currentDrawnLayer = null;
    document.getElementById('geofenceData').value = '';
    document.getElementById('geofenceDisplay').value = '';
  });
}

// Load and render data
async function loadData() {
  const data = await Storage.get(STORAGE_KEY);
  renderTable(data);
  renderGeofenceList(data);
  renderGeofencesOnMap(data);
}

// Render geofences on map
function renderGeofencesOnMap(data) {
  // Clear existing layers
  Object.values(geofenceLayers).forEach(layer => {
    map.removeLayer(layer);
  });
  geofenceLayers = {};

  data.forEach(item => {
    try {
      let geometry = item.geofence;
      if (typeof geometry === 'string') {
        geometry = JSON.parse(geometry);
      }

      if (geometry && geometry.coordinates) {
        const color = TYPE_COLORS[item.type] || TYPE_COLORS[0];

        const layer = L.geoJSON(geometry, {
          style: {
            color: color,
            fillColor: color,
            fillOpacity: 0.3,
            weight: 2
          }
        });

        layer.bindPopup(`
          <div style="min-width: 150px;">
            <strong>${item.geofence_name}</strong><br>
            <span style="color: #8b949e;">Type: ${GEOFENCE_TYPES[item.type] || 'Standard'}</span><br>
            <span style="color: #8b949e;">Place ID: ${item.place_id}</span>
          </div>
        `);

        layer.on('click', () => {
          highlightGeofence(item.id);
        });

        layer.addTo(map);
        geofenceLayers[item.id] = layer;
      }
    } catch (e) {
      console.error('Error parsing geofence geometry:', e);
    }
  });
}

// Render geofence list in sidebar
function renderGeofenceList(data) {
  const listContainer = document.getElementById('geofenceList');

  if (data.length === 0) {
    listContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 16px;">No geofences yet</p>';
    return;
  }

  listContainer.innerHTML = data.map(item => `
    <div class="geofence-item" data-id="${item.id}" onclick="focusGeofence(${item.id})">
      <div>
        <div class="geofence-item-name">${item.geofence_name}</div>
        <div class="geofence-item-type">${GEOFENCE_TYPES[item.type] || 'Standard'}</div>
      </div>
      <span class="badge" style="background-color: ${TYPE_COLORS[item.type] || TYPE_COLORS[0]}20; color: ${TYPE_COLORS[item.type] || TYPE_COLORS[0]};">
        ${item.id}
      </span>
    </div>
  `).join('');
}

// Focus on a geofence on the map
function focusGeofence(id) {
  const layer = geofenceLayers[id];
  if (layer) {
    map.fitBounds(layer.getBounds(), { padding: [50, 50] });
    layer.openPopup();
    highlightGeofence(id);
  }
}

// Highlight geofence in list
function highlightGeofence(id) {
  document.querySelectorAll('.geofence-item').forEach(item => {
    item.classList.remove('selected');
    if (item.dataset.id == id) {
      item.classList.add('selected');
    }
  });
}

// Render table
function renderTable(data) {
  const tableBody = document.getElementById('tableBody');

  Table.render(tableBody, data, (item) => `
    <tr>
      <td>${item.id}</td>
      <td>${item.geofence_name || '-'}</td>
      <td>${item.place_id || '-'}</td>
      <td>${item.geofence_number || '-'}</td>
      <td>
        <span class="badge" style="background-color: ${TYPE_COLORS[item.type] || TYPE_COLORS[0]}20; color: ${TYPE_COLORS[item.type] || TYPE_COLORS[0]};">
          ${GEOFENCE_TYPES[item.type] || 'Standard'}
        </span>
      </td>
      <td>
        ${item.custom_geofence_flag === true || item.custom_geofence_flag === 'true'
          ? '<span class="badge badge-green">Yes</span>'
          : '<span class="badge badge-gray">No</span>'}
      </td>
      <td>${item.version_number || '-'}</td>
      <td class="actions">
        <button class="btn btn-secondary btn-sm" onclick="focusGeofence(${item.id})">View</button>
        <button class="btn btn-secondary btn-sm" onclick="editRecord(${item.id})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRecord(${item.id})">Delete</button>
      </td>
    </tr>
  `);
}

// Open add modal
function openAddModal(keepGeometry = false) {
  document.getElementById('modalTitle').textContent = 'Add Geofence';

  if (!keepGeometry) {
    document.getElementById('dataForm').reset();
    document.getElementById('recordId').value = '';
    document.getElementById('geofenceData').value = '';
    document.getElementById('geofenceDisplay').value = '';

    // Clear drawn layer
    if (currentDrawnLayer) {
      drawnItems.removeLayer(currentDrawnLayer);
      currentDrawnLayer = null;
    }
  }

  Modal.open('formModal');
}

// Edit record
async function editRecord(id) {
  const record = await Storage.getById(STORAGE_KEY, id);

  if (record) {
    document.getElementById('modalTitle').textContent = 'Edit Geofence';

    // Clear previous drawn layer
    if (currentDrawnLayer) {
      drawnItems.removeLayer(currentDrawnLayer);
      currentDrawnLayer = null;
    }

    Form.setData(document.getElementById('dataForm'), record);

    // Set geometry fields
    let geometryStr = record.geofence;
    if (typeof geometryStr === 'object') {
      geometryStr = JSON.stringify(record.geofence);
    }
    document.getElementById('geofenceData').value = geometryStr;
    document.getElementById('geofenceDisplay').value = JSON.stringify(JSON.parse(geometryStr), null, 2);

    Modal.open('formModal');
  }
}

// Save record (add or update)
async function saveRecord(event) {
  event.preventDefault();

  const form = event.target;
  const formData = Form.getData(form);

  // Validate geometry
  const geofenceData = document.getElementById('geofenceData').value;
  if (!geofenceData) {
    Toast.error('Please draw a geofence on the map or enter GeoJSON geometry');
    return;
  }

  // Try to parse and validate geometry
  try {
    const geometry = JSON.parse(geofenceData);
    formData.geofence = JSON.stringify(geometry);
  } catch (e) {
    Toast.error('Invalid GeoJSON geometry');
    return;
  }

  // Convert place_id to number (bigint in DB)
  if (formData.place_id) {
    formData.place_id = parseInt(formData.place_id);
  }
  // Convert geofence_number to number (bigint in DB)
  if (formData.geofence_number) {
    formData.geofence_number = parseInt(formData.geofence_number);
  }
  // Convert type to integer
  if (formData.type !== undefined) {
    formData.type = parseInt(formData.type);
  }
  // Handle checkbox value for custom_geofence_flag
  formData.custom_geofence_flag = form.elements['custom_geofence_flag'].checked;

  if (formData.id) {
    // Update existing
    formData.id = parseInt(formData.id);
    await Storage.update(STORAGE_KEY, formData);
    Toast.success('Geofence updated successfully');
  } else {
    // Add new
    delete formData.id; // Let IndexedDB auto-generate
    await Storage.add(STORAGE_KEY, formData);
    Toast.success('Geofence added successfully');
  }

  Modal.close('formModal');

  // Clear drawn layer
  if (currentDrawnLayer) {
    drawnItems.removeLayer(currentDrawnLayer);
    currentDrawnLayer = null;
  }

  await loadData();
}

// Delete record
async function deleteRecord(id) {
  if (confirm('Are you sure you want to delete this geofence?')) {
    await Storage.delete(STORAGE_KEY, id);
    Toast.success('Geofence deleted successfully');
    await loadData();
  }
}

// Export to CSV
async function exportCSV() {
  const data = await Storage.get(STORAGE_KEY);
  if (data.length === 0) {
    Toast.error('No data to export');
    return;
  }
  const timestamp = new Date().toISOString().slice(0, 10);
  CSV.export(data, CSV_COLUMNS, `geofences_${timestamp}.csv`);
  Toast.success('CSV exported successfully');
}

// Clear all data in this store
async function clearData() {
  const count = await Storage.count(STORAGE_KEY);
  if (count === 0) {
    Toast.info('No data to clear');
    return;
  }
  if (confirm(`Are you sure you want to delete all ${count} geofence records? This action cannot be undone.`)) {
    await Storage.clear(STORAGE_KEY);
    Toast.success('All geofences cleared');
    await loadData();
  }
}

// Import from CSV
async function importCSV(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const importedData = await CSV.import(file);

    if (importedData.length === 0) {
      Toast.error('No valid data found in CSV');
      return;
    }

    let addedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const item of importedData) {
      // Ensure required fields
      if (!item.geofence_name || !item.place_id || !item.geofence_number) {
        errorCount++;
        continue;
      }

      // Convert place_id to number (bigint in DB)
      if (item.place_id) {
        item.place_id = parseInt(item.place_id);
      }
      // Convert geofence_number to number (bigint in DB)
      if (item.geofence_number) {
        item.geofence_number = parseInt(item.geofence_number);
      }
      // Convert type to integer
      if (item.type !== undefined && item.type !== '') {
        item.type = parseInt(item.type);
      }
      // Convert custom_geofence_flag to boolean
      if (typeof item.custom_geofence_flag === 'string') {
        item.custom_geofence_flag = item.custom_geofence_flag.toLowerCase() === 'true';
      } else if (item.custom_geofence_flag === undefined) {
        item.custom_geofence_flag = true; // Default to true
      }

      // Validate and normalize geometry
      if (item.geofence) {
        try {
          // Try to parse if it's a string
          if (typeof item.geofence === 'string') {
            JSON.parse(item.geofence);
          }
        } catch (e) {
          console.error('Invalid geometry for:', item.geofence_name);
          errorCount++;
          continue;
        }
      } else {
        errorCount++;
        continue;
      }

      if (item.id) {
        item.id = parseInt(item.id);
        const existing = await Storage.getById(STORAGE_KEY, item.id);
        if (existing) {
          await Storage.update(STORAGE_KEY, { ...existing, ...item });
          updatedCount++;
        } else {
          await Storage.add(STORAGE_KEY, item);
          addedCount++;
        }
      } else {
        delete item.id;
        await Storage.add(STORAGE_KEY, item);
        addedCount++;
      }
    }

    await loadData();

    let message = `Imported: ${addedCount} added, ${updatedCount} updated`;
    if (errorCount > 0) {
      message += `, ${errorCount} skipped (invalid)`;
    }
    Toast.success(message);
  } catch (error) {
    Toast.error('Failed to import CSV: ' + error.message);
  }

  // Reset file input
  event.target.value = '';
}

// Allow manual GeoJSON input
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const display = document.getElementById('geofenceDisplay');
    if (display) {
      display.removeAttribute('readonly');

      display.addEventListener('blur', function() {
        const value = this.value.trim();
        if (value) {
          try {
            const geometry = JSON.parse(value);
            document.getElementById('geofenceData').value = JSON.stringify(geometry);
            this.value = JSON.stringify(geometry, null, 2);

            // Update map preview
            if (currentDrawnLayer) {
              drawnItems.removeLayer(currentDrawnLayer);
            }

            currentDrawnLayer = L.geoJSON(geometry, {
              style: {
                color: '#1f6feb',
                fillColor: '#1f6feb',
                fillOpacity: 0.3
              }
            });
            drawnItems.addLayer(currentDrawnLayer);
            map.fitBounds(currentDrawnLayer.getBounds(), { padding: [50, 50] });

          } catch (e) {
            // Invalid JSON, don't update
            console.error('Invalid GeoJSON:', e);
          }
        }
      });
    }
  }, 100);
});
