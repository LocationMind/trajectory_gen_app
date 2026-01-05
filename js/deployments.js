/**
 * Device Deployments management (IndexedDB version)
 */

const STORAGE_KEY = STORAGE_KEYS.DEPLOYMENTS;
const CSV_COLUMNS = ['id', 'serial_no', 'vehicle_id', 'description', 'deploy_start_datetime', 'deploy_end_datetime', 'device_status'];

const DEVICE_STATUS_LABELS = {
  0: 'Unknown',
  1: 'Active',
  2: 'Inactive',
  3: 'Maintenance'
};

let devicesCache = [];
let vehiclesCache = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await Storage.init();
  await loadDevices();
  await loadVehicles();
  await loadData();
  checkMasterData();
});

// Check if master data exists
function checkMasterData() {
  const infoAlert = document.getElementById('infoAlert');
  const infoMessage = document.getElementById('infoMessage');

  if (devicesCache.length === 0 || vehiclesCache.length === 0) {
    infoAlert.style.display = 'flex';
    const missing = [];
    if (devicesCache.length === 0) missing.push('devices');
    if (vehiclesCache.length === 0) missing.push('vehicles');
    infoMessage.textContent = `Please add ${missing.join(' and ')} first before creating deployments.`;
  } else {
    infoAlert.style.display = 'none';
  }
}

// Load devices for dropdown
async function loadDevices() {
  devicesCache = await Storage.get(STORAGE_KEYS.DEVICES);
  const select = document.getElementById('deviceSelect');

  // Clear existing options except first
  select.innerHTML = '<option value="">Select device...</option>';

  devicesCache.forEach(device => {
    const option = document.createElement('option');
    option.value = device.serial_no;
    option.textContent = `${device.serial_no} (IMEI: ${device.imei})`;
    select.appendChild(option);
  });
}

// Load vehicles for dropdown
async function loadVehicles() {
  vehiclesCache = await Storage.get(STORAGE_KEYS.VEHICLES);
  const select = document.getElementById('vehicleSelect');

  // Clear existing options except first
  select.innerHTML = '<option value="">Select vehicle...</option>';

  vehiclesCache.forEach(vehicle => {
    const option = document.createElement('option');
    option.value = vehicle.vehicle_id;
    option.textContent = `${vehicle.vehicle_number} - ${vehicle.vehicle_name || vehicle.model}`;
    select.appendChild(option);
  });
}

// Get device info by serial no
function getDeviceInfo(serialNo) {
  const device = devicesCache.find(d => d.serial_no === serialNo);
  return device ? device.serial_no : serialNo || '-';
}

// Get vehicle info by ID
function getVehicleInfo(vehicleId) {
  const vehicle = vehiclesCache.find(v => v.vehicle_id == vehicleId);
  return vehicle ? `${vehicle.vehicle_number} (${vehicle.vehicle_name || vehicle.model})` : vehicleId || '-';
}

// Check if deployment is active
function isActive(deployment) {
  const now = new Date();
  const start = new Date(deployment.deploy_start_datetime);
  const end = deployment.deploy_end_datetime ? new Date(deployment.deploy_end_datetime) : null;

  return start <= now && (!end || end >= now);
}

// Load and render data
async function loadData() {
  const data = await Storage.get(STORAGE_KEY);
  renderTable(data);
}

// Render table
function renderTable(data) {
  const tableBody = document.getElementById('tableBody');

  Table.render(tableBody, data, (item) => {
    const active = isActive(item);
    const deviceStatusLabel = item.device_status !== undefined && item.device_status !== null 
      ? (DEVICE_STATUS_LABELS[item.device_status] || item.device_status)
      : '-';
    return `
      <tr>
        <td>${item.id}</td>
        <td><code style="background: var(--bg-surface-active); padding: 2px 6px; border-radius: 4px;">${getDeviceInfo(item.serial_no)}</code></td>
        <td>${getVehicleInfo(item.vehicle_id)}</td>
        <td>${item.description ? (item.description.length > 40 ? item.description.substring(0, 40) + '...' : item.description) : '-'}</td>
        <td>${DateUtil.toDisplayFormat(item.deploy_start_datetime)}</td>
        <td>${item.deploy_end_datetime ? DateUtil.toDisplayFormat(item.deploy_end_datetime) : '-'}</td>
        <td><span class="badge badge-blue">${deviceStatusLabel}</span></td>
        <td>
          ${active
            ? '<span class="badge badge-green">Active</span>'
            : '<span class="badge badge-gray">Inactive</span>'}
        </td>
        <td class="actions">
          <button class="btn btn-secondary btn-sm" onclick="editRecord(${item.id})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteRecord(${item.id})">Delete</button>
        </td>
      </tr>
    `;
  });
}

// Open add modal
function openAddModal() {
  document.getElementById('modalTitle').textContent = 'Add Deployment';
  document.getElementById('dataForm').reset();
  document.getElementById('recordId').value = '';

  // Set default start time to now
  const startInput = document.querySelector('input[name="deploy_start_datetime"]');
  startInput.value = DateUtil.now();

  Modal.open('formModal');
}

// Edit record
async function editRecord(id) {
  const record = await Storage.getById(STORAGE_KEY, id);

  if (record) {
    document.getElementById('modalTitle').textContent = 'Edit Deployment';

    // Format dates for datetime-local input
    const formRecord = { ...record };
    if (formRecord.deploy_start_datetime) {
      formRecord.deploy_start_datetime = DateUtil.toInputFormat(formRecord.deploy_start_datetime);
    }
    if (formRecord.deploy_end_datetime) {
      formRecord.deploy_end_datetime = DateUtil.toInputFormat(formRecord.deploy_end_datetime);
    }

    Form.setData(document.getElementById('dataForm'), formRecord);
    Modal.open('formModal');
  }
}

// Save record (add or update)
async function saveRecord(event) {
  event.preventDefault();

  const form = event.target;
  const formData = Form.getData(form);

  if (formData.id) {
    // Update existing
    formData.id = parseInt(formData.id);
    await Storage.update(STORAGE_KEY, formData);
    Toast.success('Deployment updated successfully');
  } else {
    // Add new
    delete formData.id; // Let IndexedDB auto-generate
    await Storage.add(STORAGE_KEY, formData);
    Toast.success('Deployment added successfully');
  }

  Modal.close('formModal');
  await loadData();
}

// Delete record
async function deleteRecord(id) {
  if (confirm('Are you sure you want to delete this deployment?')) {
    await Storage.delete(STORAGE_KEY, id);
    Toast.success('Deployment deleted successfully');
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
  CSV.export(data, CSV_COLUMNS, `deployments_${timestamp}.csv`);
  Toast.success('CSV exported successfully');
}

// Clear all data in this store
async function clearData() {
  const count = await Storage.count(STORAGE_KEY);
  if (count === 0) {
    Toast.info('No data to clear');
    return;
  }
  if (confirm(`Are you sure you want to delete all ${count} deployment records? This action cannot be undone.`)) {
    await Storage.clear(STORAGE_KEY);
    Toast.success('All deployments cleared');
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

    for (const item of importedData) {
      // Ensure required fields
      if (!item.serial_no || !item.vehicle_id || !item.deploy_start_datetime) continue;

      // Convert vehicle_id to number (bigint in DB, but JS number is fine)
      if (item.vehicle_id) {
        item.vehicle_id = parseInt(item.vehicle_id);
      }
      // Convert device_status to integer
      if (item.device_status !== undefined && item.device_status !== '') {
        item.device_status = parseInt(item.device_status);
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
    Toast.success(`Imported: ${addedCount} added, ${updatedCount} updated`);
  } catch (error) {
    Toast.error('Failed to import CSV: ' + error.message);
  }

  // Reset file input
  event.target.value = '';
}
