/**
 * Devices management (IndexedDB version)
 */

const STORAGE_KEY = STORAGE_KEYS.DEVICES;
const CSV_COLUMNS = ['serial_no', 'imei', 'imsi', 'fw_id', 'fw_version', 'description', 'activate_flg', 'activate_date'];

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
      <td><code style="background: var(--bg-surface-active); padding: 2px 6px; border-radius: 4px;">${item.serial_no}</code></td>
      <td>${item.imei || '-'}</td>
      <td>${item.imsi || '-'}</td>
      <td>${item.fw_id || '-'}</td>
      <td>${item.fw_version || '-'}</td>
      <td>${item.description ? (item.description.length > 30 ? item.description.substring(0, 30) + '...' : item.description) : '-'}</td>
      <td>
        ${item.activate_flg === true || item.activate_flg === 'true'
          ? '<span class="badge badge-green">Active</span>'
          : '<span class="badge badge-gray">Inactive</span>'}
      </td>
      <td>${item.activate_date ? DateUtil.toDisplayFormat(item.activate_date) : '-'}</td>
      <td class="actions">
        <button class="btn btn-secondary btn-sm" onclick="editRecord('${item.serial_no}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRecord('${item.serial_no}')">Delete</button>
      </td>
    </tr>
  `);
}

// Open add modal
function openAddModal() {
  document.getElementById('modalTitle').textContent = 'Add Device';
  document.getElementById('dataForm').reset();
  document.getElementById('originalSerialNo').value = '';
  Modal.open('formModal');
}

// Edit record
async function editRecord(serialNo) {
  const record = await Storage.getById(STORAGE_KEY, serialNo);

  if (record) {
    document.getElementById('modalTitle').textContent = 'Edit Device';
    document.getElementById('originalSerialNo').value = serialNo;

    // Handle activate_date format for datetime-local input
    const formRecord = { ...record };
    if (formRecord.activate_date) {
      formRecord.activate_date = DateUtil.toInputFormat(formRecord.activate_date);
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
  const originalSerialNo = formData.original_serial_no;
  delete formData.original_serial_no;

  // Handle checkbox value
  formData.activate_flg = form.elements['activate_flg'].checked;

  if (originalSerialNo) {
    // Update existing - need to delete old and add new if serial_no changed
    if (originalSerialNo !== formData.serial_no) {
      await Storage.delete(STORAGE_KEY, originalSerialNo);
    }
    await Storage.update(STORAGE_KEY, formData);
    Toast.success('Device updated successfully');
  } else {
    // Check for duplicate serial_no
    const existing = await Storage.getById(STORAGE_KEY, formData.serial_no);
    if (existing) {
      Toast.error('Device with this Serial No already exists');
      return;
    }
    // Add new
    await Storage.add(STORAGE_KEY, formData);
    Toast.success('Device added successfully');
  }

  Modal.close('formModal');
  await loadData();
}

// Delete record
async function deleteRecord(serialNo) {
  if (confirm('Are you sure you want to delete this device?')) {
    await Storage.delete(STORAGE_KEY, serialNo);
    Toast.success('Device deleted successfully');
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
  CSV.export(data, CSV_COLUMNS, `devices_${timestamp}.csv`);
  Toast.success('CSV exported successfully');
}

// Clear all data in this store
async function clearData() {
  const count = await Storage.count(STORAGE_KEY);
  if (count === 0) {
    Toast.info('No data to clear');
    return;
  }
  if (confirm(`Are you sure you want to delete all ${count} device records? This action cannot be undone.`)) {
    await Storage.clear(STORAGE_KEY);
    Toast.success('All devices cleared');
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
      if (!item.serial_no || !item.imei || !item.imsi) continue;

      // Convert activate_flg to boolean
      if (typeof item.activate_flg === 'string') {
        item.activate_flg = item.activate_flg.toLowerCase() === 'true';
      }

      const existing = await Storage.getById(STORAGE_KEY, item.serial_no);
      if (existing) {
        await Storage.update(STORAGE_KEY, { ...existing, ...item });
        updatedCount++;
      } else {
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
