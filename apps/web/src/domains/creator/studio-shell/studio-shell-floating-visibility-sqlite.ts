import {
  DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY,
  encodeStudioShellFloatingVisibility,
  normalizeStudioShellFloatingVisibility,
  type StudioShellFloatingVisibilityState,
} from "./studio-shell-floating-layout";

import type { StudioAsyncKeyValueStore } from "../studio-local-database";

export const STUDIO_SHELL_FLOATING_VISIBILITY_SQLITE_NAMESPACE =
  "studio-shell-floating-visibility-v1";
const SNAPSHOT_KEY = "snapshot";

export type StudioShellFloatingVisibilityPersistenceFailure =
  | "read-failed"
  | "write-failed"
  | "verification-failed";

export interface StudioShellFloatingVisibilityLoadResult {
  readonly state: StudioShellFloatingVisibilityState;
  readonly persisted: boolean;
  readonly failure: StudioShellFloatingVisibilityPersistenceFailure | null;
}

export interface StudioShellFloatingVisibilitySaveResult {
  readonly state: StudioShellFloatingVisibilityState;
  readonly status: "persisted" | "memory-only";
  readonly failure: StudioShellFloatingVisibilityPersistenceFailure | null;
}

export interface StudioShellFloatingVisibilityRepository {
  readonly authority: "sqlite-opfs";
  load(): Promise<StudioShellFloatingVisibilityLoadResult>;
  save(
    state: StudioShellFloatingVisibilityState,
  ): Promise<StudioShellFloatingVisibilitySaveResult>;
  flush(): Promise<void>;
}

/** Device-local visibility preferences. Document content and collaboration data never enter here. */
export function createStudioShellFloatingVisibilityRepository(
  store: StudioAsyncKeyValueStore,
): StudioShellFloatingVisibilityRepository {
  let writeTail: Promise<void> = Promise.resolve();

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = writeTail.catch(() => undefined).then(operation);
    writeTail = result.then(() => undefined, () => undefined);
    return result;
  };

  return Object.freeze({
    authority: "sqlite-opfs" as const,
    async load() {
      try {
        await writeTail.catch(() => undefined);
        const raw = await store.get(SNAPSHOT_KEY);
        if (raw === null) {
          return Object.freeze({
            state: DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY,
            persisted: false,
            failure: null,
          });
        }
        let decoded: unknown;
        try {
          decoded = JSON.parse(raw) as unknown;
        } catch {
          return Object.freeze({
            state: DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY,
            persisted: false,
            failure: "read-failed" as const,
          });
        }
        return Object.freeze({
          state: normalizeStudioShellFloatingVisibility(decoded),
          persisted: true,
          failure: null,
        });
      } catch {
        return Object.freeze({
          state: DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY,
          persisted: false,
          failure: "read-failed" as const,
        });
      }
    },
    save(state: StudioShellFloatingVisibilityState) {
      const normalized = normalizeStudioShellFloatingVisibility(state);
      const encoded = encodeStudioShellFloatingVisibility(normalized);
      return enqueue(async () => {
        try {
          await store.set(SNAPSHOT_KEY, encoded);
        } catch {
          return Object.freeze({
            state: normalized,
            status: "memory-only" as const,
            failure: "write-failed" as const,
          });
        }
        try {
          if (await store.get(SNAPSHOT_KEY) !== encoded) {
            return Object.freeze({
              state: normalized,
              status: "memory-only" as const,
              failure: "verification-failed" as const,
            });
          }
        } catch {
          return Object.freeze({
            state: normalized,
            status: "memory-only" as const,
            failure: "verification-failed" as const,
          });
        }
        return Object.freeze({
          state: normalized,
          status: "persisted" as const,
          failure: null,
        });
      });
    },
    flush() {
      return writeTail;
    },
  });
}

let sharedRepository: Promise<StudioShellFloatingVisibilityRepository> | null = null;

async function acquireStudioShellFloatingVisibilityDatabase() {
  const { acquireStudioLocalDatabase } = await import("../studio-local-database-runtime");
  return acquireStudioLocalDatabase();
}

export function acquireProductStudioShellFloatingVisibilityRepository(
): Promise<StudioShellFloatingVisibilityRepository> {
  sharedRepository ??= acquireStudioShellFloatingVisibilityDatabase().then((database) =>
    createStudioShellFloatingVisibilityRepository(
      database.asAsyncKeyValueStore(
        STUDIO_SHELL_FLOATING_VISIBILITY_SQLITE_NAMESPACE,
      ),
    ));
  return sharedRepository;
}

export function resetStudioShellFloatingVisibilityRepositoryForTests(): void {
  sharedRepository = null;
}
