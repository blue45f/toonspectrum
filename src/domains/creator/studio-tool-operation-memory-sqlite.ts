import {
  resolveStudioBrushPresetOperation,
  type StudioToolOperation,
} from "./studio-brush";
import {
  DEFAULT_STUDIO_BRUSH_SNAPSHOT,
  sanitizeBrushSnapshot,
  type StudioBrushSnapshot,
} from "./studio-brush-library";

import type {
  StudioAsyncKeyValueStore,
  StudioLocalDatabase,
} from "./studio-local-database";
import type { StudioToolOperationMemory } from "./studio-tool-operation-memory";

export const STUDIO_TOOL_OPERATION_MEMORY_SQLITE_NAMESPACE =
  "studio-tool-operation-memory-v12";
export const STUDIO_TOOL_OPERATION_MEMORY_SQLITE_KEY = "profile-v1";
export const STUDIO_TOOL_OPERATION_MEMORY_SCHEMA =
  "toonspectrum.studio.tool-operation-memory";
const PERSISTED_STUDIO_TOOL_OPERATION_MEMORY_VERSION = 1 as const;

const PERSISTED_DEFAULT_STANDARD_ERASER_SNAPSHOT: StudioBrushSnapshot = {
  ...DEFAULT_STUDIO_BRUSH_SNAPSHOT,
  brushId: "standard-eraser",
  strokeWidth: 20,
  brushOpacity: 1,
  stampTuning: null,
};

interface NormalizedPersistenceSnapshot {
  readonly snapshot: StudioBrushSnapshot;
  readonly repaired: boolean;
}

function normalizePersistenceSnapshot(
  raw: unknown,
  operation: StudioToolOperation,
): NormalizedPersistenceSnapshot {
  const { snapshot, adjustedFields } = sanitizeBrushSnapshot(raw);
  if (resolveStudioBrushPresetOperation(snapshot.brushId) !== operation) {
    return {
      snapshot: operation === "erase"
        ? { ...PERSISTED_DEFAULT_STANDARD_ERASER_SNAPSHOT }
        : { ...DEFAULT_STUDIO_BRUSH_SNAPSHOT },
      repaired: true,
    };
  }
  return { snapshot, repaired: adjustedFields.length > 0 };
}

function normalizePersistenceMemory(value: unknown): StudioToolOperationMemory {
  const record = objectRecord(value) ?? {};
  return {
    version: PERSISTED_STUDIO_TOOL_OPERATION_MEMORY_VERSION,
    paint: normalizePersistenceSnapshot(record.paint, "paint").snapshot,
    erase: normalizePersistenceSnapshot(record.erase, "erase").snapshot,
  };
}

interface PersistedStudioToolOperationMemory extends StudioToolOperationMemory {
  readonly schema: typeof STUDIO_TOOL_OPERATION_MEMORY_SCHEMA;
}

export type StudioToolOperationMemoryPersistenceErrorCode =
  | "corrupt"
  | "unavailable";

export class StudioToolOperationMemoryPersistenceError extends Error {
  readonly code: StudioToolOperationMemoryPersistenceErrorCode;

  constructor(
    code: StudioToolOperationMemoryPersistenceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "StudioToolOperationMemoryPersistenceError";
    this.code = code;
  }
}

interface ParsedStudioToolOperationMemory {
  readonly memory: StudioToolOperationMemory;
  readonly repaired: boolean;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseStudioToolOperationMemory(
  raw: string,
): ParsedStudioToolOperationMemory {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch (cause) {
    throw new StudioToolOperationMemoryPersistenceError(
      "corrupt",
      "도구 작업 메모리 SQLite 행이 유효한 JSON이 아닙니다.",
      { cause },
    );
  }
  const record = objectRecord(decoded);
  if (
    record === null
    || record.schema !== STUDIO_TOOL_OPERATION_MEMORY_SCHEMA
    || record.version !== PERSISTED_STUDIO_TOOL_OPERATION_MEMORY_VERSION
  ) {
    throw new StudioToolOperationMemoryPersistenceError(
      "corrupt",
      "도구 작업 메모리 SQLite 행의 스키마 또는 버전이 올바르지 않습니다.",
    );
  }
  const paint = normalizePersistenceSnapshot(record.paint, "paint");
  const erase = normalizePersistenceSnapshot(record.erase, "erase");
  return {
    memory: {
      version: PERSISTED_STUDIO_TOOL_OPERATION_MEMORY_VERSION,
      paint: paint.snapshot,
      erase: erase.snapshot,
    },
    repaired: paint.repaired || erase.repaired,
  };
}

export function serializeStudioToolOperationMemory(
  memory: StudioToolOperationMemory,
): string {
  const normalized = normalizePersistenceMemory(memory);
  return JSON.stringify({
    schema: STUDIO_TOOL_OPERATION_MEMORY_SCHEMA,
    ...normalized,
  } satisfies PersistedStudioToolOperationMemory);
}

export interface StudioToolOperationMemoryPersistencePort {
  load(): Promise<string | null>;
  save(serialized: string): Promise<void>;
}

export interface StudioToolOperationMemorySqlitePersistenceOptions {
  readonly acquireDatabase?: () => Promise<StudioLocalDatabase>;
}

/**
 * Adapts the app-lifetime Worker-backed SQLite authority to this small domain port.
 * There is intentionally no second durable backend: an unavailable database leaves the
 * controller usable in memory and reports the failure through its snapshot.
 */
export function createStudioToolOperationMemorySqlitePersistence(
  options: StudioToolOperationMemorySqlitePersistenceOptions = {},
): StudioToolOperationMemoryPersistencePort {
  const acquireDatabase = options.acquireDatabase ?? (async () => {
    const { acquireStudioLocalDatabase } = await import(
      "./studio-local-database-runtime"
    );
    return acquireStudioLocalDatabase();
  });
  let store: Promise<StudioAsyncKeyValueStore> | null = null;

  function resolveStore(): Promise<StudioAsyncKeyValueStore> {
    store ??= acquireDatabase().then((database) =>
      database.asAsyncKeyValueStore(STUDIO_TOOL_OPERATION_MEMORY_SQLITE_NAMESPACE));
    return store;
  }

  return {
    async load() {
      return (await resolveStore()).get(STUDIO_TOOL_OPERATION_MEMORY_SQLITE_KEY);
    },
    async save(serialized) {
      await (await resolveStore()).set(
        STUDIO_TOOL_OPERATION_MEMORY_SQLITE_KEY,
        serialized,
      );
    },
  };
}

export type StudioToolOperationMemoryPersistencePhase =
  | "idle"
  | "hydrating"
  | "ready"
  | "degraded";

export interface StudioToolOperationMemoryControllerSnapshot {
  readonly memory: StudioToolOperationMemory;
  readonly phase: StudioToolOperationMemoryPersistencePhase;
  readonly repairedCorruption: boolean;
  readonly lastError: StudioToolOperationMemoryPersistenceError | null;
}

export interface StudioToolOperationMemoryController {
  getSnapshot(): StudioToolOperationMemoryControllerSnapshot;
  subscribe(listener: () => void): () => void;
  hydrate(): Promise<StudioToolOperationMemory>;
  save(memory: StudioToolOperationMemory): Promise<boolean>;
  flush(): Promise<boolean>;
}

function unavailablePersistenceError(
  operation: "읽기" | "저장",
  cause: unknown,
): StudioToolOperationMemoryPersistenceError {
  if (cause instanceof StudioToolOperationMemoryPersistenceError) return cause;
  return new StudioToolOperationMemoryPersistenceError(
    "unavailable",
    `도구 작업 메모리 SQLite ${operation}를 완료하지 못했습니다: ${
      cause instanceof Error ? cause.message : String(cause)
    }`,
    { cause },
  );
}

function snapshotChanged(
  left: StudioBrushSnapshot,
  right: StudioBrushSnapshot,
): boolean {
  return JSON.stringify(left) !== JSON.stringify(right);
}

export function createStudioToolOperationMemoryController(
  persistence: StudioToolOperationMemoryPersistencePort,
): StudioToolOperationMemoryController {
  const listeners = new Set<() => void>();
  const dirtyBeforeHydration = new Set<StudioToolOperation>();
  let snapshot: StudioToolOperationMemoryControllerSnapshot = {
    memory: normalizePersistenceMemory(null),
    phase: "idle",
    repairedCorruption: false,
    lastError: null,
  };
  let hydration: Promise<StudioToolOperationMemory> | null = null;
  let mutationTail: Promise<boolean> = Promise.resolve(true);
  let lastPersistSucceeded = true;

  function publish(
    next: StudioToolOperationMemoryControllerSnapshot,
  ): StudioToolOperationMemoryControllerSnapshot {
    snapshot = next;
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // Observers cannot turn a valid in-memory transition into a persistence failure.
      }
    }
    return next;
  }

  function hydrate(): Promise<StudioToolOperationMemory> {
    hydration ??= (async () => {
      publish({ ...snapshot, phase: "hydrating", lastError: null });
      try {
        const raw = await persistence.load();
        let persisted = normalizePersistenceMemory(null);
        let repairedCorruption = false;
        let parseError: StudioToolOperationMemoryPersistenceError | null = null;
        if (raw !== null) {
          try {
            const parsed = parseStudioToolOperationMemory(raw);
            persisted = parsed.memory;
            repairedCorruption = parsed.repaired;
            if (parsed.repaired) {
              parseError = new StudioToolOperationMemoryPersistenceError(
                "corrupt",
                "도구 작업 메모리 SQLite 행의 일부 슬롯을 독립 기본값으로 복구했습니다.",
              );
            }
          } catch (error) {
            parseError = unavailablePersistenceError("읽기", error);
          }
        }
        const memory = normalizePersistenceMemory({
          paint: dirtyBeforeHydration.has("paint")
            ? snapshot.memory.paint
            : persisted.paint,
          erase: dirtyBeforeHydration.has("erase")
            ? snapshot.memory.erase
            : persisted.erase,
        });
        publish({
          memory,
          phase: parseError === null ? "ready" : "degraded",
          repairedCorruption:
            repairedCorruption || parseError?.code === "corrupt",
          lastError: parseError,
        });
        return memory;
      } catch (error) {
        const lastError = unavailablePersistenceError("읽기", error);
        publish({
          ...snapshot,
          phase: "degraded",
          lastError,
        });
        return snapshot.memory;
      }
    })();
    return hydration;
  }

  function save(memory: StudioToolOperationMemory): Promise<boolean> {
    const normalized = normalizePersistenceMemory(memory);
    if (snapshot.phase === "idle" || snapshot.phase === "hydrating") {
      if (snapshotChanged(snapshot.memory.paint, normalized.paint)) {
        dirtyBeforeHydration.add("paint");
      }
      if (snapshotChanged(snapshot.memory.erase, normalized.erase)) {
        dirtyBeforeHydration.add("erase");
      }
    }
    publish({ ...snapshot, memory: normalized });
    const run = async (): Promise<boolean> => {
      await hydrate();
      try {
        await persistence.save(serializeStudioToolOperationMemory(snapshot.memory));
        lastPersistSucceeded = true;
        publish({
          ...snapshot,
          phase: "ready",
          repairedCorruption: false,
          lastError: null,
        });
        return true;
      } catch (error) {
        lastPersistSucceeded = false;
        publish({
          ...snapshot,
          phase: "degraded",
          lastError: unavailablePersistenceError("저장", error),
        });
        return false;
      }
    };
    const result = mutationTail.then(run, run);
    mutationTail = result;
    return result;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hydrate,
    save,
    async flush() {
      await mutationTail;
      return lastPersistSucceeded;
    },
  };
}

let productController: StudioToolOperationMemoryController | null = null;

export function getProductStudioToolOperationMemoryController():
StudioToolOperationMemoryController {
  productController ??= createStudioToolOperationMemoryController(
    createStudioToolOperationMemorySqlitePersistence(),
  );
  return productController;
}
