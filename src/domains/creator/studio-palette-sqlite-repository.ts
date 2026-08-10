/** V12 SQLite/OPFS authority for user-authored named palettes. */

import { acquireStudioLocalDatabase } from "./studio-local-database-runtime";
import {
  deletePaletteInMemory,
  parseCanonicalStudioPaletteLibrary,
  renamePaletteInMemory,
  serializeStudioPaletteLibrary,
  StudioPaletteLibraryError,
  upsertPaletteInMemory,
} from "./studio-palette-library";

import type { StudioLocalDatabase } from "./studio-local-database";
import type { StudioNamedPalette } from "./studio-palette-library";

export const STUDIO_PALETTE_SQLITE_NAMESPACE = "studio-named-palettes-v12";
export const STUDIO_PALETTE_SQLITE_KEY = "library-v1";

export type StudioPaletteSqliteRepositoryErrorCode = "invalid" | "limit" | "unavailable";

export class StudioPaletteSqliteRepositoryError extends Error {
  readonly code: StudioPaletteSqliteRepositoryErrorCode;

  constructor(
    code: StudioPaletteSqliteRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "StudioPaletteSqliteRepositoryError";
    this.code = code;
  }
}

export interface StudioPaletteSqliteRepository {
  readonly authority: "sqlite";
  list(): Promise<StudioNamedPalette[]>;
  save(palette: StudioNamedPalette): Promise<StudioNamedPalette[]>;
  rename(id: string, name: string): Promise<StudioNamedPalette[]>;
  delete(id: string): Promise<StudioNamedPalette[]>;
  readSidecar(namespace: string, key: string): Promise<string | null>;
  commitBatch(input: StudioPaletteSqliteBatchInput): Promise<StudioPaletteSqliteBatchResult>;
  subscribe(listener: () => void): () => void;
}

export interface StudioPaletteSqliteSidecarMutation {
  readonly namespace: string;
  readonly key: string;
  readonly value: string | null;
}

export interface StudioPaletteSqliteBatchInput {
  readonly upsert?: readonly StudioNamedPalette[];
  readonly deleteIds?: readonly string[];
  /**
   * Palette rows and related SQLite metadata are committed under the same repository queue.
   * sqlite-wasm's public KV port does not expose a cross-key transaction, so commitBatch verifies
   * every write and restores the exact prior values before releasing the queue on failure.
   */
  readonly sidecars?: readonly StudioPaletteSqliteSidecarMutation[];
}

export interface StudioPaletteSqliteBatchResult {
  readonly items: StudioNamedPalette[];
  readonly upsertedCount: number;
  readonly deletedCount: number;
}

export interface StudioPaletteSqliteRepositoryOptions {
  readonly acquireDatabase?: () => Promise<StudioLocalDatabase>;
  readonly now?: () => number;
}

function repositoryError(error: unknown, operation: string): never {
  if (error instanceof StudioPaletteSqliteRepositoryError) throw error;
  if (error instanceof StudioPaletteLibraryError) {
    throw new StudioPaletteSqliteRepositoryError(
      error.code === "library-too-large" ? "limit" : "invalid",
      `팔레트 SQLite ${operation} 데이터를 처리하지 못했습니다: ${error.message}`,
      { cause: error },
    );
  }
  throw new StudioPaletteSqliteRepositoryError(
    "unavailable",
    `팔레트 SQLite ${operation}를 완료하지 못했습니다: ${
      error instanceof Error ? error.message : String(error)
    }`,
    { cause: error },
  );
}

async function readLibrary(database: StudioLocalDatabase): Promise<StudioNamedPalette[]> {
  const raw = await database.kvGet(STUDIO_PALETTE_SQLITE_NAMESPACE, STUDIO_PALETTE_SQLITE_KEY);
  return raw === null ? [] : parseCanonicalStudioPaletteLibrary(raw);
}

function assertBatchInput(input: StudioPaletteSqliteBatchInput): void {
  const upsertIds = input.upsert?.map((palette) => palette.id) ?? [];
  const deleteIds = input.deleteIds ?? [];
  const sidecarKeys = input.sidecars?.map(({ namespace, key }) => `${namespace}\u0000${key}`) ?? [];
  if (
    new Set(upsertIds).size !== upsertIds.length
    || new Set(deleteIds).size !== deleteIds.length
    || new Set(sidecarKeys).size !== sidecarKeys.length
    || upsertIds.some((id) => deleteIds.includes(id))
    || input.sidecars?.some(({ namespace, key }) =>
      namespace.length === 0
      || key.length === 0
      || (
        namespace === STUDIO_PALETTE_SQLITE_NAMESPACE
        && key === STUDIO_PALETTE_SQLITE_KEY
      ))
  ) {
    throw new StudioPaletteSqliteRepositoryError(
      "invalid",
      "팔레트 SQLite batch에 중복되거나 충돌하는 항목이 있습니다.",
    );
  }
}

export function createStudioPaletteSqliteRepository(
  options: StudioPaletteSqliteRepositoryOptions = {},
): StudioPaletteSqliteRepository {
  const acquireDatabase = options.acquireDatabase ?? acquireStudioLocalDatabase;
  const now = options.now ?? Date.now;
  const listeners = new Set<() => void>();
  let mutationTail: Promise<void> = Promise.resolve();

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = mutationTail.then(work, work);
    mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  async function open(): Promise<StudioLocalDatabase> {
    try {
      return await acquireDatabase();
    } catch (error) {
      repositoryError(error, "열기");
    }
  }

  function notify(): void {
    for (const listener of listeners) listener();
  }

  async function mutate(
    update: (items: readonly StudioNamedPalette[]) => StudioNamedPalette[],
  ): Promise<StudioNamedPalette[]> {
    const database = await open();
    const next = update(await readLibrary(database));
    await database.kvSet(
      STUDIO_PALETTE_SQLITE_NAMESPACE,
      STUDIO_PALETTE_SQLITE_KEY,
      serializeStudioPaletteLibrary(next),
    );
    notify();
    return next;
  }

  async function restoreRawValue(
    database: StudioLocalDatabase,
    namespace: string,
    key: string,
    raw: string | null,
  ): Promise<void> {
    if (raw === null) await database.kvDelete(namespace, key);
    else await database.kvSet(namespace, key, raw);
  }

  return {
    authority: "sqlite",

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async list() {
      await mutationTail;
      try {
        return await readLibrary(await open());
      } catch (error) {
        repositoryError(error, "읽기");
      }
    },

    async readSidecar(namespace, key) {
      await mutationTail;
      if (
        namespace.length === 0
        || key.length === 0
        || (
          namespace === STUDIO_PALETTE_SQLITE_NAMESPACE
          && key === STUDIO_PALETTE_SQLITE_KEY
        )
      ) {
        throw new StudioPaletteSqliteRepositoryError(
          "invalid",
          "팔레트 SQLite sidecar 키가 올바르지 않습니다.",
        );
      }
      try {
        return await (await open()).kvGet(namespace, key);
      } catch (error) {
        repositoryError(error, "sidecar 읽기");
      }
    },

    commitBatch(input) {
      return enqueue(async () => {
        try {
          assertBatchInput(input);
          const database = await open();
          const previousLibraryRaw = await database.kvGet(
            STUDIO_PALETTE_SQLITE_NAMESPACE,
            STUDIO_PALETTE_SQLITE_KEY,
          );
          const previousItems = previousLibraryRaw === null
            ? []
            : parseCanonicalStudioPaletteLibrary(previousLibraryRaw);
          const sidecars = input.sidecars ?? [];
          const previousSidecars = await Promise.all(sidecars.map(async ({ namespace, key }) => ({
            namespace,
            key,
            raw: await database.kvGet(namespace, key),
          })));
          const deleteIds = new Set(input.deleteIds ?? []);
          let next = previousItems.filter((palette) => !deleteIds.has(palette.id));
          for (const palette of [...(input.upsert ?? [])].reverse()) {
            next = upsertPaletteInMemory(next, palette);
          }
          const nextLibraryRaw = serializeStudioPaletteLibrary(next);
          const deletedCount = previousItems.filter((palette) => deleteIds.has(palette.id)).length;

          try {
            await database.kvSet(
              STUDIO_PALETTE_SQLITE_NAMESPACE,
              STUDIO_PALETTE_SQLITE_KEY,
              nextLibraryRaw,
            );
            for (const sidecar of sidecars) {
              await restoreRawValue(
                database,
                sidecar.namespace,
                sidecar.key,
                sidecar.value,
              );
            }
            const verifiedLibraryRaw = await database.kvGet(
              STUDIO_PALETTE_SQLITE_NAMESPACE,
              STUDIO_PALETTE_SQLITE_KEY,
            );
            const verifiedSidecars = await Promise.all(sidecars.map(({ namespace, key }) =>
              database.kvGet(namespace, key)));
            if (
              verifiedLibraryRaw !== nextLibraryRaw
              || verifiedSidecars.some((raw, index) => raw !== sidecars[index]?.value)
            ) {
              throw new Error("팔레트 SQLite batch 저장 검증에 실패했습니다.");
            }
          } catch (error) {
            const rollbackErrors: unknown[] = [];
            try {
              await restoreRawValue(
                database,
                STUDIO_PALETTE_SQLITE_NAMESPACE,
                STUDIO_PALETTE_SQLITE_KEY,
                previousLibraryRaw,
              );
            } catch (rollbackError) {
              rollbackErrors.push(rollbackError);
            }
            for (const sidecar of previousSidecars) {
              try {
                await restoreRawValue(
                  database,
                  sidecar.namespace,
                  sidecar.key,
                  sidecar.raw,
                );
              } catch (rollbackError) {
                rollbackErrors.push(rollbackError);
              }
            }
            if (rollbackErrors.length > 0) {
              throw new StudioPaletteSqliteRepositoryError(
                "unavailable",
                "팔레트 SQLite batch 실패 후 이전 상태 복원에도 실패했습니다.",
                { cause: new AggregateError([error, ...rollbackErrors]) },
              );
            }
            repositoryError(error, "batch 저장");
          }

          notify();
          return {
            items: next,
            upsertedCount: new Set(input.upsert?.map((palette) => palette.id) ?? []).size,
            deletedCount,
          };
        } catch (error) {
          repositoryError(error, "batch 저장");
        }
      });
    },

    save(palette) {
      return enqueue(async () => {
        try {
          return await mutate((items) => upsertPaletteInMemory(items, palette));
        } catch (error) {
          repositoryError(error, "저장");
        }
      });
    },

    rename(id, name) {
      return enqueue(async () => {
        try {
          return await mutate((items) => renamePaletteInMemory(items, id, name, now()));
        } catch (error) {
          repositoryError(error, "이름 변경");
        }
      });
    },

    delete(id) {
      return enqueue(async () => {
        try {
          return await mutate((items) => deletePaletteInMemory(items, id));
        } catch (error) {
          repositoryError(error, "삭제");
        }
      });
    },
  };
}

let productRepository: StudioPaletteSqliteRepository | null = null;

export function getProductStudioPaletteSqliteRepository(): StudioPaletteSqliteRepository {
  productRepository ??= createStudioPaletteSqliteRepository();
  return productRepository;
}
