/**
 * Common utilities for Master Data Manager
 * Using IndexedDB for data storage
 */

// Database configuration
const DB_NAME = 'MasterDataManager';
const DB_VERSION = 2;

// Store names
const STORAGE_KEYS = {
  OFFICES: 'offices',
  DEVICES: 'devices',
  VEHICLES: 'vehicles',
  DEPLOYMENTS: 'deployments',
  GEOFENCES: 'geofences',
  SETTINGS: 'settings',
  TRIPS: 'trips',
  GNSS_POINTS: 'gnss_points'
};

// Primary key fields for each store
const PRIMARY_KEYS = {
  [STORAGE_KEYS.OFFICES]: 'id',
  [STORAGE_KEYS.DEVICES]: 'serial_no',
  [STORAGE_KEYS.VEHICLES]: 'vehicle_id',
  [STORAGE_KEYS.DEPLOYMENTS]: 'id',
  [STORAGE_KEYS.GEOFENCES]: 'id',
  [STORAGE_KEYS.SETTINGS]: 'key',
  [STORAGE_KEYS.TRIPS]: 'id',
  [STORAGE_KEYS.GNSS_POINTS]: 'id'
};

/**
 * IndexedDB Storage utilities
 */
const Storage = {
  db: null,

  // Initialize database
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores for each entity
        if (!db.objectStoreNames.contains(STORAGE_KEYS.OFFICES)) {
          db.createObjectStore(STORAGE_KEYS.OFFICES, { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(STORAGE_KEYS.DEVICES)) {
          db.createObjectStore(STORAGE_KEYS.DEVICES, { keyPath: 'serial_no' });
        }
        if (!db.objectStoreNames.contains(STORAGE_KEYS.VEHICLES)) {
          db.createObjectStore(STORAGE_KEYS.VEHICLES, { keyPath: 'vehicle_id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(STORAGE_KEYS.DEPLOYMENTS)) {
          db.createObjectStore(STORAGE_KEYS.DEPLOYMENTS, { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(STORAGE_KEYS.GEOFENCES)) {
          db.createObjectStore(STORAGE_KEYS.GEOFENCES, { keyPath: 'id', autoIncrement: true });
        }
        // New stores for trajectory generation
        if (!db.objectStoreNames.contains(STORAGE_KEYS.SETTINGS)) {
          db.createObjectStore(STORAGE_KEYS.SETTINGS, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORAGE_KEYS.TRIPS)) {
          const tripStore = db.createObjectStore(STORAGE_KEYS.TRIPS, { keyPath: 'id', autoIncrement: true });
          tripStore.createIndex('vehicle_id', 'vehicle_id', { unique: false });
          tripStore.createIndex('imei', 'imei', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORAGE_KEYS.GNSS_POINTS)) {
          const gnssStore = db.createObjectStore(STORAGE_KEYS.GNSS_POINTS, { keyPath: 'id', autoIncrement: true });
          gnssStore.createIndex('trip_id', 'trip_id', { unique: false });
          gnssStore.createIndex('imei', 'imei', { unique: false });
        }
      };
    });
  },

  // Get all data from a store
  async get(storeName) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('Error reading from IndexedDB:', e);
      return [];
    }
  },

  // Get single record by key
  async getById(storeName, key) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('Error reading from IndexedDB:', e);
      return null;
    }
  },

  // Save all data to a store (replace all)
  async set(storeName, data) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        // Clear existing data
        store.clear();

        // Add all new data
        data.forEach(item => {
          store.add(item);
        });

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.error('Error writing to IndexedDB:', e);
      return false;
    }
  },

  // Add single record
  async add(storeName, item) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.add(item);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('Error adding to IndexedDB:', e);
      return null;
    }
  },

  // Update single record
  async update(storeName, item) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put(item);

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('Error updating IndexedDB:', e);
      return false;
    }
  },

  // Delete single record
  async delete(storeName, key) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('Error deleting from IndexedDB:', e);
      return false;
    }
  },

  // Clear single store
  async clear(storeName) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('Error clearing IndexedDB store:', e);
      return false;
    }
  },

  // Clear all stores
  async clearAll() {
    try {
      await this.init();
      const storeNames = Object.values(STORAGE_KEYS);
      
      for (const storeName of storeNames) {
        await this.clear(storeName);
      }
      return true;
    } catch (e) {
      console.error('Error clearing all IndexedDB stores:', e);
      return false;
    }
  },

  // Delete entire database
  async deleteDatabase() {
    return new Promise((resolve, reject) => {
      // Close existing connection
      if (this.db) {
        this.db.close();
        this.db = null;
      }

      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  },

  // Get next ID for auto-increment stores
  async getNextId(storeName) {
    const items = await this.get(storeName);
    if (items.length === 0) return 1;

    const keyField = PRIMARY_KEYS[storeName] || 'id';
    const maxId = Math.max(...items.map(item => parseInt(item[keyField]) || 0));
    return maxId + 1;
  },

  // Get count of records in store
  async count(storeName) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.count();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('Error counting IndexedDB store:', e);
      return 0;
    }
  },

  // Get records by index
  async getByIndex(storeName, indexName, value) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.getAll(value);

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('Error reading by index from IndexedDB:', e);
      return [];
    }
  },

  // Add multiple records efficiently
  async addBulk(storeName, items) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        
        items.forEach(item => {
          store.add(item);
        });

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.error('Error bulk adding to IndexedDB:', e);
      return false;
    }
  },

  // Delete records by index value
  async deleteByIndex(storeName, indexName, value) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.openCursor(value);

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            cursor.continue();
          }
        };

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.error('Error deleting by index from IndexedDB:', e);
      return false;
    }
  }
};

/**
 * Settings helper
 */
const Settings = {
  async get(key) {
    const result = await Storage.getById(STORAGE_KEYS.SETTINGS, key);
    return result ? result.value : null;
  },

  async set(key, value) {
    return await Storage.update(STORAGE_KEYS.SETTINGS, { key, value });
  },

  async getOpenRouteServiceApiKey() {
    return await this.get('openrouteservice_api_key');
  },

  async setOpenRouteServiceApiKey(apiKey) {
    return await this.set('openrouteservice_api_key', apiKey);
  },

  async hasOpenRouteServiceApiKey() {
    const key = await this.getOpenRouteServiceApiKey();
    return key && key.trim() !== '';
  }
};

/**
 * CSV utilities
 */
const CSV = {
  // Parse CSV string to array of objects
  parse(csvString) {
    // Remove BOM if present
    if (csvString.charCodeAt(0) === 0xFEFF) {
      csvString = csvString.substring(1);
    }

    const lines = csvString.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = this.parseLine(lines[0]);
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseLine(lines[i]);
      if (values.length === headers.length) {
        const obj = {};
        headers.forEach((header, index) => {
          obj[header.trim()] = values[index];
        });
        data.push(obj);
      }
    }
    return data;
  },

  // Parse a single CSV line, handling quoted values
  parseLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  },

  // Convert array of objects to CSV string
  stringify(data, columns) {
    if (!data || data.length === 0) return '';

    const headers = columns || Object.keys(data[0]);
    const lines = [headers.join(',')];

    data.forEach(item => {
      const values = headers.map(header => {
        let value = item[header] ?? '';
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          value = '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
      });
      lines.push(values.join(','));
    });

    return lines.join('\n');
  },

  // Export data as CSV file download
  export(data, columns, filename) {
    const csvContent = this.stringify(data, columns);
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  },

  // Import CSV file
  import(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = this.parse(e.target.result);
          resolve(data);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
};

/**
 * Toast notifications
 */
const Toast = {
  container: null,

  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },

  show(message, type = 'info', duration = 3000) {
    this.init();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
      success: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>',
      error: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>',
      info: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm6.5-.25A.75.75 0 017.25 7h1a.75.75 0 01.75.75v2.75h.25a.75.75 0 010 1.5h-2a.75.75 0 010-1.5h.25v-2h-.25a.75.75 0 01-.75-.75zM8 6a1 1 0 100-2 1 1 0 000 2z"/></svg>'
    };

    toast.innerHTML = `
      <span style="color: var(--text-${type === 'success' ? 'primary' : type})">${icons[type] || icons.info}</span>
      <span>${message}</span>
    `;

    this.container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  success(message) {
    this.show(message, 'success');
  },

  error(message) {
    this.show(message, 'error');
  },

  info(message) {
    this.show(message, 'info');
  }
};

/**
 * Modal utilities
 */
const Modal = {
  open(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  },

  close(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  },

  init() {
    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
          document.body.style.overflow = '';
        }
      });
    });

    // Close modal on close button click
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal-overlay');
        if (modal) {
          modal.classList.remove('active');
          document.body.style.overflow = '';
        }
      });
    });

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(modal => {
          modal.classList.remove('active');
        });
        document.body.style.overflow = '';
      }
    });
  }
};

/**
 * Form utilities
 */
const Form = {
  // Get form data as object
  getData(formElement) {
    const formData = new FormData(formElement);
    const data = {};
    formData.forEach((value, key) => {
      data[key] = value;
    });
    return data;
  },

  // Set form data from object
  setData(formElement, data) {
    Object.keys(data).forEach(key => {
      const input = formElement.elements[key];
      if (input) {
        if (input.type === 'checkbox') {
          input.checked = data[key] === true || data[key] === 'true';
        } else {
          input.value = data[key] ?? '';
        }
      }
    });
  },

  // Reset form
  reset(formElement) {
    formElement.reset();
  }
};

/**
 * Date utilities
 */
const DateUtil = {
  // Format date to ISO string for datetime-local input
  toInputFormat(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().slice(0, 16);
  },

  // Format date for display
  toDisplayFormat(date) {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleString();
  },

  // Get current datetime in input format
  now() {
    return this.toInputFormat(new Date());
  }
};

/**
 * Table utilities
 */
const Table = {
  // Render table rows
  render(tableBody, data, renderRow) {
    if (!data || data.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="100%" class="text-center" style="padding: 48px;">
            <div class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                <polyline points="13 2 13 9 20 9"/>
              </svg>
              <h3>No data found</h3>
              <p>Add a new record or import from CSV</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = data.map(renderRow).join('');
  }
};

/**
 * Validation utilities
 */
const Validate = {
  required(value, fieldName) {
    if (!value || value.trim() === '') {
      return `${fieldName} is required`;
    }
    return null;
  },

  number(value, fieldName) {
    if (value && isNaN(Number(value))) {
      return `${fieldName} must be a number`;
    }
    return null;
  },

  email(value, fieldName) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (value && !emailRegex.test(value)) {
      return `${fieldName} must be a valid email`;
    }
    return null;
  }
};

/**
 * Initialize common functionality
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize IndexedDB
  await Storage.init();
  
  Modal.init();

  // Mark active nav link
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.getAttribute('href') === currentPage) {
      link.classList.add('active');
    }
  });
});

// Export for use in other modules
window.STORAGE_KEYS = STORAGE_KEYS;
window.Storage = Storage;
window.Settings = Settings;
window.CSV = CSV;
window.Toast = Toast;
window.Modal = Modal;
window.Form = Form;
window.DateUtil = DateUtil;
window.Table = Table;
window.Validate = Validate;
