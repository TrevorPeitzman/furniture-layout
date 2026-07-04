// ── layoutStore: IndexedDB-backed persistence for saved furniture layouts ──
//
// Each saved layout is one record keyed by a stable `id`, so a layout can be
// renamed without breaking the "currently editing" reference. Floor-plan images
// are embedded as data URLs and can be several MB — IndexedDB handles that far
// more reliably than localStorage's ~5 MB total quota.

const DB_NAME = "furniture-planner";
const STORE = "layouts";
const VERSION = 1;

// A fixed record id used for the auto-saved working session.
export const AUTOSAVE_ID = "__autosave__";
export const SCHEMA_VERSION = 2;

// IndexedDB isn't available in every context (older browsers, some private
// modes). Callers gate the whole feature on this.
export const HAS_STORE =
  typeof indexedDB !== "undefined" && indexedDB !== null;

let dbPromise = null;

function openDB() {
  if (!HAS_STORE) return Promise.reject(new Error("IndexedDB unavailable"));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // Don't cache a rejected promise — allow a later retry.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    Promise.resolve(fn(store))
      .then((r) => { result = r; })
      .catch(reject);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Write (create or overwrite) one layout record.
export async function putLayout(record) {
  return run("readwrite", (store) => promisify(store.put(record)));
}

export async function getLayout(id) {
  return run("readonly", (store) => promisify(store.get(id)));
}

export async function deleteLayout(id) {
  return run("readwrite", (store) => promisify(store.delete(id)));
}

// All named layouts (excludes the auto-save record), newest first.
export async function listLayouts() {
  const all = await run("readonly", (store) => promisify(store.getAll()));
  return (all || [])
    .filter((r) => r.id !== AUTOSAVE_ID)
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}
