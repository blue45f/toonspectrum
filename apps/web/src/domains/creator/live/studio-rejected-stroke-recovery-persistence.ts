import { isCompleteStudioDrawOp } from "../brush/studio-draw-completion";
import { snapshotStudioRejectedStroke } from "../studio-rejected-stroke-recovery";

import type { DrawEl } from "../studio-element-model";
import type { StudioAsyncKeyValueStore, StudioLocalDatabase } from "../studio-local-database";
import type { StudioRejectedStrokeRecord } from "../studio-rejected-stroke-recovery";

export const STUDIO_REJECTED_STROKE_RECOVERY_NAMESPACE = "studio-rejected-stroke-recovery-v1";

export interface StudioRejectedStrokeRecoveryScope {
  readonly ownerId: string | null;
  readonly documentKey: string;
  readonly projectId?: string | null;
  readonly documentId?: string | null;
}

/** 수정할 때마다 증가하는 메모리 세대는 키에 넣지 않는다. 재시작 뒤에도 같은 문서를 찾는다. */
export function studioRejectedStrokeRecoveryScopeKey(scope: StudioRejectedStrokeRecoveryScope): string {
  if (!scope.documentKey.trim()) throw new Error("복구 원본의 문서 식별자가 비어 있습니다.");
  return JSON.stringify([scope.ownerId, scope.documentKey, scope.projectId ?? null, scope.documentId ?? null]);
}

export interface StudioRejectedStrokeRecoveryRepository {
  load(scopeKey: string): Promise<readonly StudioRejectedStrokeRecord[]>;
  save(record: StudioRejectedStrokeRecord): Promise<void>;
  delete(record: StudioRejectedStrokeRecord): Promise<void>;
  confirmRestored(record: StudioRejectedStrokeRecord): Promise<boolean>;
}

type ExclusiveRunner = <T>(scopeKey: string, operation: () => Promise<T>) => Promise<T>;
const localWriteTails = new Map<string, Promise<void>>();

async function runExclusive<T>(scopeKey: string, operation: () => Promise<T>): Promise<T> {
  const key = `${STUDIO_REJECTED_STROKE_RECOVERY_NAMESPACE}:${scopeKey}`;
  const previous = localWriteTails.get(key) ?? Promise.resolve();
  const next = previous.then(() => {
    const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
    return locks ? locks.request(key, { mode: "exclusive" }, operation) : operation();
  });
  const tail = next.then(() => undefined, () => undefined);
  localWriteTails.set(key, tail);
  void tail.then(() => {
    if (localWriteTails.get(key) === tail) localWriteTails.delete(key);
  });
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validNumbers(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function validJson(value: unknown, depth = 0): boolean {
  if (depth > 64) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => validJson(item, depth + 1));
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([key, item]) => (
    key !== "__proto__" && key !== "constructor" && key !== "prototype" && validJson(item, depth + 1)
  ));
}

/** 원본의 선택 필드는 그대로 보존하되 좌표·필압과 기본 렌더 계약이 손상되면 읽기를 중단한다. */
function isRecoveredDraw(value: unknown): value is DrawEl {
  if (!isRecord(value) || !validJson(value)) return false;
  if (
    value.type !== "draw" || !nonEmptyString(value.id) || !nonEmptyString(value.stroke)
    || typeof value.strokeWidth !== "number" || !Number.isFinite(value.strokeWidth) || value.strokeWidth <= 0
    || !validNumbers(value.points) || value.points.length < 2 || value.points.length % 2 !== 0
    || (value.mode !== undefined && value.mode !== "pen" && value.mode !== "eraser")
    || (value.kind !== undefined && ![
      "freehand", "line", "rect", "ellipse", "star", "arrow", "triangle", "polygon",
    ].includes(String(value.kind)))
  ) return false;
  for (const channel of [
    "pressures", "tiltXs", "tiltYs", "twists", "speeds", "tangentialPressures",
    "altitudeAngles", "azimuthAngles", "contactWidths", "contactHeights", "sampleTimeOffsets",
  ]) {
    if (value[channel] !== undefined && !validNumbers(value[channel])) return false;
  }
  return true;
}

function parseRecord(value: unknown, scopeKey: string): StudioRejectedStrokeRecord {
  if (
    !isRecord(value) || value.scopeKey !== scopeKey || !nonEmptyString(value.id)
    || !nonEmptyString(value.pageId) || !nonEmptyString(value.provider) || !nonEmptyString(value.reason)
    || !Number.isSafeInteger(value.sourceGeneration) || Number(value.sourceGeneration) < 0
    || !nonEmptyString(value.restoredStrokeId) || value.restoredStrokeId === value.id
    || (value.admissionCheckpoint !== undefined && value.admissionCheckpoint !== true)
    || typeof value.at !== "number" || !Number.isFinite(value.at) || value.at < 0
    || !isRecoveredDraw(value.stroke) || value.stroke.id !== value.id || !isCompleteStudioDrawOp(value.stroke)
  ) throw new Error("실패 획 복구 원본의 형식 또는 문서 경계가 올바르지 않습니다.");
  return Object.freeze({
    id: value.id,
    pageId: value.pageId,
    provider: value.provider,
    reason: value.reason,
    at: value.at,
    scopeKey,
    sourceGeneration: Number(value.sourceGeneration),
    restoredStrokeId: value.restoredStrokeId,
    ...(value.admissionCheckpoint === true ? { admissionCheckpoint: true as const } : {}),
    stroke: snapshotStudioRejectedStroke(value.stroke),
    durability: "saved",
  });
}

export function parseStudioRejectedStrokeRecovery(
  raw: string | null,
  scopeKey: string,
): readonly StudioRejectedStrokeRecord[] {
  if (raw === null) return Object.freeze([]);
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || value.version !== 1 || value.scopeKey !== scopeKey || !Array.isArray(value.records)) {
    throw new Error("실패 획 복구 저장 형식이 손상되었거나 지원하지 않는 버전입니다.");
  }
  const records = value.records.map((record) => parseRecord(record, scopeKey));
  if (new Set(records.map((record) => record.id)).size !== records.length) {
    throw new Error("실패 획 복구 원본에 중복 식별자가 있습니다.");
  }
  return Object.freeze(records.sort((left, right) => right.at - left.at));
}

function serialize(scopeKey: string, records: readonly StudioRejectedStrokeRecord[]): string {
  return JSON.stringify({
    version: 1,
    scopeKey,
    records: records.map(({ durability: _durability, storageError: _error, ...record }) => record),
  });
}

export function createStudioRejectedStrokeRecoveryRepository(
  store: StudioAsyncKeyValueStore,
  options: Readonly<{
    runExclusive?: ExclusiveRunner;
    isRestoredStrokeDurable?: (record: StudioRejectedStrokeRecord) => Promise<boolean>;
  }> = {},
): StudioRejectedStrokeRecoveryRepository {
  const exclusive = options.runExclusive ?? runExclusive;
  const load = async (scopeKey: string) => parseStudioRejectedStrokeRecovery(await store.get(scopeKey), scopeKey);
  const remove = async (record: StudioRejectedStrokeRecord) => {
    if (!record.scopeKey) throw new Error("복구 원본의 문서 경계가 없습니다.");
    const scopeKey = record.scopeKey;
    await exclusive(scopeKey, async () => {
      const current = await load(scopeKey);
      const next = current.filter((candidate) => candidate.id !== record.id);
      if (next.length !== current.length) await store.set(scopeKey, serialize(scopeKey, next));
    });
  };
  return {
    async load(scopeKey) {
      const current = await load(scopeKey);
      const retained: StudioRejectedStrokeRecord[] = [];
      for (const record of current) {
        if (options.isRestoredStrokeDurable && await options.isRestoredStrokeDurable(record)) await remove(record);
        else retained.push(record);
      }
      return Object.freeze(retained);
    },
    async save(record) {
      if (!record.scopeKey) throw new Error("복구 원본의 문서 경계가 없습니다.");
      const scopeKey = record.scopeKey;
      // 직렬화 왕복 검증은 undefined 선택 필드를 제거할 뿐 좌표나 브러시를 정규화하지 않는다.
      const detached = parseStudioRejectedStrokeRecovery(serialize(scopeKey, [record]), scopeKey)[0];
      if (!detached) throw new Error("복구할 획 원본이 없습니다.");
      await exclusive(scopeKey, async () => {
        const current = await load(scopeKey);
        if (current.some((candidate) => candidate.id === detached.id)) return;
        await store.set(scopeKey, serialize(scopeKey, [detached, ...current]));
      });
    },
    delete: remove,
    async confirmRestored(record) {
      if (!options.isRestoredStrokeDurable || !await options.isRestoredStrokeDurable(record)) return false;
      await remove(record);
      return true;
    },
  };
}

export async function acquireStudioRejectedStrokeRecoveryRepository(
  scope: StudioRejectedStrokeRecoveryScope,
  options: Readonly<{ acquireDatabase?: () => Promise<StudioLocalDatabase> }> = {},
): Promise<StudioRejectedStrokeRecoveryRepository> {
  const [{ acquireStudioLocalDatabase }, { createStudioAutosaveSqliteStore }] = await Promise.all([
    import("../studio-local-database-runtime"),
    import("../studio-autosave-sqlite-store"),
  ]);
  const database = await (options.acquireDatabase ?? acquireStudioLocalDatabase)();
  const autosave = createStudioAutosaveSqliteStore(database);
  const scopeKey = studioRejectedStrokeRecoveryScopeKey(scope);
  return createStudioRejectedStrokeRecoveryRepository(
    database.asAsyncKeyValueStore(STUDIO_REJECTED_STROKE_RECOVERY_NAMESPACE),
    {
      async isRestoredStrokeDurable(record) {
        if (record.scopeKey !== scopeKey || !record.restoredStrokeId) return false;
        const saved = await autosave.read(scope.documentKey);
        if (saved?.state !== "snapshot") return false;
        return saved.payload.pagesList.some((page) => page.id === record.pageId && page.elements?.some((element) => (
          isRecord(element) && element.type === "draw"
            && (element.id === record.restoredStrokeId || record.admissionCheckpoint === true && element.id === record.id)
        )));
      },
    },
  );
}
