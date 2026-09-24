import { canvasToBlob } from "./export/studio-export";
import { acquireProductStudioAssetCasStore } from "./studio-asset-library-sqlite-opfs-repository";
import { acquireStudioLocalDatabase } from "./studio-local-database-runtime";
import {
  STUDIO_UPLOAD_DESKTOP_MAX_DECODED_PIXELS,
  STUDIO_UPLOAD_MAX_SOURCE_BATCH_BYTES,
  STUDIO_UPLOAD_MAX_SOURCE_FILE_BYTES,
  assertStudioUploadDecodedPixels,
  assertStudioUploadSourceBatch,
  parseStudioUploadImageDimensions,
} from "./studio-upload-image-safety";

import type { StudioLocalDatabase } from "./studio-local-database";
import type {
  StudioOpfsAssetRef,
  StudioOpfsAssetStore,
} from "./studio-opfs-asset-store";

const VERSION = 1 as const;
const NAMESPACE = "studio-publish-handoff-v1";
const INDEX_KEY = "index";
const OWNER_PREFIX = `${NAMESPACE}:`;
const LOCK_NAME = "toonstudio:publish-handoff:v1";
const MAX_ACTIVE_HANDOFFS = 8;
const MAX_TITLE_LENGTH = 120;
const MAX_PAGE_NAME_LENGTH = 160;
const MAX_DIMENSION = 1_600;
const WEBP_QUALITY = 0.88;
const SUPPORTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export const STUDIO_PUBLISH_HANDOFF_TTL_MS = 24 * 60 * 60 * 1_000;
export const STUDIO_PUBLISH_HANDOFF_MAX_PAGES = 40;

export class StudioPublishHandoffError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StudioPublishHandoffError";
  }
}

export interface StudioPublishHandoffPageInput {
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
  readonly name: string;
}

interface StudioPublishHandoffPageRecord extends StudioOpfsAssetRef {
  readonly width: number;
  readonly height: number;
  readonly name: string;
}

export interface StudioPublishHandoffRecord {
  readonly version: typeof VERSION;
  readonly id: string;
  readonly title: string;
  readonly sourceWorkId: string | null;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly pages: readonly StudioPublishHandoffPageRecord[];
}

export interface StudioPublishHandoffLoadedPage {
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
  readonly name: string;
}

export interface StudioPublishHandoffLoaded {
  readonly record: StudioPublishHandoffRecord;
  readonly pages: readonly StudioPublishHandoffLoadedPage[];
}

interface StudioPublishHandoffIndexEntry {
  readonly id: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

interface StudioPublishHandoffIndex {
  readonly version: typeof VERSION;
  readonly entries: readonly StudioPublishHandoffIndexEntry[];
}

export interface StudioPublishHandoffRepository {
  save(input: {
    readonly title: string;
    readonly sourceWorkId?: string | null;
    readonly pages: readonly StudioPublishHandoffPageInput[];
  }): Promise<StudioPublishHandoffRecord>;
  load(id: string): Promise<StudioPublishHandoffLoaded | null>;
  remove(id: string): Promise<void>;
  prune(): Promise<number>;
}

interface BrowserLockManagerLike {
  request<T>(
    name: string,
    options: { readonly mode: "exclusive" },
    callback: () => Promise<T>,
  ): Promise<T>;
}

interface StudioPublishHandoffRepositoryOptions {
  readonly acquireDatabase?: () => Promise<StudioLocalDatabase>;
  readonly acquireAssets?: () => Promise<StudioOpfsAssetStore>;
  readonly now?: () => number;
  readonly createId?: () => string;
  readonly runExclusive?: (<T>(task: () => Promise<T>) => Promise<T>) | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function normalizedId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id === value && /^[A-Za-z0-9_-]{8,128}$/u.test(id) ? id : null;
}

function normalizedOptionalId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id === value && id.length <= 160 ? id : null;
}

function normalizedTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim().slice(0, MAX_TITLE_LENGTH);
  return title || null;
}

function normalizedPageName(value: unknown, index: number): string {
  if (typeof value === "string") {
    const name = value.trim().slice(0, MAX_PAGE_NAME_LENGTH);
    if (name) return name;
  }
  return `page-${String(index + 1).padStart(2, "0")}.webp`;
}

function productRunExclusive(): (<T>(task: () => Promise<T>) => Promise<T>) | null {
  const locks = typeof navigator === "undefined"
    ? null
    : (navigator as Navigator & { locks?: BrowserLockManagerLike }).locks;
  if (!locks || typeof locks.request !== "function") return null;
  return <T>(task: () => Promise<T>) => locks.request(
    LOCK_NAME,
    { mode: "exclusive" },
    task,
  );
}

function ownerFor(id: string): string {
  return `${OWNER_PREFIX}${id}`;
}

function parsePageRecord(value: unknown, index: number): StudioPublishHandoffPageRecord | null {
  if (!isRecord(value)) return null;
  const hash = typeof value.hash === "string" && /^sha256:[0-9a-f]{64}$/u.test(value.hash)
    ? value.hash as StudioOpfsAssetRef["hash"]
    : null;
  const bytes = Number(value.bytes);
  const width = Number(value.width);
  const height = Number(value.height);
  const mime = typeof value.mime === "string" ? value.mime.trim().toLowerCase() : "";
  if (
    !hash
    || !Number.isSafeInteger(bytes)
    || bytes < 1
    || bytes > STUDIO_UPLOAD_MAX_SOURCE_FILE_BYTES
    || !SUPPORTED_MIME_TYPES.has(mime)
    || !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width < 1
    || height < 1
    || width * height > STUDIO_UPLOAD_DESKTOP_MAX_DECODED_PIXELS
  ) return null;
  return {
    hash,
    bytes,
    mime,
    width,
    height,
    name: normalizedPageName(value.name, index),
  };
}

function parseRecord(value: unknown): StudioPublishHandoffRecord | null {
  if (!isRecord(value) || value.version !== VERSION || !Array.isArray(value.pages)) return null;
  const id = normalizedId(value.id);
  const title = normalizedTitle(value.title);
  const sourceWorkId = normalizedOptionalId(value.sourceWorkId);
  if (
    !id
    || !title
    || !finiteTimestamp(value.createdAt)
    || !finiteTimestamp(value.expiresAt)
    || value.expiresAt <= value.createdAt
    || value.expiresAt - value.createdAt > STUDIO_PUBLISH_HANDOFF_TTL_MS
    || value.pages.length < 1
    || value.pages.length > STUDIO_PUBLISH_HANDOFF_MAX_PAGES
  ) return null;
  const pages = value.pages.map(parsePageRecord);
  if (pages.some((page) => page === null)) return null;
  const normalizedPages = pages as StudioPublishHandoffPageRecord[];
  const totalBytes = normalizedPages.reduce((sum, page) => sum + page.bytes, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes > STUDIO_UPLOAD_MAX_SOURCE_BATCH_BYTES) {
    return null;
  }
  return Object.freeze({
    version: VERSION,
    id,
    title,
    sourceWorkId,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    pages: Object.freeze(normalizedPages.map((page) => Object.freeze(page))),
  });
}

function parseIndex(raw: string | null): StudioPublishHandoffIndexEntry[] | null {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== VERSION || !Array.isArray(parsed.entries)) return null;
  const entries: StudioPublishHandoffIndexEntry[] = [];
  const seen = new Set<string>();
  for (const value of parsed.entries) {
    if (!isRecord(value)) return null;
    const id = normalizedId(value.id);
    if (
      !id
      || seen.has(id)
      || !finiteTimestamp(value.createdAt)
      || !finiteTimestamp(value.expiresAt)
      || value.expiresAt <= value.createdAt
    ) return null;
    seen.add(id);
    entries.push({ id, createdAt: value.createdAt, expiresAt: value.expiresAt });
  }
  return entries.sort((left, right) => left.createdAt - right.createdAt);
}

function serializeIndex(entries: readonly StudioPublishHandoffIndexEntry[]): string {
  const index: StudioPublishHandoffIndex = {
    version: VERSION,
    entries: entries.map((entry) => ({ ...entry })),
  };
  return JSON.stringify(index);
}

function assertPageInput(page: StudioPublishHandoffPageInput, index: number): StudioPublishHandoffPageInput {
  const bytes = Uint8Array.from(page.bytes);
  const mime = page.mime.trim().toLowerCase();
  const name = normalizedPageName(page.name, index);
  assertStudioUploadSourceBatch([{ name, size: bytes.byteLength, type: mime }]);
  const dimensions = assertStudioUploadDecodedPixels(
    parseStudioUploadImageDimensions(bytes),
    STUDIO_UPLOAD_DESKTOP_MAX_DECODED_PIXELS,
    name,
  );
  if (dimensions.width !== page.width || dimensions.height !== page.height) {
    throw new StudioPublishHandoffError(`${name} 이미지 크기 정보가 실제 바이트와 일치하지 않습니다.`);
  }
  if (!SUPPORTED_MIME_TYPES.has(mime)) {
    throw new StudioPublishHandoffError(`${name} 형식은 게시 인계에 사용할 수 없습니다.`);
  }
  return Object.freeze({ bytes, mime, width: page.width, height: page.height, name });
}

export function createStudioPublishHandoffRepository(
  options: StudioPublishHandoffRepositoryOptions = {},
): StudioPublishHandoffRepository {
  const acquireDatabase = options.acquireDatabase ?? acquireStudioLocalDatabase;
  const acquireAssets = options.acquireAssets ?? acquireProductStudioAssetCasStore;
  const now = options.now ?? Date.now;
  const createId = options.createId ?? (() => crypto.randomUUID());
  const runExclusive = options.runExclusive === undefined
    ? productRunExclusive()
    : options.runExclusive;
  let mutationTail: Promise<void> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const execute = () => runExclusive ? runExclusive(task) : task();
    const result = mutationTail.then(execute, execute);
    mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  async function resources(): Promise<{
    database: StudioLocalDatabase;
    assets: StudioOpfsAssetStore;
  }> {
    try {
      const [database, assets] = await Promise.all([acquireDatabase(), acquireAssets()]);
      return { database, assets };
    } catch (cause) {
      throw new StudioPublishHandoffError(
        "브라우저의 로컬 게시 인계 저장소를 열지 못했습니다. PNG로 내보낸 뒤 게시 화면에서 직접 추가해 주세요.",
        { cause },
      );
    }
  }

  async function resetCorruptIndex(
    database: StudioLocalDatabase,
    assets: StudioOpfsAssetStore,
  ): Promise<StudioPublishHandoffIndexEntry[]> {
    for (const owner of await assets.owners()) {
      if (owner.startsWith(OWNER_PREFIX)) await assets.setOwnerRefs(owner, []);
    }
    await database.kvSet(NAMESPACE, INDEX_KEY, serializeIndex([]));
    return [];
  }

  async function readIndex(
    database: StudioLocalDatabase,
    assets: StudioOpfsAssetStore,
  ): Promise<StudioPublishHandoffIndexEntry[]> {
    const parsed = parseIndex(await database.kvGet(NAMESPACE, INDEX_KEY));
    return parsed ?? resetCorruptIndex(database, assets);
  }

  async function cleanup(
    database: StudioLocalDatabase,
    assets: StudioOpfsAssetStore,
    id: string,
  ): Promise<void> {
    await database.kvDelete(NAMESPACE, id);
    await assets.setOwnerRefs(ownerFor(id), []);
  }

  async function pruneInternal(
    database: StudioLocalDatabase,
    assets: StudioOpfsAssetStore,
    timestamp: number,
    reserveSlots = 0,
  ): Promise<number> {
    const entries = await readIndex(database, assets);
    const survivors: StudioPublishHandoffIndexEntry[] = [];
    const removed: StudioPublishHandoffIndexEntry[] = [];
    for (const entry of entries) {
      const raw = entry.expiresAt > timestamp
        ? await database.kvGet(NAMESPACE, entry.id)
        : null;
      if (entry.expiresAt <= timestamp || raw === null) removed.push(entry);
      else survivors.push(entry);
    }
    const maximum = Math.max(0, MAX_ACTIVE_HANDOFFS - reserveSlots);
    while (survivors.length > maximum) removed.push(survivors.shift()!);
    for (const entry of removed) await cleanup(database, assets, entry.id);
    if (removed.length > 0 || survivors.length !== entries.length) {
      await database.kvSet(NAMESPACE, INDEX_KEY, serializeIndex(survivors));
    }
    return removed.length;
  }

  return {
    save(input) {
      return enqueue(async () => {
        const title = normalizedTitle(input.title) ?? "툰스튜디오 작품";
        if (
          input.pages.length < 1
          || input.pages.length > STUDIO_PUBLISH_HANDOFF_MAX_PAGES
        ) {
          throw new StudioPublishHandoffError(
            `게시 화면으로 보낼 페이지는 1장 이상 ${STUDIO_PUBLISH_HANDOFF_MAX_PAGES}장 이하여야 합니다.`,
          );
        }
        const pages = input.pages.map(assertPageInput);
        assertStudioUploadSourceBatch(pages.map((page) => ({
          name: page.name,
          size: page.bytes.byteLength,
          type: page.mime,
        })));
        const timestamp = now();
        if (!finiteTimestamp(timestamp)) {
          throw new StudioPublishHandoffError("게시 인계 시각을 확인하지 못했습니다.");
        }
        const id = normalizedId(createId());
        if (!id) throw new StudioPublishHandoffError("게시 인계 식별자를 만들지 못했습니다.");
        const { database, assets } = await resources();
        await pruneInternal(database, assets, timestamp, 1);

        const refs: StudioPublishHandoffPageRecord[] = [];
        try {
          for (const [index, page] of pages.entries()) {
            const stored = await assets.put(page.bytes, { mime: page.mime });
            const verified = await assets.get(stored.ref.hash, { verify: true });
            if (!verified || verified.byteLength !== page.bytes.byteLength) {
              throw new StudioPublishHandoffError(`${page.name} 게시 인계 파일을 검증하지 못했습니다.`);
            }
            refs.push({
              ...stored.ref,
              width: page.width,
              height: page.height,
              name: normalizedPageName(page.name, index),
            });
          }
          const record: StudioPublishHandoffRecord = Object.freeze({
            version: VERSION,
            id,
            title,
            sourceWorkId: normalizedOptionalId(input.sourceWorkId),
            createdAt: timestamp,
            expiresAt: timestamp + STUDIO_PUBLISH_HANDOFF_TTL_MS,
            pages: Object.freeze(refs.map((page) => Object.freeze(page))),
          });
          await assets.setOwnerRefs(ownerFor(id), refs.map((page) => page.hash));
          const entries = await readIndex(database, assets);
          await database.kvSet(NAMESPACE, INDEX_KEY, serializeIndex([
            ...entries.filter((entry) => entry.id !== id),
            { id, createdAt: record.createdAt, expiresAt: record.expiresAt },
          ]));
          await database.kvSet(NAMESPACE, id, JSON.stringify(record));
          return record;
        } catch (cause) {
          await cleanup(database, assets, id).catch(() => undefined);
          const entries = await readIndex(database, assets).catch(() => []);
          await database.kvSet(
            NAMESPACE,
            INDEX_KEY,
            serializeIndex(entries.filter((entry) => entry.id !== id)),
          ).catch(() => undefined);
          if (cause instanceof StudioPublishHandoffError) throw cause;
          throw new StudioPublishHandoffError(
            "게시 화면으로 보낼 원고를 로컬 저장소에 준비하지 못했습니다.",
            { cause },
          );
        }
      });
    },

    load(candidateId) {
      return enqueue(async () => {
        const id = normalizedId(candidateId);
        if (!id) return null;
        const timestamp = now();
        const { database, assets } = await resources();
        await pruneInternal(database, assets, timestamp);
        const raw = await database.kvGet(NAMESPACE, id);
        if (raw === null) {
          await assets.setOwnerRefs(ownerFor(id), []);
          return null;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          await cleanup(database, assets, id);
          throw new StudioPublishHandoffError("게시 인계 정보가 손상되어 다시 준비해야 합니다.");
        }
        const record = parseRecord(parsed);
        if (!record || record.id !== id || record.expiresAt <= timestamp) {
          await cleanup(database, assets, id);
          throw new StudioPublishHandoffError("게시 인계 정보가 만료되었거나 손상되었습니다. 편집기에서 다시 보내 주세요.");
        }
        const loadedPages: StudioPublishHandoffLoadedPage[] = [];
        try {
          for (const page of record.pages) {
            const bytes = await assets.get(page.hash, { verify: true });
            if (!bytes || bytes.byteLength !== page.bytes) {
              throw new StudioPublishHandoffError(`${page.name} 원고 파일이 없거나 손상되었습니다.`);
            }
            const dimensions = parseStudioUploadImageDimensions(bytes);
            if (dimensions.width !== page.width || dimensions.height !== page.height) {
              throw new StudioPublishHandoffError(`${page.name} 원고 크기 정보가 손상되었습니다.`);
            }
            loadedPages.push(Object.freeze({
              bytes: Uint8Array.from(bytes),
              mime: page.mime,
              width: page.width,
              height: page.height,
              name: page.name,
            }));
          }
        } catch (cause) {
          await cleanup(database, assets, id);
          if (cause instanceof StudioPublishHandoffError) throw cause;
          throw new StudioPublishHandoffError("게시 인계 원고를 검증하지 못했습니다.", { cause });
        }
        const entries = await readIndex(database, assets);
        if (!entries.some((entry) => entry.id === id)) {
          await database.kvSet(NAMESPACE, INDEX_KEY, serializeIndex([
            ...entries,
            { id, createdAt: record.createdAt, expiresAt: record.expiresAt },
          ]));
        }
        return Object.freeze({ record, pages: Object.freeze(loadedPages) });
      });
    },

    remove(candidateId) {
      return enqueue(async () => {
        const id = normalizedId(candidateId);
        if (!id) return;
        const { database, assets } = await resources();
        await cleanup(database, assets, id);
        const entries = await readIndex(database, assets);
        await database.kvSet(
          NAMESPACE,
          INDEX_KEY,
          serializeIndex(entries.filter((entry) => entry.id !== id)),
        );
      });
    },

    prune() {
      return enqueue(async () => {
        const { database, assets } = await resources();
        return pruneInternal(database, assets, now());
      });
    },
  };
}

let productRepository: StudioPublishHandoffRepository | null = null;

export function acquireStudioPublishHandoffRepository(): StudioPublishHandoffRepository {
  productRepository ??= createStudioPublishHandoffRepository();
  return productRepository;
}

function safePageBaseName(value: string, index: number): string {
  const stripped = value.replace(/\.[^.]+$/u, "").trim();
  const safe = Array.from(stripped)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 0x20 && !"\\/:*?\"<>|".includes(character);
    })
    .join("")
    .trim()
    .slice(0, 120);
  return safe || `page-${String(index + 1).padStart(2, "0")}`;
}

async function encodePublishCanvas(
  source: HTMLCanvasElement,
  name: string,
  index: number,
): Promise<StudioPublishHandoffPageInput> {
  if (source.width < 1 || source.height < 1) {
    throw new StudioPublishHandoffError("비어 있는 캔버스는 게시 화면으로 보낼 수 없습니다.");
  }
  const scale = Math.min(1, MAX_DIMENSION / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = scale === 1 ? source : document.createElement("canvas");
  if (scale !== 1) {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new StudioPublishHandoffError("게시용 원고 캔버스를 만들지 못했습니다.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, width, height);
  }
  let blob: Blob;
  let extension: "webp" | "png" = "webp";
  try {
    blob = await canvasToBlob(canvas, "image/webp", WEBP_QUALITY);
  } catch {
    blob = await canvasToBlob(canvas, "image/png");
    extension = "png";
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const fileName = `${safePageBaseName(name, index)}.${extension}`;
  assertStudioUploadSourceBatch([{ name: fileName, size: bytes.byteLength, type: blob.type }]);
  return Object.freeze({ bytes, mime: blob.type, width, height, name: fileName });
}

export async function prepareStudioPublishHandoffFromCanvases(input: {
  readonly title: string;
  readonly sourceWorkId?: string | null;
  readonly canvases: readonly HTMLCanvasElement[];
  readonly pageNames?: readonly string[];
  readonly repository?: StudioPublishHandoffRepository;
}): Promise<StudioPublishHandoffRecord> {
  if (
    input.canvases.length < 1
    || input.canvases.length > STUDIO_PUBLISH_HANDOFF_MAX_PAGES
  ) {
    throw new StudioPublishHandoffError(
      `게시 화면으로 보낼 페이지는 1장 이상 ${STUDIO_PUBLISH_HANDOFF_MAX_PAGES}장 이하여야 합니다.`,
    );
  }
  const pages: StudioPublishHandoffPageInput[] = [];
  for (const [index, canvas] of input.canvases.entries()) {
    pages.push(await encodePublishCanvas(
      canvas,
      input.pageNames?.[index] ?? `page-${index + 1}`,
      index,
    ));
  }
  return (input.repository ?? acquireStudioPublishHandoffRepository()).save({
    title: input.title,
    sourceWorkId: input.sourceWorkId,
    pages,
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new StudioPublishHandoffError("게시 인계 원고를 읽지 못했습니다."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export async function loadStudioPublishHandoffAsUploadPages(
  id: string,
  repository: StudioPublishHandoffRepository = acquireStudioPublishHandoffRepository(),
): Promise<{
  readonly title: string;
  readonly sourceWorkId: string | null;
  readonly pages: readonly {
    readonly src: string;
    readonly width: number;
    readonly height: number;
    readonly name: string;
  }[];
} | null> {
  const loaded = await repository.load(id);
  if (!loaded) return null;
  const pages = [];
  for (const page of loaded.pages) {
    pages.push(Object.freeze({
      src: await blobToDataUrl(new Blob([Uint8Array.from(page.bytes)], { type: page.mime })),
      width: page.width,
      height: page.height,
      name: page.name,
    }));
  }
  return Object.freeze({
    title: loaded.record.title,
    sourceWorkId: loaded.record.sourceWorkId,
    pages: Object.freeze(pages),
  });
}

export function studioPublishHandoffHref(
  id: string,
  sourceWorkId?: string | null,
): string {
  const normalized = normalizedId(id);
  if (!normalized) throw new StudioPublishHandoffError("게시 인계 식별자가 올바르지 않습니다.");
  const workId = normalizedOptionalId(sourceWorkId);
  const base = workId
    ? `/studio/work/${encodeURIComponent(workId)}/publish`
    : "/studio/publish";
  return `${base}?handoff=${encodeURIComponent(normalized)}`;
}
