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

export type SampleVrm = {
  id: string;
  name: string;
  url: string;
};

type VrmThumbnailRecord = {
  id: string;
  thumbnail: string;
  updatedAt: number;
};

// 기본 번들 VRM 캐릭터.
// A-C는 pixiv VRoidPreset 조건, old beta 샘플 4종은 pixiv CC0 조건을 따른다.
// 모델별 출처 URL·라이선스 요약은 public/vrm/LICENSES.md 참고
// (신규 8종: madjin/vrm-samples의 VRoid 공식 샘플 + UniVRM Alicia Solid 테스트 모델).
export const SAMPLE_VRMS: SampleVrm[] = [
  { id: SAMPLE_VRM_ID, name: "루미", url: SAMPLE_VRM_URL },
  { id: "avatar-a", name: "하린", url: "/vrm/AvatarSample_A.vrm" },
  { id: "avatar-b", name: "세라", url: "/vrm/AvatarSample_B.vrm" },
  { id: "avatar-c", name: "유나", url: "/vrm/AvatarSample_C.vrm" },
  { id: "shion", name: "시온", url: "/vrm/Sendagaya_Shibu.vrm" },
  { id: "vivi", name: "비비", url: "/vrm/Vivi.vrm" },
  { id: "vita", name: "비타", url: "/vrm/Vita.vrm" },
  { id: "rubin", name: "루빈", url: "/vrm/Victoria_Rubin.vrm" },
  { id: "orion", name: "오리온 (로봇)", url: "/vrm/Avatar_Orion.vrm" },
  { id: "cryptovoxel", name: "크립토 (복셀봇)", url: "/vrm/cryptovoxels.vrm" },
  { id: "meebit", name: "미빗 (블록맨)", url: "/vrm/meebit_09842.vrm" },
  { id: "seedsan", name: "시드상 (마스코트)", url: "/vrm/Seed_san.vrm" },
  { id: "shino", name: "시노", url: "/vrm/Sendagaya_Shino.vrm" },
  { id: "fumi", name: "후미", url: "/vrm/Sakurada_Fumiriya.vrm" },
  { id: "kage", name: "카게 (다크)", url: "/vrm/Darkness_Shibu.vrm" },
  { id: "hera", name: "헤라", url: "/vrm/HairSample_Female.vrm" },
  { id: "haru", name: "하루", url: "/vrm/HairSample_Male.vrm" },
  { id: "mio", name: "미오", url: "/vrm/fem_vroid.vrm" },
  { id: "noa", name: "노아", url: "/vrm/masc_vroid.vrm" },
  { id: "alicia", name: "아리시아", url: "/vrm/AliciaSolid.vrm" },
];
export const SAMPLE_VRM_ENTRIES: VrmLibraryEntry[] = SAMPLE_VRMS.map((s) => ({
  id: s.id,
  name: s.name,
  source: "sample",
  thumbnail: null,
  createdAt: 0,
  updatedAt: 0,
}));
export const SAMPLE_VRM_LIBRARY_ENTRY: VrmLibraryEntry = SAMPLE_VRM_ENTRIES[0];

export function sampleVrmUrl(id: string): string {
  return SAMPLE_VRMS.find((s) => s.id === id)?.url ?? SAMPLE_VRM_URL;
}

function isSampleVrmId(id: string) {
  return SAMPLE_VRMS.some((sample) => sample.id === id);
}

export function isUsableVrmAssetResponse(response: Pick<Response, "ok" | "headers">) {
  if (!response.ok) return false;

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const contentDisposition = response.headers.get("content-disposition")?.toLowerCase() ?? "";

  return !contentType.includes("text/html") && !/filename="?index\.html"?/.test(contentDisposition);
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

export function withDefaultVrmEntry(storedModels: VrmStoredModelRecord[], sampleThumbnails: Partial<Record<string, string | null>> = {}): VrmLibraryEntry[] {
  const sampleEntries = SAMPLE_VRM_ENTRIES.map((entry) => ({
    ...entry,
    thumbnail: sampleThumbnails[entry.id] ?? entry.thumbnail,
  }));
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

  return [...sampleEntries, ...uploadedEntries];
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
  const [storedModels, cachedSampleThumbnails] = await Promise.all([
    listStoredVrmModels(),
    Promise.all(SAMPLE_VRM_ENTRIES.map(async (entry) => [entry.id, await getCachedVrmThumbnail(entry.id)] as const)),
  ]);
  return withDefaultVrmEntry(storedModels, Object.fromEntries(cachedSampleThumbnails));
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
  if (isSampleVrmId(id)) return;

  return withDatabase(async (db) => {
    const transaction = db.transaction([MODEL_STORE, THUMBNAIL_STORE], "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(MODEL_STORE).delete(id);
    transaction.objectStore(THUMBNAIL_STORE).delete(id);
    await done;
  });
}
