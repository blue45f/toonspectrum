const DB_NAME = "toonspectrum-studio-vrm-library";
const DB_VERSION = 1;
const MODEL_STORE = "models";
const THUMBNAIL_STORE = "thumbnails";

export const SAMPLE_VRM_ID = "sample-vrm";
export const SAMPLE_VRM_URL = "/vrm/sample.vrm";

export type VrmStoredModelRecord = {
  id: string;
  name: string;
  blob: Blob;
  thumbnail: string | null;
  createdAt: number;
  updatedAt: number;
};

export type VrmLibraryEntry = {
  id: string;
  name: string;
  source: "sample" | "indexed-db";
  thumbnail: string | null;
  createdAt: number;
  updatedAt: number;
};

type VrmThumbnailRecord = {
  id: string;
  thumbnail: string;
  updatedAt: number;
};

export const SAMPLE_VRM_LIBRARY_ENTRY: VrmLibraryEntry = {
  id: SAMPLE_VRM_ID,
  name: "샘플 캐릭터",
  source: "sample",
  thumbnail: null,
  createdAt: 0,
  updatedAt: 0,
};

// 기본 번들 VRM 캐릭터(전부 라이선스 OK: pixiv 샘플 + VRoid CC0 AvatarSample A/B/C).
export const SAMPLE_VRMS: { id: string; name: string; url: string }[] = [
  { id: SAMPLE_VRM_ID, name: "샘플 캐릭터", url: SAMPLE_VRM_URL },
  { id: "avatar-a", name: "아바타 A", url: "/vrm/AvatarSample_A.vrm" },
  { id: "avatar-b", name: "아바타 B", url: "/vrm/AvatarSample_B.vrm" },
  { id: "avatar-c", name: "아바타 C", url: "/vrm/AvatarSample_C.vrm" },
];
export const SAMPLE_VRM_ENTRIES: VrmLibraryEntry[] = SAMPLE_VRMS.map((s) => ({
  id: s.id,
  name: s.name,
  source: "sample",
  thumbnail: null,
  createdAt: 0,
  updatedAt: 0,
}));
export function sampleVrmUrl(id: string): string {
  return SAMPLE_VRMS.find((s) => s.id === id)?.url ?? SAMPLE_VRM_URL;
}

function createModelId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `vrm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeVrmName(fileName: string) {
  const normalized = fileName.trim().replace(/\.vrm$/i, "").trim();
  return normalized || "VRM 캐릭터";
}

function hasIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function createIndexedDbError() {
  return new Error("이 브라우저에서는 VRM 라이브러리 저장소를 사용할 수 없습니다.");
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? createIndexedDbError());
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? createIndexedDbError());
    transaction.onabort = () => reject(transaction.error ?? createIndexedDbError());
  });
}

function openLibraryDatabase() {
  if (!hasIndexedDb()) {
    return Promise.reject(createIndexedDbError());
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MODEL_STORE)) {
        db.createObjectStore(MODEL_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(THUMBNAIL_STORE)) {
        db.createObjectStore(THUMBNAIL_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? createIndexedDbError());
  });
}

async function withDatabase<T>(callback: (db: IDBDatabase) => Promise<T>) {
  const db = await openLibraryDatabase();
  try {
    return await callback(db);
  } finally {
    db.close();
  }
}

export function createUploadedVrmRecord(file: File, id = createModelId(), now = Date.now()): VrmStoredModelRecord {
  return {
    id,
    name: normalizeVrmName(file.name),
    blob: file,
    thumbnail: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function withDefaultVrmEntry(storedModels: VrmStoredModelRecord[], sampleThumbnail: string | null = null): VrmLibraryEntry[] {
  const uploadedEntries = storedModels
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map<VrmLibraryEntry>((model) => ({
      id: model.id,
      name: model.name,
      source: "indexed-db",
      thumbnail: model.thumbnail ?? null,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    }));

  return [{ ...SAMPLE_VRM_LIBRARY_ENTRY, thumbnail: sampleThumbnail }, ...uploadedEntries];
}

export function getDeletableModelIds(entries: VrmLibraryEntry[]) {
  return entries.filter((entry) => entry.source === "indexed-db").map((entry) => entry.id);
}

export async function listStoredVrmModels() {
  return withDatabase(async (db) => {
    const transaction = db.transaction(MODEL_STORE, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(MODEL_STORE);
    const records = await requestResult<VrmStoredModelRecord[]>(store.getAll());
    await done;
    return records;
  });
}

export async function getStoredVrmModel(id: string) {
  return withDatabase(async (db) => {
    const transaction = db.transaction(MODEL_STORE, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(MODEL_STORE);
    const record = await requestResult<VrmStoredModelRecord | undefined>(store.get(id));
    await done;
    return record ?? null;
  });
}

export async function getCachedVrmThumbnail(id: string) {
  return withDatabase(async (db) => {
    const transaction = db.transaction(THUMBNAIL_STORE, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(THUMBNAIL_STORE);
    const record = await requestResult<VrmThumbnailRecord | undefined>(store.get(id));
    await done;
    return record?.thumbnail ?? null;
  });
}

export async function listVrmLibraryEntries() {
  const [storedModels, sampleThumbnail] = await Promise.all([listStoredVrmModels(), getCachedVrmThumbnail(SAMPLE_VRM_ID)]);
  return withDefaultVrmEntry(storedModels, sampleThumbnail);
}

export async function saveUploadedVrm(file: File) {
  const record = createUploadedVrmRecord(file);

  return withDatabase(async (db) => {
    const transaction = db.transaction(MODEL_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(MODEL_STORE).put(record);
    await done;
    return record;
  });
}

export async function saveVrmThumbnail(id: string, thumbnail: string) {
  const existingModel = await getStoredVrmModel(id);

  return withDatabase(async (db) => {
    const transaction = db.transaction([MODEL_STORE, THUMBNAIL_STORE], "readwrite");
    const done = transactionDone(transaction);

    if (existingModel) {
      transaction.objectStore(MODEL_STORE).put({ ...existingModel, thumbnail, updatedAt: Date.now() });
    } else {
      transaction.objectStore(THUMBNAIL_STORE).put({ id, thumbnail, updatedAt: Date.now() } satisfies VrmThumbnailRecord);
    }

    await done;
  });
}

export async function deleteStoredVrmModel(id: string) {
  if (id === SAMPLE_VRM_ID) return;

  return withDatabase(async (db) => {
    const transaction = db.transaction([MODEL_STORE, THUMBNAIL_STORE], "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(MODEL_STORE).delete(id);
    transaction.objectStore(THUMBNAIL_STORE).delete(id);
    await done;
  });
}
