/**
 * Offices management (IndexedDB version)
 */

const STORAGE_KEY = STORAGE_KEYS.OFFICES;
const CSV_COLUMNS = ['id', 'company_id', 'office_name', 'office_name_kana', 'abbreviation', 'post_code', 'prefecture_id', 'prefecture', 'city', 'street_address', 'building', 'latitude', 'longitude', 'office_type'];

const OFFICE_TYPES = {
  1: 'Headquarters',
  2: 'Branch',
  3: 'Warehouse',
  4: 'Distribution Center'
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await Storage.init();
  await loadData();
});

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
      <td>${item.id}</td>
      <td><code style="background: var(--bg-surface-active); padding: 2px 6px; border-radius: 4px;">${item.company_id || '-'}</code></td>
      <td>${item.office_name || '-'}</td>
      <td>${item.abbreviation || '-'}</td>
      <td>${item.prefecture || '-'}</td>
      <td>${item.city || '-'}</td>
      <td>${item.latitude || '-'}</td>
      <td>${item.longitude || '-'}</td>
      <td>
        <span class="badge badge-blue">${OFFICE_TYPES[item.office_type] || item.office_type || '-'}</span>
      </td>
      <td class="actions">
        <button class="btn btn-secondary btn-sm" onclick="editRecord(${item.id})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRecord(${item.id})">Delete</button>
      </td>
    </tr>
  `);
}

// Open add modal
function openAddModal() {
  document.getElementById('modalTitle').textContent = 'Add Office';
  document.getElementById('dataForm').reset();
  document.getElementById('recordId').value = '';
  Modal.open('formModal');
}

// Edit record
async function editRecord(id) {
  const record = await Storage.getById(STORAGE_KEY, id);

  if (record) {
    document.getElementById('modalTitle').textContent = 'Edit Office';
    Form.setData(document.getElementById('dataForm'), record);
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
    Toast.success('Office updated successfully');
  } else {
    // Add new
    delete formData.id; // Let IndexedDB auto-generate
    await Storage.add(STORAGE_KEY, formData);
    Toast.success('Office added successfully');
  }

  Modal.close('formModal');
  await loadData();
}

// Delete record
async function deleteRecord(id) {
  if (confirm('Are you sure you want to delete this office?')) {
    await Storage.delete(STORAGE_KEY, id);
    Toast.success('Office deleted successfully');
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
  CSV.export(data, CSV_COLUMNS, `offices_${timestamp}.csv`);
  Toast.success('CSV exported successfully');
}

// Clear all data in this store
async function clearData() {
  const count = await Storage.count(STORAGE_KEY);
  if (count === 0) {
    Toast.info('No data to clear');
    return;
  }
  if (confirm(`Are you sure you want to delete all ${count} office records? This action cannot be undone.`)) {
    await Storage.clear(STORAGE_KEY);
    Toast.success('All offices cleared');
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
      if (!item.office_name || !item.company_id || !item.prefecture_id) continue;

      // Convert prefecture_id to integer
      if (item.prefecture_id) {
        item.prefecture_id = parseInt(item.prefecture_id);
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
