const DB_NAME = 'XReaderDB';
const DB_VERSION = 3; // Increment version to trigger onupgradeneeded
const DB_STORE_BOOKS = 'books';
const DB_STORE_SETTINGS = 'settings';

let db;

/**
 * 打开IndexedDB数据库连接
 * 如果数据库不存在则创建，并建立书籍对象存储
 * @returns {Promise<IDBDatabase>} 返回数据库连接对象的Promise
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE_BOOKS)) {
        const bookStore = db.createObjectStore(DB_STORE_BOOKS, { keyPath: 'id' });
        bookStore.createIndex('synced', 'synced', { unique: false });
      }
      if (!db.objectStoreNames.contains(DB_STORE_SETTINGS)) {
        db.createObjectStore(DB_STORE_SETTINGS, { keyPath: 'key' });
      }
      const tx = e.target.transaction;
      if (tx.objectStoreNames.contains(DB_STORE_BOOKS)) {
        const bookStore = tx.objectStore(DB_STORE_BOOKS);
        if (!bookStore.indexNames.contains('synced')) {
          bookStore.createIndex('synced', 'synced', { unique: false });
        }
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = e => reject(e);
  });
}

/**
 * 保存或更新书籍到数据库
 * 使用put操作，如果书籍已存在则更新，不存在则新增
 * @param {Object} book - 书籍对象，必须包含id属性
 * @returns {Promise<void>} 操作完成的Promise
 */
function saveBook(book) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE_BOOKS, 'readwrite');
    tx.objectStore(DB_STORE_BOOKS).put(book);
    tx.oncomplete = () => resolve();
    tx.onerror = e => reject(e);
  });
}

/**
 * 根据ID从数据库获取单本书籍
 * @param {string} id - 书籍的唯一标识符
 * @returns {Promise<Object|null>} 返回书籍对象，如果不存在则返回null
 */
function getBook(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE_BOOKS, 'readonly');
    const req = tx.objectStore(DB_STORE_BOOKS).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e);
  });
}

/**
 * 获取数据库中所有书籍
 * 用于构建书籍列表和刷新显示
 * @returns {Promise<Array>} 返回所有书籍对象的数组
 */
function getAllBooks() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE_BOOKS, 'readonly');
    const req = tx.objectStore(DB_STORE_BOOKS).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e);
  });
}

/**
 * 从数据库中删除指定书籍
 * @param {string} id - 要删除的书籍ID
 * @returns {Promise<void>} 删除完成的Promise
 */
function deleteBook(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE_BOOKS, 'readwrite');
    const req = tx.objectStore(DB_STORE_BOOKS).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = e => reject(e);
  });
}

/**
 * 保存同步设置
 * @param {Object} settings - 同步设置对象，包含syncUrl和syncToken
 * @returns {Promise<void>} 操作完成的Promise
 */
function saveSyncSettings(settings) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE_SETTINGS, 'readwrite');
    tx.objectStore(DB_STORE_SETTINGS).put({ key: 'syncSettings', value: settings });
    tx.oncomplete = () => resolve();
    tx.onerror = e => reject(e);
  });
}

/**
 * 获取同步设置
 * @returns {Promise<Object|null>} 返回同步设置对象，如果不存在则返回null
 */
function getSyncSettings() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE_SETTINGS, 'readonly');
    const req = tx.objectStore(DB_STORE_SETTINGS).get('syncSettings');
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = e => reject(e);
  });
}
