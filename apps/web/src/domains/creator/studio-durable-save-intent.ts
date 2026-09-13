/** Content-free save intent; never a manuscript, authentication token or automatic replay job. */

import type { createStudioDurableSaveIntentRepository } from "./studio-durable-save-intent-sqlite";

export async function boundStudioSaveIntentOperation<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("기기 저장 대기 응답이 지연되고 있습니다.")), 2000);
    })]);
  } finally { clearTimeout(timer); }
}

export const STUDIO_DURABLE_SAVE_INTENT_NAMESPACE = "studio-save-intent-v12";
export interface StudioSaveIntentScope {
  readonly ownerId: string | null;
  readonly documentKey: string;
}
export interface StudioDurableSaveIntent {
  readonly version: 1;
  readonly id: string;
  readonly scope: StudioSaveIntentScope;
  readonly queuedAt: number;
  readonly serverRevision: number | null;
}
type Listener = (key: string, entry: StudioDurableSaveIntent | null) => void;
const listeners = new Set<Listener>();

export function studioSaveIntentScopeKey(scope: StudioSaveIntentScope): string {
  if ((scope.ownerId !== null && (typeof scope.ownerId !== "string"
    || !scope.ownerId.trim() || scope.ownerId.length > 512))
    || typeof scope.documentKey !== "string" || !scope.documentKey.trim()
    || scope.documentKey.length > 2048) throw new Error("저장 대기 문서 범위를 확인하지 못했습니다.");
  return JSON.stringify([scope.ownerId, scope.documentKey]);
}

export function subscribeStudioDurableSaveIntent(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function emitStudioDurableSaveIntent(key: string, entry: StudioDurableSaveIntent | null): void {
  for (const listener of listeners) {
    try { listener(key, entry); } catch { /* Observers cannot invalidate a committed row. */ }
  }
}
type Repository = ReturnType<typeof createStudioDurableSaveIntentRepository>;
let persistence: Promise<Repository> | null = null;
function repository(): Promise<Repository> {
  persistence ??= import("./studio-durable-save-intent-sqlite")
    .then((module) => module.createStudioDurableSaveIntentRepository())
    .catch((error: unknown) => { persistence = null; throw error; });
  return persistence;
}
/** Lazy metadata implementation keeps schema/SQLite utilities out of the initial drawing closure. */
export const studioDurableSaveIntentRepository: Repository = {
  load: (scope) => repository().then((store) => store.load(scope)),
  remember: (scope, revision) => repository().then((store) => store.remember(scope, revision)),
  clear: (scope, id) => repository().then((store) => store.clear(scope, id)),
};

// Only the save pipeline's verified success path publishes this acknowledgement.
// Promise fulfillment, a revision refresh, reconnect, and metadata dialogs do not.
const acknowledgements = new Map<string, number>();
let acknowledgementSequence = 0;
export function studioSaveAcknowledgementVersion(scope: StudioSaveIntentScope): number {
  return acknowledgements.get(studioSaveIntentScopeKey(scope)) ?? 0;
}
export async function acknowledgeStudioDurableSaveIntent(
  scope: StudioSaveIntentScope, captured: StudioDurableSaveIntent | null,
): Promise<void> {
  const key = studioSaveIntentScopeKey(scope);
  acknowledgements.delete(key);
  acknowledgements.set(key, ++acknowledgementSequence);
  if (acknowledgements.size > 64) acknowledgements.delete(acknowledgements.keys().next().value!);
  if (captured) await boundStudioSaveIntentOperation(studioDurableSaveIntentRepository.clear(scope, captured.id));
}
