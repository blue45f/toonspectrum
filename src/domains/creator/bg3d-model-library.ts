// "3D 배경" 도구에 업로드하는 커스텀 3D 모델(.glb/.gltf/.obj)의 IndexedDB 저장소.
// vrm-library.ts와 아키텍처가 동일하다(같은 스토어 구조, 같은 함수 이름을 Vrm→Bg3dModel로만 바꿈,
// 같은 방어적 패턴) — 완전히 별도의 DB(toonspectrum-studio-bg3d-model-library)를 써서 VRM
// 라이브러리와 저장 공간을 분리한다. VRM은 포맷이 .vrm 하나뿐이었지만 이 도구는 SketchUp/Blender
// 등 다양한 툴의 표준 내보내기 대상(.glb/.gltf/.obj)을 받아야 하므로 detectBg3dModelFormat()이
// 추가된 점만 VRM 라이브러리와 다르다.
const DB_NAME = "toonspectrum-studio-bg3d-model-library";
const DB_VERSION = 1;
const MODEL_STORE = "models";
const THUMBNAIL_STORE = "thumbnails";

export type Bg3dModelFormat = "glb" | "gltf" | "obj";

export type Bg3dModelStoredRecord = {
  id: string;
  name: string;
  format: Bg3dModelFormat;
  blob: Blob;
  thumbnail: string | null;
  createdAt: number;
  updatedAt: number;
};

export type Bg3dModelLibraryEntry = {
  id: string;
  name: string;
  format: Bg3dModelFormat;
  source: "sample" | "indexed-db";
  thumbnail: string | null;
  createdAt: number;
  updatedAt: number;
};

export type SampleBg3dModel = {
  id: string;
  name: string;
  url: string;
  format: Bg3dModelFormat;
};

type Bg3dModelThumbnailRecord = {
  id: string;
  thumbnail: string;
  updatedAt: number;
};

// 번들 샘플 모델은 의도적으로 비워 둔다 — 복합 오브젝트 프리셋(studio-background-3d-composites.ts)이
// "미리 준비된 배경 소재" 역할을 이미 채우고 있고, 라이선스가 검증된 .glb/.gltf/.obj 배경 에셋을
// 새로 조달하는 일은 이번 작업 범위(§8 설계 문서 참고) 밖이다. 그래도 "sample"|"indexed-db" 유니언과
// SAMPLE_BG3D_MODELS 배열 자체는 vrm-library.ts와의 구조적 대칭을 유지하기 위해, 그리고 나중에
// 번들 샘플을 추가할 때 이 파일의 나머지 로직(withDefaultBg3dModelEntry 등)을 바꾸지 않아도 되도록
// 남겨 둔다.
export const SAMPLE_BG3D_MODELS: SampleBg3dModel[] = [];
export const SAMPLE_BG3D_MODEL_ENTRIES: Bg3dModelLibraryEntry[] = SAMPLE_BG3D_MODELS.map((s) => ({
  id: s.id,
  name: s.name,
  format: s.format,
  source: "sample",
  thumbnail: null,
  createdAt: 0,
  updatedAt: 0,
}));

/** 파일명 확장자로 지원 포맷을 판별한다. 인식하지 못하면 null(대문자/공백 허용, 그 외는 거부). */
export function detectBg3dModelFormat(fileName: string): Bg3dModelFormat | null {
  const match = /\.(glb|gltf|obj)$/i.exec(fileName.trim());
  if (!match) return null;
  return match[1].toLowerCase() as Bg3dModelFormat;
}

function isSampleBg3dModelId(id: string) {
  return SAMPLE_BG3D_MODELS.some((sample) => sample.id === id);
}

function createModelId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `bg3dmodel-${Date.now()}-${Math.random().toString(36).slice(2)}`; // NOSONAR S2245 비암호화 용도(ID 생성)
}

function normalizeBg3dModelName(fileName: string) {
  const normalized = fileName.trim().replace(/\.(glb|gltf|obj)$/i, "").trim();
  return normalized || "3D 모델";
}

function hasIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function createIndexedDbError() {
  return new Error("이 브라우저에서는 3D 배경 모델 라이브러리 저장소를 사용할 수 없습니다.");
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

/** 업로드 파일로부터 저장용 레코드를 만든다. 인식하지 못하는 확장자는 명확한 한국어 에러로 거부한다
 * (업로드 UI의 accept 속성이 1차 방어선이지만, 이 라이브러리 레이어에서도 방어적으로 재검증한다). */
export function createUploadedBg3dModelRecord(file: File, id = createModelId(), now = Date.now()): Bg3dModelStoredRecord {
  const format = detectBg3dModelFormat(file.name);
  if (!format) {
    throw new Error("지원하지 않는 3D 모델 형식입니다. glb·gltf·obj 파일만 업로드할 수 있습니다.");
  }
  return {
    id,
    name: normalizeBg3dModelName(file.name),
    format,
    blob: file,
    thumbnail: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function withDefaultBg3dModelEntry(
  storedModels: Bg3dModelStoredRecord[],
  sampleThumbnails: Partial<Record<string, string | null>> = {}
): Bg3dModelLibraryEntry[] {
  const sampleEntries = SAMPLE_BG3D_MODEL_ENTRIES.map((entry) => ({
    ...entry,
    thumbnail: sampleThumbnails[entry.id] ?? entry.thumbnail,
  }));
  const uploadedEntries = storedModels
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map<Bg3dModelLibraryEntry>((model) => ({
      id: model.id,
      name: model.name,
      format: model.format,
      source: "indexed-db",
      thumbnail: model.thumbnail ?? null,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    }));

  return [...sampleEntries, ...uploadedEntries];
}

export function getDeletableModelIds(entries: Bg3dModelLibraryEntry[]) {
  return entries.filter((entry) => entry.source === "indexed-db").map((entry) => entry.id);
}

export async function listStoredBg3dModels() {
  return withDatabase(async (db) => {
    const transaction = db.transaction(MODEL_STORE, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(MODEL_STORE);
    const records = await requestResult<Bg3dModelStoredRecord[]>(store.getAll());
    await done;
    return records;
  });
}

export async function getStoredBg3dModel(id: string) {
  return withDatabase(async (db) => {
    const transaction = db.transaction(MODEL_STORE, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(MODEL_STORE);
    const record = await requestResult<Bg3dModelStoredRecord | undefined>(store.get(id));
    await done;
    return record ?? null;
  });
}

export async function getCachedBg3dModelThumbnail(id: string) {
  return withDatabase(async (db) => {
    const transaction = db.transaction(THUMBNAIL_STORE, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(THUMBNAIL_STORE);
    const record = await requestResult<Bg3dModelThumbnailRecord | undefined>(store.get(id));
    await done;
    return record?.thumbnail ?? null;
  });
}

export async function listBg3dModelLibraryEntries() {
  const [storedModels, cachedSampleThumbnails] = await Promise.all([
    listStoredBg3dModels(),
    Promise.all(SAMPLE_BG3D_MODEL_ENTRIES.map(async (entry) => [entry.id, await getCachedBg3dModelThumbnail(entry.id)] as const)),
  ]);
  return withDefaultBg3dModelEntry(storedModels, Object.fromEntries(cachedSampleThumbnails));
}

export async function saveUploadedBg3dModel(file: File) {
  const record = createUploadedBg3dModelRecord(file);

  return withDatabase(async (db) => {
    const transaction = db.transaction(MODEL_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(MODEL_STORE).put(record);
    await done;
    return record;
  });
}

export async function saveBg3dModelThumbnail(id: string, thumbnail: string) {
  const existingModel = await getStoredBg3dModel(id);

  return withDatabase(async (db) => {
    const transaction = db.transaction([MODEL_STORE, THUMBNAIL_STORE], "readwrite");
    const done = transactionDone(transaction);

    if (existingModel) {
      transaction.objectStore(MODEL_STORE).put({ ...existingModel, thumbnail, updatedAt: Date.now() });
    } else {
      transaction.objectStore(THUMBNAIL_STORE).put({ id, thumbnail, updatedAt: Date.now() } satisfies Bg3dModelThumbnailRecord);
    }

    await done;
  });
}

export async function deleteStoredBg3dModel(id: string) {
  if (isSampleBg3dModelId(id)) return;

  return withDatabase(async (db) => {
    const transaction = db.transaction([MODEL_STORE, THUMBNAIL_STORE], "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(MODEL_STORE).delete(id);
    transaction.objectStore(THUMBNAIL_STORE).delete(id);
    await done;
  });
}
