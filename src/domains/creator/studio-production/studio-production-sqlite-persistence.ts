/**
 * V12 SQLite/OPFS authority for the Studio production command center.
 *
 * One canonical workspace document is stored per scope. The shared app-lifetime database handle
 * keeps this lazy route from installing another SQLite VFS, while per-scope queues preserve write
 * order. Failures never fall back to browser key/value stores or pretend an in-session copy is durable.
 */
import { acquireStudioLocalDatabase } from "../studio-local-database-runtime";

import {
  StudioProductionWorkspaceSchema,
  type StudioProductionWorkspace,
} from "./studio-production-model";

import type { StudioLocalDatabase } from "../studio-local-database";


export const STUDIO_PRODUCTION_SQLITE_NAMESPACE =
  "studio-production-command-center-v12";
export const STUDIO_PRODUCTION_SQLITE_MAX_BYTES = 8_000_000;

export type StudioProductionPersistenceBackend =
  | "sqlite"
  | "memory"
  | "unavailable";

export interface StudioProductionPersistenceResult {
  readonly workspace: StudioProductionWorkspace | null;
  readonly backend: StudioProductionPersistenceBackend;
  readonly persisted: boolean;
  readonly warning?: string;
}

export interface StudioProductionPersistenceRepository {
  load(scopeKey: string): Promise<StudioProductionPersistenceResult>;
  save(workspace: StudioProductionWorkspace): Promise<StudioProductionPersistenceResult>;
  delete(scopeKey: string): Promise<StudioProductionPersistenceResult>;
}

export interface StudioProductionSqlitePersistenceOptions {
  readonly acquireDatabase?: () => Promise<StudioLocalDatabase>;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

// Mirrors hasUnsafeStudioIdentityCharacter in studio-workspace-route.ts: a codepoint
// scan expresses the same intent as a control-character class without tripping
// no-control-regex.
function hasStudioProductionControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

export function normalizeStudioProductionScopeKey(value: string): string | null {
  const normalized = value.trim();
  if (
    normalized.length === 0
    || normalized.length > 240
    || hasStudioProductionControlCharacter(normalized)
  ) {
    return null;
  }
  return normalized;
}

export function serializeCanonicalStudioProductionWorkspace(
  workspace: StudioProductionWorkspace,
): string {
  return JSON.stringify(StudioProductionWorkspaceSchema.parse(workspace));
}

export function decodeCanonicalStudioProductionWorkspace(
  serialized: string,
): { readonly ok: true; readonly workspace: StudioProductionWorkspace }
  | { readonly ok: false; readonly error: string } {
  if (byteLength(serialized) > STUDIO_PRODUCTION_SQLITE_MAX_BYTES) {
    return { ok: false, error: "SQLite 제작 운영 문서가 8MB 제한을 넘었습니다." };
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(serialized) as unknown;
  } catch {
    return { ok: false, error: "SQLite 제작 운영 JSON이 손상되었습니다." };
  }
  const parsed = StudioProductionWorkspaceSchema.safeParse(decoded);
  if (!parsed.success) {
    return { ok: false, error: "SQLite 제작 운영 문서가 V12 스키마를 통과하지 못했습니다." };
  }
  if (serializeCanonicalStudioProductionWorkspace(parsed.data) !== serialized) {
    return { ok: false, error: "SQLite 제작 운영 문서가 canonical JSON이 아닙니다." };
  }
  return { ok: true, workspace: parsed.data };
}

function memoryResult(
  workspace: StudioProductionWorkspace | null,
  warning: string,
): StudioProductionPersistenceResult {
  return {
    workspace,
    backend: "memory",
    persisted: false,
    warning,
  };
}

function unavailableResult(warning: string): StudioProductionPersistenceResult {
  return {
    workspace: null,
    backend: "unavailable",
    persisted: false,
    warning,
  };
}

export function createStudioProductionSqlitePersistence(
  options: StudioProductionSqlitePersistenceOptions = {},
): StudioProductionPersistenceRepository {
  const acquireDatabase = options.acquireDatabase ?? acquireStudioLocalDatabase;
  const memory = new Map<string, StudioProductionWorkspace>();
  const writeTails = new Map<string, Promise<void>>();

  function enqueueWrite(scopeKey: string, operation: () => Promise<void>): Promise<void> {
    const previous = writeTails.get(scopeKey) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    writeTails.set(scopeKey, current);
    const retire = () => {
      if (writeTails.get(scopeKey) === current) writeTails.delete(scopeKey);
    };
    void current.then(retire, retire);
    return current;
  }

  return {
    async load(scopeKey) {
      const key = normalizeStudioProductionScopeKey(scopeKey);
      if (!key) {
        return unavailableResult("제작 운영 저장 범위가 올바르지 않습니다.");
      }
      try {
        await writeTails.get(key);
        const database = await acquireDatabase();
        const serialized = await database.kvGet(STUDIO_PRODUCTION_SQLITE_NAMESPACE, key);
        if (serialized === null) {
          return {
            workspace: memory.get(key) ?? null,
            backend: "sqlite",
            persisted: false,
          };
        }
        const decoded = decodeCanonicalStudioProductionWorkspace(serialized);
        if (!decoded.ok) return unavailableResult(decoded.error);
        if (decoded.workspace.scopeKey !== key) {
          return unavailableResult("SQLite 제작 운영 범위와 문서 범위가 일치하지 않습니다.");
        }
        memory.set(key, decoded.workspace);
        return {
          workspace: decoded.workspace,
          backend: "sqlite",
          persisted: true,
        };
      } catch (error) {
        const recovered = memory.get(key) ?? null;
        if (recovered) {
          return memoryResult(
            recovered,
            `SQLite/OPFS 읽기에 실패해 이 세션의 마지막 정상본을 사용합니다: ${errorText(error)}`,
          );
        }
        return unavailableResult(`SQLite/OPFS 저장소를 열지 못했습니다: ${errorText(error)}`);
      }
    },

    async save(workspace) {
      const validated = StudioProductionWorkspaceSchema.safeParse(workspace);
      if (!validated.success) {
        return unavailableResult("제작 운영 문서가 저장 스키마를 통과하지 못했습니다.");
      }
      const key = normalizeStudioProductionScopeKey(validated.data.scopeKey);
      if (!key) return unavailableResult("제작 운영 저장 범위가 올바르지 않습니다.");
      const serialized = serializeCanonicalStudioProductionWorkspace(validated.data);
      if (byteLength(serialized) > STUDIO_PRODUCTION_SQLITE_MAX_BYTES) {
        return memoryResult(validated.data, "제작 운영 문서가 8MB 제한을 넘어 세션에만 남습니다.");
      }
      memory.set(key, validated.data);
      try {
        await enqueueWrite(key, async () => {
          const database = await acquireDatabase();
          await database.kvSet(STUDIO_PRODUCTION_SQLITE_NAMESPACE, key, serialized);
        });
        return {
          workspace: validated.data,
          backend: "sqlite",
          persisted: true,
        };
      } catch (error) {
        return memoryResult(
          validated.data,
          `SQLite/OPFS 저장에 실패했습니다. 변경은 이 세션에만 남습니다: ${errorText(error)}`,
        );
      }
    },

    async delete(scopeKey) {
      const key = normalizeStudioProductionScopeKey(scopeKey);
      if (!key) return unavailableResult("제작 운영 저장 범위가 올바르지 않습니다.");
      memory.delete(key);
      try {
        await enqueueWrite(key, async () => {
          const database = await acquireDatabase();
          await database.kvDelete(STUDIO_PRODUCTION_SQLITE_NAMESPACE, key);
        });
        return { workspace: null, backend: "sqlite", persisted: true };
      } catch (error) {
        return unavailableResult(`SQLite/OPFS 삭제에 실패했습니다: ${errorText(error)}`);
      }
    },
  };
}
