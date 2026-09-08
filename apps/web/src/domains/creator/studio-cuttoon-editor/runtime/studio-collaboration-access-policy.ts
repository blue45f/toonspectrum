import { isStudioEditorCollaborationLocked } from "../../studio-editor-scope";

export interface StudioCollaborationAccessPolicyInput {
  /** Saved ACL-backed work. Its operation lane must also prove durable protection. */
  readonly expectsSharedDocument: boolean;
  /** Instant or room-link collaboration, including a new unsaved Studio document. */
  readonly liveJam: boolean;
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
 * document with the scene runtime. Every editable realtime session must therefore wait for that
 * pair and its initial frontier. Saved ACL-backed work additionally waits for durable protection;
 * an unsaved same-origin jam deliberately does not, because only one tab owns the autosave lease
 * while every joined tab is still allowed to contribute CRDT operations.
 */
export function projectStudioCollaborationAccessPolicy({
  expectsSharedDocument,
  liveJam,
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
  const documentLocked = (expectsSharedDocument || liveJam) && isStudioEditorCollaborationLocked({
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
