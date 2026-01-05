/**
 * Vehicles management (IndexedDB version)
 */

const STORAGE_KEY = STORAGE_KEYS.VEHICLES;
const CSV_COLUMNS = ['vehicle_id', 'vehicle_name', 'vehicle_number', 'office_id', 'garage', 'calc_method', 'model', 'model_number', 'model_description', 'fuel_code'];

const FUEL_TYPES = {
  1: 'Gasoline',
  2: 'Diesel',
  3: 'LPG',
  4: 'CNG',
  5: 'Electric',
  6: 'Hybrid'
};

let officesCache = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await Storage.init();
  await loadOffices();
  await loadData();
});

// Load offices for dropdown
async function loadOffices() {
  officesCache = await Storage.get(STORAGE_KEYS.OFFICES);
  const select = document.getElementById('officeSelect');

  // Clear existing options except first
  select.innerHTML = '<option value="">Select office...</option>';

  officesCache.forEach(office => {
    const option = document.createElement('option');
    option.value = office.id;
    option.textContent = office.office_name;
    select.appendChild(option);
  });
}

// Get office name by ID
function getOfficeName(officeId) {
  const office = officesCache.find(o => o.id == officeId);
  return office ? office.office_name : '-';
}

// Load and render data
async function loadData() {
  const data = await Storage.get(STORAGE_KEY);
  renderTable(data);
}

// Render table
function renderTable(data) {
  const tableBody = document.getElementById('tableBody');

  Table.render(tableBody, data, (item) => `
    <tr>
      <td>${item.vehicle_id}</td>
      <td>${item.vehicle_name || '-'}</td>
      <td><code style="background: var(--bg-surface-active); padding: 2px 6px; border-radius: 4px;">${item.vehicle_number}</code></td>
      <td>${getOfficeName(item.office_id)}</td>
      <td>${item.model || '-'}</td>
      <td>${item.model_description || '-'}</td>
      <td>
        <span class="badge badge-blue">${FUEL_TYPES[item.fuel_code] || item.fuel_code || '-'}</span>
      </td>
      <td class="actions">
        <button class="btn btn-secondary btn-sm" onclick="editRecord(${item.vehicle_id})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRecord(${item.vehicle_id})">Delete</button>
      </td>
    </tr>
  `);
}

// Open add modal
function openAddModal() {
  document.getElementById('modalTitle').textContent = 'Add Vehicle';
  document.getElementById('dataForm').reset();
  document.getElementById('recordId').value = '';
  Modal.open('formModal');
}

// Edit record
async function editRecord(id) {
  const record = await Storage.getById(STORAGE_KEY, id);

  if (record) {
    document.getElementById('modalTitle').textContent = 'Edit Vehicle';
    Form.setData(document.getElementById('dataForm'), record);
    Modal.open('formModal');
  }
}

// Save record (add or update)
async function saveRecord(event) {
  event.preventDefault();

  const form = event.target;
  const formData = Form.getData(form);

  if (formData.vehicle_id) {
    // Update existing
    formData.vehicle_id = parseInt(formData.vehicle_id);
    await Storage.update(STORAGE_KEY, formData);
    Toast.success('Vehicle updated successfully');
  } else {
    // Add new
    delete formData.vehicle_id; // Let IndexedDB auto-generate
    await Storage.add(STORAGE_KEY, formData);
    Toast.success('Vehicle added successfully');
  }

  Modal.close('formModal');
  await loadData();
}

// Delete record
async function deleteRecord(id) {
  if (confirm('Are you sure you want to delete this vehicle?')) {
    await Storage.delete(STORAGE_KEY, id);
    Toast.success('Vehicle deleted successfully');
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
  CSV.export(data, CSV_COLUMNS, `vehicles_${timestamp}.csv`);
  Toast.success('CSV exported successfully');
}

// Clear all data in this store
async function clearData() {
  const count = await Storage.count(STORAGE_KEY);
  if (count === 0) {
    Toast.info('No data to clear');
    return;
  }
  if (confirm(`Are you sure you want to delete all ${count} vehicle records? This action cannot be undone.`)) {
    await Storage.clear(STORAGE_KEY);
    Toast.success('All vehicles cleared');
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
      if (!item.vehicle_number || !item.model) continue;

      if (item.vehicle_id) {
        item.vehicle_id = parseInt(item.vehicle_id);
        const existing = await Storage.getById(STORAGE_KEY, item.vehicle_id);
        if (existing) {
          await Storage.update(STORAGE_KEY, { ...existing, ...item });
          updatedCount++;
        } else {
          await Storage.add(STORAGE_KEY, item);
          addedCount++;
        }
      } else {
        delete item.vehicle_id;
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
