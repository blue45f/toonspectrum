// 회원 커스텀 에셋 라이브러리 — 업로드한 이미지를 브라우저(IndexedDB)에 저장해 재사용.
// (멤버 간 공유 서버 동기화는 추후 백엔드 작업; 현재는 기기-로컬 개인 라이브러리.)

const DB_NAME = "toonspectrum-studio-asset-library";
const DB_VERSION = 1;
const STORE = "assets";

const SHA256_HEX_LENGTH = 64;
const SHA256_CONTENT_HASH_PATTERN = /^sha256:([0-9a-f]{64})$/i;

export type StudioAssetContentHash = `sha256:${string}`;

export interface StudioAsset {
  id: string;
  name: string;
  dataUrl: string;
  /**
   * Decoded asset bytes의 안정적인 콘텐츠 식별자. 신규 저장분에는 항상 존재하지만,
   * DB v1 레거시 행과 해석할 수 없는 손상 행은 목록에서 일시적으로 없을 수 있다.
   */
  contentHash?: StudioAssetContentHash;
  width: number;
  height: number;
  createdAt: number;
  /**
   * 에셋 출처 종류. "ai" 면 생성형 AI(이미지 생성)로 만든 결과물 — 정책상 결과물에 AI 라벨/배지를
   * 표시해야 하므로 그리드 썸네일에 'AI' 배지를 노출한다. 업로드 등 일반 에셋은 생략(undefined).
   */
  kind?: string;
}

export type StudioAssetWithContentHash = StudioAsset & {
  contentHash: StudioAssetContentHash;
};

function createAssetId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`; // NOSONAR S2245 비암호화 용도(시각효과/ID 생성)
}

// 파일명 → 표시 이름(확장자 제거).
export function normalizeAssetName(fileName: string): string {
  const normalized = fileName.trim().replace(/\.(png|jpe?g|gif|webp|svg|avif)$/i, "").trim();
  return normalized || "내 에셋";
}

export function createAssetRecord(
  input: {
    name: string;
    dataUrl: string;
    width: number;
    height: number;
    kind?: string;
    contentHash?: string;
  },
  id = createAssetId(),
  now = Date.now()
): StudioAsset {
  const contentHash = canonicalizeStudioAssetContentHash(input.contentHash);
  return {
    id,
    name: normalizeAssetName(input.name),
    dataUrl: input.dataUrl,
    ...(contentHash ? { contentHash } : {}),
    width: Math.max(1, Math.round(input.width)),
    height: Math.max(1, Math.round(input.height)),
    createdAt: now,
    ...(input.kind ? { kind: input.kind } : {}),
  };
}

/** `sha256:` 접두어를 포함한 64자리 SHA-256 식별자만 소문자로 정규화한다. */
export function canonicalizeStudioAssetContentHash(value: unknown): StudioAssetContentHash | null {
  if (typeof value !== "string") return null;
  const match = SHA256_CONTENT_HASH_PATTERN.exec(value.trim());
  if (!match || match[1].length !== SHA256_HEX_LENGTH) return null;
  return `sha256:${match[1].toLowerCase()}`;
}

function decodePercentEncodedPayload(payload: string): Uint8Array<ArrayBuffer> {
  const chunks: number[] = [];
  const encoder = new TextEncoder();
  let textStart = 0;

  const appendText = (end: number) => {
    if (end <= textStart) return;
    for (const byte of encoder.encode(payload.slice(textStart, end))) chunks.push(byte);
  };

  for (let index = 0; index < payload.length; index += 1) {
    if (payload[index] !== "%") continue;
    appendText(index);
    const encodedByte = payload.slice(index + 1, index + 3);
    if (!/^[0-9a-f]{2}$/i.test(encodedByte)) {
      throw new TypeError("에셋 데이터 URL의 퍼센트 인코딩이 올바르지 않습니다.");
    }
    chunks.push(Number.parseInt(encodedByte, 16));
    index += 2;
    textStart = index + 1;
  }

  appendText(payload.length);
  return Uint8Array.from(chunks);
}

function decodeBase64Payload(payload: string): Uint8Array<ArrayBuffer> {
  let normalizedPayload: string;
  try {
    normalizedPayload = decodeURIComponent(payload).replace(/[\t\n\f\r ]/g, "");
  } catch {
    throw new TypeError("에셋 데이터 URL의 Base64 인코딩이 올바르지 않습니다.");
  }

  let decoded: string;
  try {
    decoded = globalThis.atob(normalizedPayload);
  } catch {
    throw new TypeError("에셋 데이터 URL의 Base64 인코딩이 올바르지 않습니다.");
  }

  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function decodeStudioAssetDataUrl(dataUrl: string): Uint8Array<ArrayBuffer> {
  if (typeof dataUrl !== "string" || !/^data:/i.test(dataUrl)) {
    throw new TypeError("에셋 콘텐츠는 데이터 URL이어야 합니다.");
  }
  const separatorIndex = dataUrl.indexOf(",");
  if (separatorIndex < 5) {
    throw new TypeError("에셋 데이터 URL 형식이 올바르지 않습니다.");
  }

  const metadata = dataUrl.slice(5, separatorIndex);
  const payload = dataUrl.slice(separatorIndex + 1);
  const isBase64 = metadata
    .split(";")
    .slice(1)
    .some((token) => token.trim().toLowerCase() === "base64");
  return isBase64 ? decodeBase64Payload(payload) : decodePercentEncodedPayload(payload);
}

/** 데이터 URL 문자열이 아니라 디코딩된 원본 바이트를 SHA-256으로 식별한다. */
export async function hashStudioAssetDataUrl(dataUrl: string): Promise<StudioAssetContentHash> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("이 브라우저에서는 에셋 콘텐츠 해시를 계산할 수 없습니다.");
  }
  const digest = await subtle.digest("SHA-256", decodeStudioAssetDataUrl(dataUrl));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

/** 레거시 에셋에 콘텐츠 해시를 부여하되 원본 객체를 변경하거나 이미지 바이트를 별도 저장하지 않는다. */
export async function ensureStudioAssetContentHash(
  asset: StudioAsset
): Promise<StudioAssetWithContentHash> {
  const canonicalHash = canonicalizeStudioAssetContentHash(asset.contentHash);
  if (canonicalHash === asset.contentHash) {
    return asset as StudioAssetWithContentHash;
  }
  return {
    ...asset,
    contentHash: canonicalHash ?? (await hashStudioAssetDataUrl(asset.dataUrl)),
  };
}

function isStudioAssetRecord(value: unknown): value is StudioAsset {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<Record<keyof StudioAsset, unknown>>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.dataUrl === "string" &&
    typeof record.width === "number" &&
    Number.isFinite(record.width) &&
    typeof record.height === "number" &&
    Number.isFinite(record.height) &&
    typeof record.createdAt === "number" &&
    Number.isFinite(record.createdAt) &&
    (record.kind === undefined || typeof record.kind === "string") &&
    (record.contentHash === undefined || typeof record.contentHash === "string")
  );
}

function safeCreatedAt(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

interface StudioAssetHashBackfill {
  id: string;
  dataUrl: string;
  contentHash: StudioAssetContentHash;
}

async function persistAssetHashBackfills(
  db: IDBDatabase,
  backfills: readonly StudioAssetHashBackfill[]
): Promise<void> {
  const tx = db.transaction(STORE, "readwrite");
  const done = transactionDone(tx);
  const store = tx.objectStore(STORE);

  const reconcileCurrentRows = async () => {
    // Queue every read before yielding so the transaction cannot become inactive between rows.
    const currentRows = await Promise.all(
      backfills.map(({ id }) => requestResult<unknown>(store.get(id)))
    );
    currentRows.forEach((currentRow, index) => {
      if (!isStudioAssetRecord(currentRow)) return;
      const backfill = backfills[index];
      if (currentRow.dataUrl !== backfill.dataUrl) return;

      const currentHash = canonicalizeStudioAssetContentHash(currentRow.contentHash);
      if (currentHash && currentHash !== backfill.contentHash) return;
      if (currentRow.contentHash === backfill.contentHash) return;
      store.put({ ...currentRow, contentHash: backfill.contentHash });
    });
  };

  await Promise.all([reconcileCurrentRows(), done]);
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

export async function saveAsset(input: {
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  kind?: string;
  contentHash?: string;
}): Promise<StudioAssetWithContentHash> {
  const record = await ensureStudioAssetContentHash(createAssetRecord(input));
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
    const storedRecords = await requestResult<unknown[]>(tx.objectStore(STORE).getAll());
    await done;
    const records = storedRecords.filter(isStudioAssetRecord);
    const ensured: Array<{
      asset: StudioAsset;
      backfill: StudioAssetHashBackfill | null;
    }> = [];
    // Hash one legacy image at a time so a large library does not retain multiple decoded buffers.
    for (const record of records) {
      try {
        const asset = await ensureStudioAssetContentHash(record);
        ensured.push({
          asset,
          backfill: asset.contentHash !== record.contentHash
            ? { id: record.id, dataUrl: record.dataUrl, contentHash: asset.contentHash }
            : null,
        });
      } catch {
        ensured.push({ asset: record, backfill: null });
      }
    }

    const backfills = ensured.flatMap(({ backfill }) => (backfill ? [backfill] : []));
    if (backfills.length > 0) {
      try {
        await persistAssetHashBackfills(db, backfills);
      } catch {
        // Hashes are already available to the caller. A quota/race/write failure must not hide valid rows.
      }
    }

    return ensured
      .map(({ asset }) => asset)
      .sort((a, b) => safeCreatedAt(b.createdAt) - safeCreatedAt(a.createdAt));
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

export async function renameAsset(id: string, newName: string): Promise<void> {
  await withDatabase(async (db) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const asset = await requestResult<StudioAsset>(store.get(id));
    if (!asset) throw new Error("에셋을 찾을 수 없습니다.");
    asset.name = normalizeAssetName(newName);
    store.put(asset);
    await transactionDone(tx);
  });
}
