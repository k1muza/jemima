/**
 * Photo bytes (downscaled JPEG data URLs) kept in IndexedDB — too large for
 * localStorage. Demo-only: replaced by Supabase Storage later. Every call
 * fails soft so the catalogue still works without IndexedDB.
 */
const DB_NAME = "jemimas-designs";
const STORE = "photos";

let dbPromise: Promise<IDBDatabase> | null = null;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
  return dbPromise;
}

async function run(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => void) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const photoDb = {
  put: (id: string, dataUrl: string) => run("readwrite", (s) => s.put(dataUrl, id)).catch(() => {}),
  remove: (id: string) => run("readwrite", (s) => s.delete(id)).catch(() => {}),
  clear: () => run("readwrite", (s) => s.clear()).catch(() => {}),
  async all(): Promise<Record<string, string>> {
    try {
      const db = await open();
      return await new Promise((resolve) => {
        const out: Record<string, string> = {};
        const cursor = db.transaction(STORE).objectStore(STORE).openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c) return resolve(out);
          out[String(c.key)] = c.value as string;
          c.continue();
        };
        cursor.onerror = () => resolve(out);
      });
    } catch {
      return {};
    }
  },
};
