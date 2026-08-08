import {
  readStudioAutosave,
  serializeStudioAutosave,
  studioAutosaveHasContent,
  studioLifecycleAutosaveSidecarKey,
  type StudioAutosavePayload,
  type StudioAutosaveStorage,
} from "./studio-autosave";
import {
  selectStudioOpfsFileSystem,
  type StudioOpfsStorageManagerLike,
} from "./studio-opfs-filesystem";
import {
  createStudioOpfsRecoveryJournal,
  createStudioOpfsRecoveryJournalAdapter,
  type StudioOpfsRecoveryEntry,
  type StudioOpfsRecoveryJournalIdentity,
  type StudioOpfsRecoveryScan,
  type StudioOpfsRecoveryWriterLease,
} from "./studio-opfs-recovery-journal";
import { sha256HexPortable } from "./studio-sha256";

export const STUDIO_AUTOSAVE_OPFS_ENVELOPE_KIND =
  "toonspectrum:studio-autosave-opfs-checkpoint" as const;
export const STUDIO_AUTOSAVE_OPFS_ENVELOPE_VERSION = 1 as const;
export const STUDIO_AUTOSAVE_OPFS_ENGINE_VERSION = "studio-autosave-v2" as const;

const AUTOSAVE_PAGE_ID = "document";
const AUTOSAVE_ROOT_NAME = "toonspectrum-studio-autosave-v3";
const MAX_AUTOSAVE_BYTES = 256 * 1024 * 1024;
const MAX_AUTOSAVE_JOURNAL_BYTES = 1024 * 1024 * 1024;
const WRITER_RENEW_WINDOW_MS = 5_000;
const SHA_256_HEX = /^[a-f0-9]{64}$/u;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

type StudioAutosaveOpfsEnvelope = Readonly<{
  kind: typeof STUDIO_AUTOSAVE_OPFS_ENVELOPE_KIND;
  version: typeof STUDIO_AUTOSAVE_OPFS_ENVELOPE_VERSION;
  state: "snapshot" | "cleared";
  savedAt: string;
  autosaveKeyDigest: string;
  payloadDigest: string | null;
  payload: string | null;
}>;

export type StudioAutosaveOpfsReadResult =
  | Readonly<{
      state: "snapshot";
      savedAt: string;
      payload: StudioAutosavePayload;
      sequence: number;
      revision: number;
    }>
  | Readonly<{
      state: "cleared";
      savedAt: string;
      sequence: number;
      revision: number;
    }>
  | null;

export type StudioAutosavePersistenceReceipt = Readonly<{
  authority: "opfs-journal" | "browser-storage-fallback";
  savedAt: string;
  sequence: number | null;
  revision: number | null;
}>;

export type StudioAutosaveReconciliation = Readonly<{
  candidate: Readonly<{ key: string; payload: StudioAutosavePayload }> | null;
  authority: "opfs-journal" | "browser-storage-fallback";
  migratedToOpfs: boolean;
}>;

export interface StudioAutosaveOpfsJournalPort {
  scan(options?: { readonly signal?: AbortSignal }): Promise<StudioOpfsRecoveryScan>;
  readPayload(
    entry: StudioOpfsRecoveryEntry,
    options?: { readonly signal?: AbortSignal },
  ): AsyncIterable<Uint8Array>;
  acquireWriter(input: {
    readonly ownerId: string;
    readonly signal?: AbortSignal;
  }): Promise<StudioOpfsRecoveryWriterLease>;
  renewWriter(
    writer: StudioOpfsRecoveryWriterLease,
    options?: { readonly signal?: AbortSignal },
  ): Promise<StudioOpfsRecoveryWriterLease>;
  releaseWriter(
    writer: StudioOpfsRecoveryWriterLease,
    options?: { readonly signal?: AbortSignal },
  ): Promise<void>;
  appendCheckpoint(
    writer: StudioOpfsRecoveryWriterLease,
    input: {
      readonly id: string;
      readonly pageId: string;
      readonly revision: number;
      readonly payload: Uint8Array;
      readonly byteLength: number;
      readonly createdAt: number;
      readonly compactThroughSequence: number;
    },
    options?: { readonly signal?: AbortSignal },
  ): Promise<StudioOpfsRecoveryEntry>;
  evictObsolete(
    writer: StudioOpfsRecoveryWriterLease,
    options?: { readonly signal?: AbortSignal },
  ): Promise<unknown>;
}

export interface StudioAutosaveOpfsSessionOptions {
  readonly autosaveKey: string;
  readonly journal: StudioAutosaveOpfsJournalPort;
  readonly ownerId: string;
  readonly now?: () => number;
}

interface StudioAutosaveBrowserScope {
  readonly navigator?: {
    readonly storage?: Partial<StudioOpfsStorageManagerLike>;
    readonly locks?: {
      request<T>(
        name: string,
        options: { readonly mode: "exclusive"; readonly signal?: AbortSignal },
        callback: () => Promise<T>,
      ): Promise<T>;
    };
  };
  readonly localStorage?: Storage;
  readonly crypto?: {
    readonly randomUUID?: () => string;
  };
}

function isPlainExactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  return (
    ownKeys.length === keys.length
    && ownKeys.every((key) => typeof key === "string")
    && keys.every((key) => {
      const descriptor = descriptors[key];
      return descriptor !== undefined
        && descriptor.enumerable
        && "value" in descriptor
        && descriptor.get === undefined
        && descriptor.set === undefined;
    })
  );
}

function validSavedAt(value: unknown): value is string {
  return (
    typeof value === "string"
    && value.length >= 20
    && value.length <= 64
    && Number.isFinite(Date.parse(value))
  );
}

function autosaveKeyDigest(autosaveKey: string): string {
  return sha256HexPortable(TEXT_ENCODER.encode(autosaveKey));
}

function encodeStudioAutosaveOpfsEnvelope(
  autosaveKey: string,
  state: "snapshot" | "cleared",
  savedAt: string,
  payload: StudioAutosavePayload | null,
): Uint8Array {
  if (!validSavedAt(savedAt)) {
    throw new Error("OPFS 자동저장 시각이 올바르지 않습니다.");
  }
  const serialized = payload === null ? null : serializeStudioAutosave(payload);
  const payloadDigest = serialized === null
    ? null
    : sha256HexPortable(TEXT_ENCODER.encode(serialized));
  return TEXT_ENCODER.encode(JSON.stringify({
    kind: STUDIO_AUTOSAVE_OPFS_ENVELOPE_KIND,
    version: STUDIO_AUTOSAVE_OPFS_ENVELOPE_VERSION,
    state,
    savedAt,
    autosaveKeyDigest: autosaveKeyDigest(autosaveKey),
    payloadDigest,
    payload: serialized,
  } satisfies StudioAutosaveOpfsEnvelope));
}

function decodeStudioAutosaveOpfsEnvelope(
  autosaveKey: string,
  bytes: Uint8Array,
): StudioAutosaveOpfsEnvelope {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUTOSAVE_BYTES) {
    throw new Error("OPFS 자동저장 checkpoint 크기가 허용 범위를 벗어났습니다.");
  }
  let value: unknown;
  try {
    value = JSON.parse(TEXT_DECODER.decode(bytes));
  } catch {
    throw new Error("OPFS 자동저장 checkpoint가 올바른 UTF-8 JSON이 아닙니다.");
  }
  if (!isPlainExactRecord(value, [
    "kind",
    "version",
    "state",
    "savedAt",
    "autosaveKeyDigest",
    "payloadDigest",
    "payload",
  ])) {
    throw new Error("OPFS 자동저장 checkpoint 스키마가 올바르지 않습니다.");
  }
  if (
    value.kind !== STUDIO_AUTOSAVE_OPFS_ENVELOPE_KIND
    || value.version !== STUDIO_AUTOSAVE_OPFS_ENVELOPE_VERSION
    || (value.state !== "snapshot" && value.state !== "cleared")
    || !validSavedAt(value.savedAt)
    || typeof value.autosaveKeyDigest !== "string"
    || !SHA_256_HEX.test(value.autosaveKeyDigest)
    || value.autosaveKeyDigest !== autosaveKeyDigest(autosaveKey)
  ) {
    throw new Error("OPFS 자동저장 checkpoint identity가 일치하지 않습니다.");
  }
  if (value.state === "cleared") {
    if (value.payload !== null || value.payloadDigest !== null) {
      throw new Error("삭제된 OPFS 자동저장 checkpoint에 payload가 남아 있습니다.");
    }
  } else {
    if (
      typeof value.payload !== "string"
      || typeof value.payloadDigest !== "string"
      || !SHA_256_HEX.test(value.payloadDigest)
      || sha256HexPortable(TEXT_ENCODER.encode(value.payload)) !== value.payloadDigest
    ) {
      throw new Error("OPFS 자동저장 payload 무결성 검증에 실패했습니다.");
    }
    const parsed = JSON.parse(value.payload) as unknown;
    if (
      typeof parsed !== "object"
      || parsed === null
      || !Array.isArray((parsed as { readonly pagesList?: unknown }).pagesList)
    ) {
      throw new Error("OPFS 자동저장 payload가 Studio 문서가 아닙니다.");
    }
  }
  return Object.freeze(value as unknown as StudioAutosaveOpfsEnvelope);
}

async function collectEntryBytes(
  journal: StudioAutosaveOpfsJournalPort,
  entry: StudioOpfsRecoveryEntry,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (
    !Number.isSafeInteger(entry.byteLength)
    || entry.byteLength <= 0
    || entry.byteLength > MAX_AUTOSAVE_BYTES
  ) {
    throw new Error("OPFS 자동저장 entry 크기가 허용 범위를 벗어났습니다.");
  }
  const output = new Uint8Array(entry.byteLength);
  let offset = 0;
  for await (const chunk of journal.readPayload(entry, { signal })) {
    if (!(chunk instanceof Uint8Array) || offset + chunk.byteLength > output.byteLength) {
      throw new Error("OPFS 자동저장 entry chunk 경계가 손상되었습니다.");
    }
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (offset !== output.byteLength) {
    throw new Error("OPFS 자동저장 entry가 부분적으로만 복원되었습니다.");
  }
  return output;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function journalIdentity(autosaveKey: string): StudioOpfsRecoveryJournalIdentity {
  return Object.freeze({
    documentId: `autosave-${autosaveKeyDigest(autosaveKey).slice(0, 48)}`,
    documentVersion: 2,
    engineVersion: STUDIO_AUTOSAVE_OPFS_ENGINE_VERSION,
  });
}

function latestDocumentEntry(scan: StudioOpfsRecoveryScan): StudioOpfsRecoveryEntry | null {
  let latest: StudioOpfsRecoveryEntry | null = null;
  for (const entry of scan.entries) {
    if (entry.pageId !== AUTOSAVE_PAGE_ID) continue;
    if (latest === null || entry.sequence > latest.sequence) latest = entry;
  }
  return latest;
}

export class StudioAutosaveOpfsSession {
  readonly #autosaveKey: string;
  readonly #journal: StudioAutosaveOpfsJournalPort;
  readonly #ownerId: string;
  readonly #now: () => number;
  #writer: StudioOpfsRecoveryWriterLease | null = null;
  #tail: Promise<void> = Promise.resolve();
  #disposed = false;

  constructor(options: StudioAutosaveOpfsSessionOptions) {
    if (options.autosaveKey.trim().length === 0 || options.ownerId.trim().length === 0) {
      throw new Error("OPFS 자동저장 세션 identity가 비어 있습니다.");
    }
    this.#autosaveKey = options.autosaveKey;
    this.#journal = options.journal;
    this.#ownerId = options.ownerId;
    this.#now = options.now ?? Date.now;
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#disposed) {
      return Promise.reject(new Error("OPFS 자동저장 세션이 이미 종료되었습니다."));
    }
    const result = this.#tail.then(operation);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async #ensureWriter(signal?: AbortSignal): Promise<StudioOpfsRecoveryWriterLease> {
    const now = this.#now();
    if (this.#writer && this.#writer.expiresAt > now + WRITER_RENEW_WINDOW_MS) {
      return this.#writer;
    }
    if (this.#writer && this.#writer.expiresAt > now) {
      this.#writer = await this.#journal.renewWriter(this.#writer, { signal });
      return this.#writer;
    }
    this.#writer = await this.#journal.acquireWriter({
      ownerId: this.#ownerId,
      signal,
    });
    return this.#writer;
  }

  async #readLatestUnlocked(signal?: AbortSignal): Promise<StudioAutosaveOpfsReadResult> {
    const scan = await this.#journal.scan({ signal });
    const entry = latestDocumentEntry(scan);
    if (!entry) return null;
    const envelope = decodeStudioAutosaveOpfsEnvelope(
      this.#autosaveKey,
      await collectEntryBytes(this.#journal, entry, signal),
    );
    if (envelope.state === "cleared") {
      return Object.freeze({
        state: "cleared",
        savedAt: envelope.savedAt,
        sequence: entry.sequence,
        revision: entry.revision,
      });
    }
    const payload = JSON.parse(envelope.payload as string) as unknown;
    const serializedPayload = serializeStudioAutosave(payload as StudioAutosavePayload);
    const normalized = readStudioAutosave(
      {
        getItem: (candidate) =>
          candidate === this.#autosaveKey ? serializedPayload : null,
      },
      this.#autosaveKey,
    )?.payload ?? null;
    if (!normalized || !studioAutosaveHasContent(normalized)) {
      throw new Error("OPFS 자동저장 checkpoint에 복구할 Studio 내용이 없습니다.");
    }
    return Object.freeze({
      state: "snapshot",
      savedAt: envelope.savedAt,
      payload: normalized,
      sequence: entry.sequence,
      revision: entry.revision,
    });
  }

  readLatest(signal?: AbortSignal): Promise<StudioAutosaveOpfsReadResult> {
    return this.#enqueue(() => this.#readLatestUnlocked(signal));
  }

  #writeEnvelope(
    state: "snapshot" | "cleared",
    savedAt: string,
    payload: StudioAutosavePayload | null,
    signal?: AbortSignal,
  ): Promise<StudioAutosavePersistenceReceipt> {
    return this.#enqueue(async () => {
      const scan = await this.#journal.scan({ signal });
      const current = latestDocumentEntry(scan);
      const revision = (current?.revision ?? 0) + 1;
      if (!Number.isSafeInteger(revision) || revision < 1) {
        throw new Error("OPFS 자동저장 revision 한도를 초과했습니다.");
      }
      const bytes = encodeStudioAutosaveOpfsEnvelope(
        this.#autosaveKey,
        state,
        savedAt,
        payload,
      );
      const digest = sha256HexPortable(bytes);
      const writer = await this.#ensureWriter(signal);
      const entry = await this.#journal.appendCheckpoint(writer, {
        id: `autosave-${revision}-${digest.slice(0, 12)}`,
        pageId: AUTOSAVE_PAGE_ID,
        revision,
        payload: bytes,
        byteLength: bytes.byteLength,
        createdAt: timestamp(savedAt),
        compactThroughSequence: scan.lastSequence,
      }, { signal });
      await this.#journal.evictObsolete(writer, { signal });
      return Object.freeze({
        authority: "opfs-journal",
        savedAt,
        sequence: entry.sequence,
        revision: entry.revision,
      });
    });
  }

  write(
    payload: StudioAutosavePayload,
    signal?: AbortSignal,
  ): Promise<StudioAutosavePersistenceReceipt> {
    if (!studioAutosaveHasContent(payload)) {
      return Promise.reject(new Error("내용이 없는 Studio 자동저장은 OPFS에 기록하지 않습니다."));
    }
    return this.#writeEnvelope("snapshot", payload.savedAt, payload, signal);
  }

  clear(
    savedAt = new Date(this.#now()).toISOString(),
    signal?: AbortSignal,
  ): Promise<StudioAutosavePersistenceReceipt> {
    return this.#writeEnvelope("cleared", savedAt, null, signal);
  }

  async flush(): Promise<void> {
    await this.#tail;
    await this.#journal.scan();
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    await this.#tail;
    const writer = this.#writer;
    this.#writer = null;
    this.#disposed = true;
    if (!writer) return;
    try {
      await this.#journal.releaseWriter(writer);
    } catch {
      // An expired or replaced lease already prevents future writes; disposal is best-effort.
    }
  }
}

export async function createStudioAutosaveOpfsSession(
  autosaveKey: string,
  scope: StudioAutosaveBrowserScope =
    globalThis as unknown as StudioAutosaveBrowserScope,
): Promise<StudioAutosaveOpfsSession | null> {
  const lockManager = scope.navigator?.locks ?? null;
  if (!lockManager || typeof lockManager.request !== "function") return null;
  const selection = await selectStudioOpfsFileSystem(scope, {
    rootName: AUTOSAVE_ROOT_NAME,
  });
  if (selection.kind !== "opfs") return null;
  const identity = journalIdentity(autosaveKey);
  const journal = createStudioOpfsRecoveryJournal({
    identity,
    adapter: createStudioOpfsRecoveryJournalAdapter({
      fileSystem: selection.fs,
      lockManager,
      quotaEstimator: scope.navigator?.storage?.estimate
        ? {
            estimate: () => scope.navigator!.storage!.estimate!(),
          }
        : null,
    }),
    limits: {
      maxEntryBytes: MAX_AUTOSAVE_BYTES,
      maxJournalBytes: MAX_AUTOSAVE_JOURNAL_BYTES,
      maxEntries: 16,
      maxCheckpoints: 8,
    },
  });
  const randomId = scope.crypto?.randomUUID?.() ?? autosaveKeyDigest(
    `${autosaveKey}:${Date.now()}`,
  ).slice(0, 32);
  return new StudioAutosaveOpfsSession({
    autosaveKey,
    journal,
    ownerId: `autosave-${randomId}`,
  });
}

export async function persistStudioAutosaveWithOpfsPrimary(input: {
  readonly session: StudioAutosaveOpfsSession | null;
  readonly storage: StudioAutosaveStorage;
  readonly key: string;
  readonly payload: StudioAutosavePayload;
  readonly signal?: AbortSignal;
  /**
   * 내구 저널 쓰기가 실패해 브라우저 저장소로 강등될 때 호출된다. 강등 자체는 정상
   * 폴백이지만 **내구성이 낮아졌다는 사실**은 사용자에게 닿아야 한다(V5 숨은 실패 금지).
   * 관측자가 던져도 폴백 저장은 계속된다.
   */
  readonly onDurableAuthorityDegraded?: (cause: unknown) => void;
}): Promise<StudioAutosavePersistenceReceipt> {
  if (input.session) {
    try {
      const receipt = await input.session.write(input.payload, input.signal);
      input.storage.setItem(input.key, serializeStudioAutosave(input.payload));
      input.storage.removeItem(studioLifecycleAutosaveSidecarKey(input.key));
      return receipt;
    } catch (cause: unknown) {
      // The synchronous browser slot remains a bounded compatibility and lifecycle fallback.
      try {
        input.onDurableAuthorityDegraded?.(cause);
      } catch {
        // 관측자 격리 — 고지 실패가 폴백 저장을 막지 않는다.
      }
    }
  }
  input.storage.setItem(input.key, serializeStudioAutosave(input.payload));
  input.storage.removeItem(studioLifecycleAutosaveSidecarKey(input.key));
  return Object.freeze({
    authority: "browser-storage-fallback",
    savedAt: input.payload.savedAt,
    sequence: null,
    revision: null,
  });
}

export async function reconcileStudioAutosaveWithOpfsPrimary(input: {
  readonly session: StudioAutosaveOpfsSession | null;
  readonly storage: StudioAutosaveStorage;
  readonly key: string;
  readonly allowLegacy?: boolean;
  readonly signal?: AbortSignal;
}): Promise<StudioAutosaveReconciliation> {
  const local = readStudioAutosave(
    input.storage,
    input.key,
    input.allowLegacy ?? false,
  );
  if (!input.session) {
    return Object.freeze({
      candidate: local,
      authority: "browser-storage-fallback",
      migratedToOpfs: false,
    });
  }
  let durable: StudioAutosaveOpfsReadResult;
  try {
    durable = await input.session.readLatest(input.signal);
  } catch {
    return Object.freeze({
      candidate: local,
      authority: "browser-storage-fallback",
      migratedToOpfs: false,
    });
  }
  const localTime = local ? timestamp(local.payload.savedAt) : -1;
  const durableTime = durable ? timestamp(durable.savedAt) : -1;
  if (durable?.state === "cleared" && durableTime >= localTime) {
    input.storage.removeItem(input.key);
    input.storage.removeItem(studioLifecycleAutosaveSidecarKey(input.key));
    return Object.freeze({
      candidate: null,
      authority: "opfs-journal",
      migratedToOpfs: false,
    });
  }
  if (durable?.state === "snapshot" && durableTime >= localTime) {
    input.storage.setItem(input.key, serializeStudioAutosave(durable.payload));
    input.storage.removeItem(studioLifecycleAutosaveSidecarKey(input.key));
    return Object.freeze({
      candidate: Object.freeze({ key: input.key, payload: durable.payload }),
      authority: "opfs-journal",
      migratedToOpfs: false,
    });
  }
  if (local) {
    try {
      await input.session.write(local.payload, input.signal);
      return Object.freeze({
        candidate: local,
        authority: "opfs-journal",
        migratedToOpfs: true,
      });
    } catch {
      return Object.freeze({
        candidate: local,
        authority: "browser-storage-fallback",
        migratedToOpfs: false,
      });
    }
  }
  return Object.freeze({
    candidate: null,
    authority: "opfs-journal",
    migratedToOpfs: false,
  });
}
