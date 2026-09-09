import { isStudioEditorCollaborationLocked } from "../../studio-editor-scope";

export interface StudioCollaborationAccessPolicyInput {
  /** Saved ACL-backed work. Its operation lane must also prove durable protection. */
  readonly expectsSharedDocument: boolean;
  /** A room opened by another tab/session that must converge before local mutation is admitted. */
  readonly joinedLiveJam: boolean;
  /** The session is routed through the live collaboration transport. */
  readonly realtimeSession: boolean;
  /** A participant exists and its current role is allowed to mutate the document. */
  readonly participantCanEdit: boolean;
  /** The CRDT document, scene runtime, and initial frontier are exposed as one generation. */
  readonly documentReady: boolean;
  /** Saved team work has a server or browser-durable operation sink. */
  readonly editsDurablyProtected: boolean;
  /** ACL, hydration, revision, or reload lock independent from the operation lane. */
  readonly documentAccessLocked: boolean;
}

export interface StudioCollaborationAccessPolicy {
  readonly operationSyncRequired: boolean;
  readonly operationDurabilityRequired: boolean;
  readonly operationSyncReady: boolean;
  readonly operationSyncPending: boolean;
  readonly documentLocked: boolean;
}

/**
 * Separates ephemeral presence readiness from authoritative document readiness.
 *
 * Presence/cursors can become available before the lazily loaded CRDT bridge has paired its Yjs
 * document with the scene runtime. Saved ACL-backed work and tabs that explicitly joined another
 * live room remain fail-closed until that pair and its initial frontier are ready. The tab that
 * owns a brand-new local draft is different: it may warm the realtime lane in the background, but
 * CRDT startup or a temporarily unavailable live server must not disable local drawing. Once a
 * second tab joins the published room, that joiner still waits for convergence before mutating.
 */
export function projectStudioCollaborationAccessPolicy({
  expectsSharedDocument,
  joinedLiveJam,
  realtimeSession,
  participantCanEdit,
  documentReady,
  editsDurablyProtected,
  documentAccessLocked,
}: StudioCollaborationAccessPolicyInput): StudioCollaborationAccessPolicy {
  const operationSyncRequired = realtimeSession && participantCanEdit;
  const operationDurabilityRequired = expectsSharedDocument && operationSyncRequired;
  const operationSyncReady = documentReady && (
    !operationDurabilityRequired || editsDurablyProtected
  );
  const operationSyncPending = operationSyncRequired && !operationSyncReady;
  const documentLocked = (expectsSharedDocument || joinedLiveJam) && isStudioEditorCollaborationLocked({
    documentAccessLocked,
    operationSyncRequired,
    operationSyncReady,
  });

  return {
    operationSyncRequired,
    operationDurabilityRequired,
    operationSyncReady,
    operationSyncPending,
    documentLocked,
  };
}
