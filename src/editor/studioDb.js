/**
 * Shared IndexedDB wrapper for Pose Library, Projects, Autosave, and Imported GLB Assets.
 * Falls back cleanly to an in-memory store when IndexedDB is unavailable (e.g. Node tests).
 */

const DB_NAME = 'kurumi_studio_v2';
const DB_VERSION = 1;
const STORES = ['poses', 'projects', 'assets', 'meta'];

const memoryFallback = new Map(STORES.map((name) => [name, new Map()]));
let dbPromise = null;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const store of STORES) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: 'id' });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function dbGetAll(storeName) {
  const db = await openDb();
  if (!db) return [...(memoryFallback.get(storeName)?.values() ?? [])];
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

export async function dbGet(storeName, id) {
  const db = await openDb();
  if (!db) return memoryFallback.get(storeName)?.get(id) ?? null;
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function dbPut(storeName, record) {
  const db = await openDb();
  if (!db) {
    memoryFallback.get(storeName)?.set(record.id, structuredClone(record));
    return record;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

export async function dbDelete(storeName, id) {
  const db = await openDb();
  if (!db) {
    memoryFallback.get(storeName)?.delete(id);
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
