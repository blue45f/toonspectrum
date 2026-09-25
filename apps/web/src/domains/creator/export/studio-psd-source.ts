import { isStudioOpfsContentHash, type StudioOpfsAssetStore, type StudioOpfsContentHash } from "../studio-opfs-asset-store";

export const STUDIO_PSD_SOURCE_MIME = "image/vnd.adobe.photoshop";
export const STUDIO_PSD_SOURCE_MAX_BYTES = 128 * 1024 * 1024;

/** 문서·협업에는 참조만 저장한다. 원본 바이트는 기존 OPFS CAS와 portable archive에 둔다. */
export interface StudioPsdSource {
  readonly version: 1;
  readonly hash: StudioOpfsContentHash;
  readonly name: string;
  readonly bytes: number;
}

function isControlCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code <= 31 || (code >= 127 && code <= 159);
}

export function parseStudioPsdSource(value: unknown): StudioPsdSource | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["version", "hash", "name", "bytes"].includes(key))
    || record.version !== 1 || !isStudioOpfsContentHash(record.hash)
    || typeof record.name !== "string" || record.name.length < 1 || record.name.length > 512
    || [...record.name].some(isControlCharacter)
    || typeof record.bytes !== "number" || !Number.isSafeInteger(record.bytes)
    || record.bytes < 26 || record.bytes > STUDIO_PSD_SOURCE_MAX_BYTES) return null;
  return { version: 1, hash: record.hash, name: record.name, bytes: record.bytes };
}

export function validateStudioPsdSourceBytes(bytes: Uint8Array): void {
  if (bytes.byteLength < 26 || bytes.byteLength > STUDIO_PSD_SOURCE_MAX_BYTES
    || bytes[0] !== 0x38 || bytes[1] !== 0x42 || bytes[2] !== 0x50 || bytes[3] !== 0x53
    || bytes[4] !== 0 || bytes[5] !== 1) throw new Error("보관할 원본 PSD의 서명 또는 크기가 올바르지 않아요.");
}

export async function acquireStudioPsdSourceStore(): Promise<StudioOpfsAssetStore> {
  const { acquireProductStudioAssetCasStore } = await import("../studio-asset-library-sqlite-opfs-repository");
  return acquireProductStudioAssetCasStore();
}

export async function storeStudioPsdSource(
  file: File,
  store?: StudioOpfsAssetStore,
): Promise<StudioPsdSource> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  validateStudioPsdSourceBytes(bytes);
  const storage = store ?? await acquireStudioPsdSourceStore();
  const stored = await storage.put(bytes, { mime: STUDIO_PSD_SOURCE_MIME });
  // 편집 이력·다른 프로젝트의 참조와 독립적으로 원본을 보존한다. 임의 회수하지 않는다.
  await storage.setOwnerRefs(`psd-original:${stored.ref.hash}`, [stored.ref.hash]);
  return { version: 1, hash: stored.ref.hash, name: [...file.name].map((character) => isControlCharacter(character) ? " " : character).join("").slice(0, 512) || "original.psd", bytes: bytes.byteLength };
}

export async function readStudioPsdSource(
  source: StudioPsdSource,
  store?: StudioOpfsAssetStore,
): Promise<Uint8Array> {
  if (!parseStudioPsdSource(source)) throw new Error("PSD 원본 참조가 손상됐어요.");
  const storage = store ?? await acquireStudioPsdSourceStore();
  const bytes = await storage.get(source.hash, { verify: true });
  if (!bytes || bytes.byteLength !== source.bytes) throw new Error(`${source.name}: 이 기기에 PSD 원본이 없어요. 원본을 포함한 프로젝트 아카이브로 복구해 주세요.`);
  validateStudioPsdSourceBytes(bytes);
  return bytes;
}

export async function downloadStudioPsdSource(source: StudioPsdSource): Promise<void> {
  const bytes = await readStudioPsdSource(source);
  const { downloadBlob } = await import("./studio-export");
  downloadBlob(new Blob([new Uint8Array(bytes).buffer], { type: STUDIO_PSD_SOURCE_MIME }), source.name);
}
