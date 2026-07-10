import { z } from "zod";

import { normalizeStudioAiProvenanceDocument } from "./studio-ai-provenance";

export const STUDIO_CHECKPOINT_LIMIT = 10;
const STUDIO_CHECKPOINT_PREFIX = "toonspectrum-studio-checkpoints:v1";

export interface StudioCheckpointStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const StudioCheckpointSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(80),
  createdAt: z.string().min(1).max(80),
  payload: z.unknown(),
});

const StudioCheckpointFileSchema = z.object({
  version: z.literal(1),
  checkpoints: z.array(z.unknown()).max(100),
});

export type StudioCheckpoint = z.infer<typeof StudioCheckpointSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Redacts raw prompt fields in both newly written and legacy checkpoint payloads. */
function normalizeCheckpointPayload(value: unknown): unknown {
  if (!isRecord(value) || !Object.hasOwn(value, "aiProvenance")) return value;
  return {
    ...value,
    aiProvenance: normalizeStudioAiProvenanceDocument(value.aiProvenance),
  };
}

export function studioCheckpointKey(input: {
  userId?: string | null;
  workId?: string | null;
  remixId?: string | null;
}): string {
  const owner = encodeURIComponent(input.userId?.trim() || "guest");
  const documentId = input.workId
    ? `work:${encodeURIComponent(input.workId)}`
    : input.remixId
      ? `remix:${encodeURIComponent(input.remixId)}`
      : "new";
  return `${STUDIO_CHECKPOINT_PREFIX}:${owner}:${documentId}`;
}

function normalizeCheckpointList(value: unknown): StudioCheckpoint[] {
  // 초기 실험 빌드의 배열-only 형태도 읽어 v1 컨테이너로 자연스럽게 마이그레이션한다.
  const candidate = Array.isArray(value) ? { version: 1, checkpoints: value } : value;
  const parsed = StudioCheckpointFileSchema.safeParse(candidate);
  if (!parsed.success) return [];
  return parsed.data.checkpoints
    .flatMap((checkpoint) => {
      const result = StudioCheckpointSchema.safeParse(checkpoint);
      return result.success
        ? [{ ...result.data, payload: normalizeCheckpointPayload(result.data.payload) }]
        : [];
    })
    .filter((checkpoint) => Number.isFinite(Date.parse(checkpoint.createdAt)))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, STUDIO_CHECKPOINT_LIMIT);
}

export function listStudioCheckpoints(
  storage: Pick<StudioCheckpointStorage, "getItem">,
  key: string
): StudioCheckpoint[] {
  try {
    const raw = storage.getItem(key);
    return raw ? normalizeCheckpointList(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function writeCheckpointList(
  storage: Pick<StudioCheckpointStorage, "setItem" | "removeItem">,
  key: string,
  checkpoints: StudioCheckpoint[]
): void {
  try {
    if (checkpoints.length === 0) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(
      key,
      JSON.stringify({ version: 1, checkpoints: checkpoints.slice(0, STUDIO_CHECKPOINT_LIMIT) })
    );
  } catch {
    throw new Error("브라우저 저장공간이 부족해 복구 지점을 저장하지 못했어요. 오래된 지점을 지우거나 JSON 백업을 이용해 주세요.");
  }
}

export function createStudioCheckpoint(
  storage: StudioCheckpointStorage,
  key: string,
  input: {
    name: string;
    payload: unknown;
    now?: Date;
    idFactory?: () => string;
  }
): StudioCheckpoint[] {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error("복구 지점 이름을 입력해 주세요.");
  const idFactory = input.idFactory ?? (() => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`);
  const checkpoint: StudioCheckpoint = {
    id: idFactory(),
    name,
    createdAt: (input.now ?? new Date()).toISOString(),
    payload: normalizeCheckpointPayload(input.payload),
  };
  // payload가 JSON으로 직렬화 불가능한 값(BigInt/순환 참조 등)이면 write 단계에서 명시적 오류가 난다.
  const next = [checkpoint, ...listStudioCheckpoints(storage, key)].slice(0, STUDIO_CHECKPOINT_LIMIT);
  writeCheckpointList(storage, key, next);
  return next;
}

export function renameStudioCheckpoint(
  storage: StudioCheckpointStorage,
  key: string,
  id: string,
  name: string
): StudioCheckpoint[] {
  const normalizedName = name.trim().slice(0, 80);
  if (!normalizedName) throw new Error("복구 지점 이름을 입력해 주세요.");
  const current = listStudioCheckpoints(storage, key);
  const next = current.map((checkpoint) =>
    checkpoint.id === id ? { ...checkpoint, name: normalizedName } : checkpoint
  );
  if (next.every((checkpoint, index) => checkpoint === current[index])) return current;
  writeCheckpointList(storage, key, next);
  return next;
}

export function deleteStudioCheckpoint(
  storage: StudioCheckpointStorage,
  key: string,
  id: string
): StudioCheckpoint[] {
  const current = listStudioCheckpoints(storage, key);
  const next = current.filter((checkpoint) => checkpoint.id !== id);
  if (next.length === current.length) return current;
  writeCheckpointList(storage, key, next);
  return next;
}
