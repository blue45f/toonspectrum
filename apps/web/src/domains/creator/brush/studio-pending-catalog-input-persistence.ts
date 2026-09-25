import type Konva from "konva";
import { sanitizeBrushSnapshot, type StudioBrushSnapshot } from "./studio-brush-library";
import type { StudioAsyncKeyValueStore } from "../studio-local-database";
import { snapshotStudioCatalogPointer, type StudioCatalogInputGesture, type StudioCatalogPointerBatch } from "./studio-pending-catalog-input";

const NAMESPACE = "studio-pending-catalog-input-v1";
const numericFields = ["pointerId", "clientX", "clientY", "screenX", "screenY", "width", "height", "pressure", "tangentialPressure", "tiltX", "tiltY", "twist", "altitudeAngle", "azimuthAngle", "button", "buttons", "timeStamp", "movementX", "movementY"] as const;
const booleanFields = ["isPrimary", "altKey", "ctrlKey", "metaKey", "shiftKey"] as const;
type StoredPointer = { type: string; pointerType: string; numbers: Record<string, number>; flags: Record<string, boolean>; coalesced: StoredPointer[] };
type StoredBatch = { pointer: StoredPointer; matrix: number[] };
export interface StudioCatalogInputRecoveryRecord {
  id: string; ownerScope: string; sourceScope: string; catalogId: string;
  brushSnapshot?: StudioBrushSnapshot; operation?: "paint" | "erase";
  start: StoredBatch; moves: StoredBatch[]; end: StoredPointer | null; endMatrix?: number[]; restoredStrokeId?: string;
}
function storePointer(pointer: PointerEvent): StoredPointer {
  return {
    type: pointer.type, pointerType: pointer.pointerType,
    numbers: Object.fromEntries(numericFields.flatMap((key) => Number.isFinite(pointer[key]) ? [[key, pointer[key]]] : [])),
    flags: Object.fromEntries(booleanFields.map((key) => [key, Boolean(pointer[key])])),
    coalesced: (pointer.getCoalescedEvents?.() ?? []).map(storePointer),
  };
}
function storeBatch(batch: StudioCatalogPointerBatch): StoredBatch {
  const a = batch.mapper.pointFor({ clientX: 0, clientY: 0 });
  const b = batch.mapper.pointFor({ clientX: 1, clientY: 0 });
  const c = batch.mapper.pointFor({ clientX: 0, clientY: 1 });
  if (!a || !b || !c) throw new Error("입력 좌표계를 보관하지 못했습니다.");
  return { pointer: storePointer(batch.pointer), matrix: [a.x, a.y, b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y] };
}
export function serializeStudioCatalogInputRecovery(gesture: StudioCatalogInputGesture, restoredStrokeId?: string): StudioCatalogInputRecoveryRecord {
  return { id: gesture.id, ownerScope: gesture.ownerScope, sourceScope: gesture.sourceScope ?? gesture.scope, catalogId: gesture.catalogId,
    brushSnapshot: gesture.brushSnapshot, operation: gesture.operation, start: storeBatch(gesture.start), moves: gesture.moves.map(storeBatch), end: gesture.end ? storePointer(gesture.end) : null,
    ...(gesture.end && gesture.endMapper ? { endMatrix: storeBatch({ pointer: gesture.end, mapper: gesture.endMapper }).matrix } : {}),
    ...(restoredStrokeId ? { restoredStrokeId } : {}),
  };
}
function restorePointer(pointer: StoredPointer): PointerEvent {
  const base = { ...pointer.numbers, ...pointer.flags, type: pointer.type, pointerType: pointer.pointerType,
    getCoalescedEvents: () => pointer.coalesced.map(restorePointer) } as unknown as PointerEvent;
  return snapshotStudioCatalogPointer(base);
}
function restoreBatch(batch: StoredBatch): StudioCatalogPointerBatch {
  const [x, y, xx, xy, yx, yy] = batch.matrix as [number, number, number, number, number, number];
  return { pointer: restorePointer(batch.pointer), mapper: { pointFor: ({ clientX, clientY }) => ({ x: x + xx * clientX + yx * clientY, y: y + xy * clientX + yy * clientY }) } };
}
export function restoreStudioCatalogInputRecovery(record: StudioCatalogInputRecoveryRecord, stage: Konva.Stage, scope: string): StudioCatalogInputGesture {
  const start = restoreBatch(record.start);
  const moves = record.moves.map(restoreBatch);
  return { id: record.id, ownerScope: record.ownerScope, sourceScope: record.sourceScope, scope, catalogId: record.catalogId, operation: record.operation, brushSnapshot: record.brushSnapshot, stage, start, moves,
    // 재시작/문서 이동은 접촉을 끝낸다. 실제 마지막 원본 표본만 종료 메타데이터로 쓴다.
    end: record.end ? restorePointer(record.end) : moves.at(-1)?.pointer ?? start.pointer,
    ...(record.end && record.endMatrix ? { endMapper: restoreBatch({ pointer: record.end, matrix: record.endMatrix }).mapper } : {}),
  };
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function validPointer(value: unknown, depth = 0): value is StoredPointer {
  if (!object(value) || depth > 1 || typeof value.type !== "string" || !["pen", "mouse", "touch"].includes(String(value.pointerType))
    || !object(value.numbers) || !object(value.flags) || !Array.isArray(value.coalesced)) return false;
  const numbers = value.numbers;
  const flags = value.flags;
  return numericFields.every((key) => numbers[key] === undefined || Number.isFinite(numbers[key]))
    && ["clientX", "clientY", "timeStamp", "pointerId"].every((key) => Number.isFinite(numbers[key]))
    && Object.keys(numbers).every((key) => numericFields.includes(key as typeof numericFields[number]))
    && Object.values(flags).every((flag) => typeof flag === "boolean")
    && value.coalesced.every((sample) => validPointer(sample, depth + 1));
}
function validBatch(value: unknown): value is StoredBatch {
  return object(value) && validPointer(value.pointer) && Array.isArray(value.matrix) && value.matrix.length === 6 && value.matrix.every(Number.isFinite);
}
export function parseStudioCatalogInputRecovery(raw: string | null, ownerScope: string): StudioCatalogInputRecoveryRecord[] {
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (!object(data) || data.version !== 1 || data.ownerScope !== ownerScope || !Array.isArray(data.records)) throw new Error("브러시 입력 복구 경계가 올바르지 않습니다.");
  for (const record of data.records) {
    if (!object(record) || record.ownerScope !== ownerScope || typeof record.id !== "string" || !record.id
      || typeof record.catalogId !== "string" || typeof record.sourceScope !== "string"
      || !validBatch(record.start) || !Array.isArray(record.moves) || !record.moves.every(validBatch)
      || record.end !== null && !validPointer(record.end)
      || record.endMatrix !== undefined && (!Array.isArray(record.endMatrix) || record.endMatrix.length !== 6 || !record.endMatrix.every(Number.isFinite))
      || record.operation !== undefined && record.operation !== "paint" && record.operation !== "erase"
      || record.restoredStrokeId !== undefined && typeof record.restoredStrokeId !== "string") throw new Error("브러시 입력 복구 원본이 손상되었습니다.");
  }
  return (data.records as StudioCatalogInputRecoveryRecord[]).map((record) => {
    if (!record.brushSnapshot) return record;
    const checked = sanitizeBrushSnapshot(record.brushSnapshot);
    if (checked.adjustedFields.length) throw new Error("복구 브러시 설정이 손상되었습니다.");
    return { ...record, brushSnapshot: checked.snapshot };
  });
}
const tails = new Map<string, Promise<unknown>>();
export function createStudioCatalogInputRecoveryRepository(store: StudioAsyncKeyValueStore) {
  const load = async (ownerScope: string) => parseStudioCatalogInputRecovery(await store.get(ownerScope), ownerScope);
  return { load, save(record: StudioCatalogInputRecoveryRecord): Promise<void> {
    const key = record.ownerScope;
    const write = async () => {
      const records = await load(key);
      const next = records.filter((item) => item.id !== record.id).concat(record);
      await store.set(key, JSON.stringify({ version: 1, ownerScope: key, records: next }));
    };
    const work = (tails.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => {
      const locks = globalThis.navigator?.locks;
      return locks ? locks.request(`${NAMESPACE}:${key}`, write) : write();
    });
    tails.set(key, work);
    void work.finally(() => { if (tails.get(key) === work) tails.delete(key); }).catch(() => undefined);
    return work;
  } };
}
export async function acquireStudioCatalogInputRecoveryRepository() {
  const { acquireStudioLocalDatabase } = await import("../studio-local-database-runtime");
  const database = await acquireStudioLocalDatabase();
  const repository = createStudioCatalogInputRecoveryRepository(database.asAsyncKeyValueStore(NAMESPACE));
  return { ...repository, async loadUnrestored(ownerScope: string, documentKey: string) {
    const records = await repository.load(ownerScope);
    if (!records.some((record) => record.restoredStrokeId)) return records;
    const { createStudioAutosaveSqliteStore } = await import("../studio-autosave-sqlite-store");
    const saved = await createStudioAutosaveSqliteStore(database).read(documentKey);
    const durableIds = new Set(saved?.state === "snapshot"
      ? saved.payload.pagesList.flatMap((page) => page.elements?.map((element) => object(element) && typeof element.id === "string" ? element.id : null) ?? []) : []);
    return records.filter((record) => !record.restoredStrokeId || !durableIds.has(record.restoredStrokeId));
  } };
}
