import { acquireStudioLocalDatabase } from "./studio-local-database-runtime";
import { emitStudioDurableSaveIntent, studioSaveIntentScopeKey, STUDIO_DURABLE_SAVE_INTENT_NAMESPACE, type StudioDurableSaveIntent, type StudioSaveIntentScope } from "./studio-durable-save-intent";

import type { StudioLocalDatabase } from "./studio-local-database";

type Database = Pick<StudioLocalDatabase, "kvGet" | "kvSet" | "kvDelete">;
const tails = new Map<string, Promise<unknown>>();

function validRevision(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 1);
}
export function decodeStudioDurableSaveIntent(raw: string, scope: StudioSaveIntentScope): StudioDurableSaveIntent {
  if (raw.length > 8192) throw new Error("저장 대기 기록이 크기 한도를 초과했습니다.");
  const value = JSON.parse(raw) as StudioDurableSaveIntent;
  if (!value || value.version !== 1 || typeof value.id !== "string"
    || !/^[a-zA-Z0-9-]{1,128}$/u.test(value.id)
    || !Number.isSafeInteger(value.queuedAt) || value.queuedAt <= 0
    || !validRevision(value.serverRevision) || !value.scope
    || studioSaveIntentScopeKey(value.scope) !== studioSaveIntentScopeKey(scope)
    || Object.keys(value).sort().join() !== "id,queuedAt,scope,serverRevision,version"
    || Object.keys(value.scope).sort().join() !== "documentKey,ownerId") {
    throw new Error("저장 대기 기록이 손상되었거나 다른 문서의 기록입니다. 원고는 변경하지 않았습니다.");
  }
  return value;
}

/** Serializes this namespace, including read/check/delete, across instances and browser tabs. */
function exclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(async () => {
    const locks = globalThis.navigator?.locks;
    return locks ? locks.request(`${STUDIO_DURABLE_SAVE_INTENT_NAMESPACE}:${key}`, operation) : operation();
  });
  tails.set(key, current);
  const retire = () => { if (tails.get(key) === current) tails.delete(key); };
  void current.then(retire, retire);
  return current;
}

export function createStudioDurableSaveIntentRepository(options: {
  readonly acquireDatabase?: () => Promise<Database>;
  readonly createId?: () => string;
  readonly now?: () => number;
} = {}) {
  const acquire = options.acquireDatabase ?? acquireStudioLocalDatabase;
  return {
    load(scope: StudioSaveIntentScope): Promise<StudioDurableSaveIntent | null> {
      const key = studioSaveIntentScopeKey(scope);
      return exclusive(key, async () => {
        const raw = await (await acquire()).kvGet(STUDIO_DURABLE_SAVE_INTENT_NAMESPACE, key);
        return raw === null ? null : decodeStudioDurableSaveIntent(raw, scope);
      });
    },
    remember(scope: StudioSaveIntentScope, serverRevision: number | null): Promise<StudioDurableSaveIntent> {
      if (!validRevision(serverRevision)) throw new Error("서버 revision이 올바르지 않습니다.");
      const key = studioSaveIntentScopeKey(scope);
      const entry: StudioDurableSaveIntent = {
        version: 1, id: (options.createId ?? (() => crypto.randomUUID()))(),
        scope: { ...scope }, queuedAt: (options.now ?? Date.now)(), serverRevision,
      };
      const raw = JSON.stringify(entry);
      decodeStudioDurableSaveIntent(raw, scope);
      return exclusive(key, async () => {
        const db = await acquire();
        await db.kvSet(STUDIO_DURABLE_SAVE_INTENT_NAMESPACE, key, raw);
        if (await db.kvGet(STUDIO_DURABLE_SAVE_INTENT_NAMESPACE, key) !== raw) {
          throw new Error("저장 대기 기록을 다시 읽지 못했습니다. 기기 저장 상태를 확인해 주세요.");
        }
        emitStudioDurableSaveIntent(key, entry);
        return entry;
      });
    },
    /** A delayed success/cancel cannot delete a newer user's intent. No revision-only acknowledgement. */
    clear(scope: StudioSaveIntentScope, expectedId: string): Promise<boolean> {
      const key = studioSaveIntentScopeKey(scope);
      return exclusive(key, async () => {
        const db = await acquire();
        const raw = await db.kvGet(STUDIO_DURABLE_SAVE_INTENT_NAMESPACE, key);
        if (raw === null) { emitStudioDurableSaveIntent(key, null); return true; }
        if (decodeStudioDurableSaveIntent(raw, scope).id !== expectedId) return false;
        await db.kvDelete(STUDIO_DURABLE_SAVE_INTENT_NAMESPACE, key);
        if (await db.kvGet(STUDIO_DURABLE_SAVE_INTENT_NAMESPACE, key) !== null) {
          throw new Error("저장 대기 기록을 지우지 못했습니다. 원고는 변경하지 않았습니다.");
        }
        emitStudioDurableSaveIntent(key, null);
        return true;
      });
    },
  };
}
