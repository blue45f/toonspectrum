import { type BgCustomModelInstance } from "./studio-background-3d-model";
import { type BgPrimitive } from "./studio-background-3d-primitives";

const DB_NAME = "toonspectrum-studio-bg3d-template-library";
const DB_VERSION = 1;
const STORE_NAME = "templates";

export interface Bg3dUserTemplate {
  primitives?: BgPrimitive[];
  customModels?: BgCustomModelInstance[];
}

export interface Bg3dTemplateLibraryEntry {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly template: Bg3dUserTemplate;
  readonly commercialUse?: boolean;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export async function saveBg3dTemplate(entry: Bg3dTemplateLibraryEntry): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(entry);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function listBg3dTemplates(): Promise<Bg3dTemplateLibraryEntry[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const results = request.result as Bg3dTemplateLibraryEntry[];
      results.sort((a, b) => b.createdAt - a.createdAt);
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteBg3dTemplate(id: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
