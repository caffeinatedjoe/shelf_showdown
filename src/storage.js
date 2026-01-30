const DB_NAME = "shelf-showdown";
const BOOK_STORE = "books";

export const SCHEMA_METADATA = {
  version: "1.0",
  store: BOOK_STORE,
  fields: [
    "id",
    "title",
    "author",
    "lengthMinutes",
    "genre",
    "reads",
    "derivedPace",
    "rankingMetadata",
    "ingestionMetadata"
  ],
  description: "Normalized book records persisted into the canonical IndexedDB store."
};

let dbPromise;

function openDb() {
  if (!globalThis.indexedDB) {
    throw new Error("IndexedDB is not available in this environment.");
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BOOK_STORE)) {
        db.createObjectStore(BOOK_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export async function replaceBooks(records) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOK_STORE, "readwrite");
    const store = tx.objectStore(BOOK_STORE);
    store.clear();
    records.forEach((record) => store.put(record));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllBooks() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOK_STORE, "readonly");
    const store = tx.objectStore(BOOK_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function clearBooks() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOK_STORE, "readwrite");
    const store = tx.objectStore(BOOK_STORE);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBookById(id) {
  if (!id) {
    return null;
  }
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOK_STORE, "readonly");
    const store = tx.objectStore(BOOK_STORE);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}
