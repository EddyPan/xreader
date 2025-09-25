// IndexedDB 封装
const DB_NAME = 'XReaderDB';
const DB_STORE = 'books';

let db;

/**
 * 打开IndexedDB数据库连接
 * 如果数据库不存在则创建，并建立书籍对象存储
 * @returns {Promise<IDBDatabase>} 返回数据库连接对象的Promise
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
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
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(book);
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
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(id);
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
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).getAll();
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
    const tx = db.transaction(DB_STORE, 'readwrite');
    const req = tx.objectStore(DB_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = e => reject(e);
  });
}
