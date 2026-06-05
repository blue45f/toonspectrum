// 회원 커스텀 에셋 라이브러리 — 업로드한 이미지를 브라우저(IndexedDB)에 저장해 재사용.
// (멤버 간 공유 서버 동기화는 추후 백엔드 작업; 현재는 기기-로컬 개인 라이브러리.)

const DB_NAME = "toonspectrum-studio-asset-library";
const DB_VERSION = 1;
const STORE = "assets";

export interface StudioAsset {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  createdAt: number;
}

function createAssetId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// 파일명 → 표시 이름(확장자 제거).
export function normalizeAssetName(fileName: string): string {
  const normalized = fileName.trim().replace(/\.(png|jpe?g|gif|webp|svg|avif)$/i, "").trim();
  return normalized || "내 에셋";
}

export function createAssetRecord(
  input: { name: string; dataUrl: string; width: number; height: number },
  id = createAssetId(),
  now = Date.now()
): StudioAsset {
  return {
    id,
    name: normalizeAssetName(input.name),
    dataUrl: input.dataUrl,
    width: Math.max(1, Math.round(input.width)),
    height: Math.max(1, Math.round(input.height)),
    createdAt: now,
  };
}

function hasIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function dbError() {
  return new Error("이 브라우저에서는 에셋 라이브러리 저장소를 사용할 수 없습니다.");
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? dbError());
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? dbError());
    transaction.onabort = () => reject(transaction.error ?? dbError());
  });
}

function openDatabase() {
  if (!hasIndexedDb()) return Promise.reject(dbError());
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? dbError());
  });
}

async function withDatabase<T>(callback: (db: IDBDatabase) => Promise<T>) {
  const db = await openDatabase();
  try {
    return await callback(db);
  } finally {
    db.close();
  }
}

export async function saveAsset(input: { name: string; dataUrl: string; width: number; height: number }): Promise<StudioAsset> {
  const record = createAssetRecord(input);
  await withDatabase(async (db) => {
    const tx = db.transaction(STORE, "readwrite");
    const done = transactionDone(tx);
    tx.objectStore(STORE).put(record);
    await done;
  });
  return record;
}

export async function listAssets(): Promise<StudioAsset[]> {
  return withDatabase(async (db) => {
    const tx = db.transaction(STORE, "readonly");
    const done = transactionDone(tx);
    const records = await requestResult<StudioAsset[]>(tx.objectStore(STORE).getAll());
    await done;
    return records.slice().sort((a, b) => b.createdAt - a.createdAt);
  });
}

export async function deleteAsset(id: string): Promise<void> {
  await withDatabase(async (db) => {
    const tx = db.transaction(STORE, "readwrite");
    const done = transactionDone(tx);
    tx.objectStore(STORE).delete(id);
    await done;
  });
}
