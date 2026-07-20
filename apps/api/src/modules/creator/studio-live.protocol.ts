import { z } from "zod";

import {
  verifySessionToken,
  type VerifiedSessionToken,
} from "../../../../../lib/server/session";
import { isSessionAllowed } from "../../../../../lib/server/user-lifecycle";

import { STUDIO_CRDT_UPDATE_MAX_BYTES } from "./studio-crdt.repository";
import { STUDIO_CRDT_STATE_VECTOR_MAX_BYTES } from "./studio-crdt.service";

import type { CreatorCollaborationViewerRole } from "./creator-collaboration.policy";
import type { Namespace, Socket } from "socket.io";

export const STUDIO_LIVE_INTER_SERVER_RELAY_EVENT = "studio:internal:peer-relay:v1";
const STUDIO_LIVE_SIGNAL_SDP_MAX_LENGTH = 48 * 1_024;
const STUDIO_LIVE_SIGNAL_CANDIDATE_MAX_LENGTH = 8 * 1_024;

const isControlCharacterCode = (codePoint: number): boolean =>
  codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);

const noControlCharacters = (value: string): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (isControlCharacterCode(codePoint)) return false;
  }
  return true;
};

const noControlCharactersExceptSdpLineEndings = (value: string): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint === 0x0a || codePoint === 0x0d) continue;
    if (isControlCharacterCode(codePoint)) return false;
  }
  return true;
};

const isNonBlankString = (value: string): boolean => value.trim().length > 0;

const fitsSignalStringByteContract = (value: string, maximumBytes: number): boolean => {
  if (Buffer.byteLength(value, "utf8") > maximumBytes) return false;
  const serialized = JSON.stringify(value);
  return Buffer.byteLength(serialized, "utf8") - 2 <= maximumBytes;
};

const boundedIdentifier = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value === value.trim(), "identifier must be canonical")
    .refine(noControlCharacters, "control characters are not allowed");

const WorkIdSchema = boundedIdentifier(160);
const ClientInstanceIdSchema = boundedIdentifier(80);
const PageIdSchema = boundedIdentifier(160);
const ResourceIdSchema = boundedIdentifier(200);
const ConnectionIdSchema = boundedIdentifier(128);
const ScreenShareIdSchema = boundedIdentifier(160);
const ScreenShareLabelSchema = boundedIdentifier(80);
const VoiceCallIdSchema = boundedIdentifier(160);
export const StudioLiveLockRequestIdSchema = z.uuid();
export const STUDIO_LIVE_LOCK_PROTOCOL_VERSION = 2 as const;

// v4 is the first room protocol that accepts drawing-assist v2 with authored advanced rulers.
// Rejecting v1-v3 prevents stale tabs from sharing a Yjs room whose page schema they cannot
// interpret safely.
export const STUDIO_CRDT_PROTOCOL_VERSION = 4 as const;
const StudioCrdtProtocolVersionSchema = z.literal(STUDIO_CRDT_PROTOCOL_VERSION);
const StudioCrdtRequestIdSchema = boundedIdentifier(160);
const StudioCrdtUpdateIdSchema = z.uuid();
const STUDIO_CRDT_BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

const encodedBase64 = (maximumDecodedBytes: number) =>
  z
    .string()
    .min(4)
    .max(Math.ceil(maximumDecodedBytes / 3) * 4)
    .regex(STUDIO_CRDT_BASE64_PATTERN)
    .refine(
      (value) => Buffer.from(value, "base64").toString("base64") === value,
      "base64 must use its canonical encoding"
    );

export const StudioLiveJoinSchema = z
  .object({
    workId: WorkIdSchema,
    clientInstanceId: ClientInstanceIdSchema,
  })
  .strict();

export const StudioLivePresenceSchema = z
  .object({
    workId: WorkIdSchema,
    state: z.enum(["active", "idle", "away"]),
    pageId: PageIdSchema.nullable().optional(),
    tool: boundedIdentifier(48).nullable().optional(),
  })
  .strict();

export const StudioLiveCursorSchema = z
  .object({
    workId: WorkIdSchema,
    pageId: PageIdSchema.nullable(),
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })
  .strict();

export const StudioLiveLockRequestSchema = z
  .object({
    workId: WorkIdSchema,
    resourceId: ResourceIdSchema,
    // Explicit opt-in keeps v1 clients on their stable-lease behavior while API nodes roll out.
    protocolVersion: z.literal(STUDIO_LIVE_LOCK_PROTOCOL_VERSION).optional(),
    // Optional during the rolling upgrade. New clients send a UUID and the server echoes the same
    // value from every acquired/denied/revoked decision; older clients receive a server UUID.
    requestId: StudioLiveLockRequestIdSchema.optional(),
    // v2 renewal fence. A delayed heartbeat may only rotate the exact lease it observed; it must
    // never recreate a lease that a newer release already removed.
    renewLeaseId: boundedIdentifier(80).optional(),
    leaseMs: z.number().int().min(5_000).max(30_000).default(15_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.renewLeaseId !== undefined &&
      value.protocolVersion !== STUDIO_LIVE_LOCK_PROTOCOL_VERSION
    ) {
      context.addIssue({
        code: "custom",
        path: ["protocolVersion"],
        message: "renewLeaseId requires lock protocol v2",
      });
    }
    if (
      value.protocolVersion === STUDIO_LIVE_LOCK_PROTOCOL_VERSION &&
      value.requestId === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["requestId"],
        message: "lock protocol v2 requires request correlation",
      });
    }
  });

export const StudioLiveLockReleaseSchema = z
  .object({
    workId: WorkIdSchema,
    resourceId: ResourceIdSchema,
    leaseId: boundedIdentifier(80),
    // Optional for one rolling-deploy window. v2 clients send a UUID and v2 servers echo it from
    // success and failure ACKs; v1 clients continue to receive a server-generated correlation id.
    requestId: StudioLiveLockRequestIdSchema.optional(),
  })
  .strict();

export const StudioLiveScreenStateSchema = z
  .object({
    workId: WorkIdSchema,
    sharing: z.boolean(),
  })
  .strict();

export const StudioLiveScreenAccessSchema = z
  .object({
    workId: WorkIdSchema,
    targetConnectionId: ConnectionIdSchema,
    shareId: ScreenShareIdSchema,
    decision: z.enum(["approved", "rejected", "ended"]),
  })
  .strict();

export const StudioLiveScreenAnnounceSchema = z
  .object({
    workId: WorkIdSchema,
    shareId: ScreenShareIdSchema,
    label: ScreenShareLabelSchema,
  })
  .strict();

export const StudioLiveScreenRequestSchema = z
  .object({
    workId: WorkIdSchema,
    targetConnectionId: ConnectionIdSchema,
    shareId: ScreenShareIdSchema,
  })
  .strict();

export const StudioLiveScreenStopSchema = z
  .object({
    workId: WorkIdSchema,
    shareId: ScreenShareIdSchema,
  })
  .strict();

export const StudioLiveVoiceJoinSchema = z
  .object({
    workId: WorkIdSchema,
    callId: VoiceCallIdSchema,
    muted: z.boolean(),
  })
  .strict();

export const StudioLiveVoiceStateSchema = StudioLiveVoiceJoinSchema;

export const StudioLiveVoiceLeaveSchema = z
  .object({
    workId: WorkIdSchema,
    callId: VoiceCallIdSchema,
  })
  .strict();

// Mirrors STUDIO_LIVE_CHAT_TEXT_MAX_LENGTH in the browser protocol module.
const STUDIO_LIVE_CHAT_TEXT_MAX_LENGTH = 500;

export const StudioLiveChatSchema = z
  .object({
    workId: WorkIdSchema,
    messageId: boundedIdentifier(160),
    text: z
      .string()
      .trim()
      .min(1)
      .max(STUDIO_LIVE_CHAT_TEXT_MAX_LENGTH)
      .refine(noControlCharacters, "control characters are not allowed"),
  })
  .strict();

const StudioLiveSessionDescriptionSchema = z
  .object({
    type: z.enum(["offer", "answer"]),
    sdp: z
      .string()
      .min(1)
      .max(STUDIO_LIVE_SIGNAL_SDP_MAX_LENGTH)
      .refine(
        (value) => fitsSignalStringByteContract(value, STUDIO_LIVE_SIGNAL_SDP_MAX_LENGTH),
        "SDP exceeds the byte budget"
      )
      .refine(isNonBlankString, "SDP must not be blank")
      .refine(
        noControlCharactersExceptSdpLineEndings,
        "SDP control characters other than CR/LF are not allowed"
      ),
  })
  .strict();

const StudioLiveIceCandidateSchema = z
  .object({
    candidate: z
      .string()
      .min(1)
      .max(STUDIO_LIVE_SIGNAL_CANDIDATE_MAX_LENGTH)
      .refine(
        (value) => fitsSignalStringByteContract(value, STUDIO_LIVE_SIGNAL_CANDIDATE_MAX_LENGTH),
        "ICE candidate exceeds the byte budget"
      )
      .refine(isNonBlankString, "ICE candidate must not be blank")
      .refine(noControlCharacters, "ICE candidate control characters are not allowed"),
    sdpMid: z
      .string()
      .max(128)
      .refine(noControlCharacters, "ICE sdpMid control characters are not allowed")
      .nullable()
      .optional(),
    sdpMLineIndex: z.number().int().min(0).max(65_535).nullable().optional(),
    usernameFragment: z
      .string()
      .max(256)
      .refine(noControlCharacters, "ICE username fragment control characters are not allowed")
      .nullable()
      .optional(),
  })
  .strict();

export const StudioLiveSignalSchema = z.discriminatedUnion("kind", [
  z
    .object({
      workId: WorkIdSchema,
      targetConnectionId: ConnectionIdSchema,
      shareId: ScreenShareIdSchema,
      kind: z.literal("description"),
      description: StudioLiveSessionDescriptionSchema,
    })
    .strict(),
  z
    .object({
      workId: WorkIdSchema,
      targetConnectionId: ConnectionIdSchema,
      shareId: ScreenShareIdSchema,
      kind: z.literal("candidate"),
      candidate: StudioLiveIceCandidateSchema,
    })
    .strict(),
  z
    .object({
      workId: WorkIdSchema,
      targetConnectionId: ConnectionIdSchema,
      shareId: ScreenShareIdSchema,
      kind: z.literal("bye"),
    })
    .strict(),
]);

export const StudioLiveVoiceSignalSchema = z.discriminatedUnion("kind", [
  z
    .object({
      workId: WorkIdSchema,
      targetConnectionId: ConnectionIdSchema,
      callId: VoiceCallIdSchema,
      kind: z.literal("description"),
      description: StudioLiveSessionDescriptionSchema,
    })
    .strict(),
  z
    .object({
      workId: WorkIdSchema,
      targetConnectionId: ConnectionIdSchema,
      callId: VoiceCallIdSchema,
      kind: z.literal("candidate"),
      candidate: StudioLiveIceCandidateSchema,
    })
    .strict(),
]);

export const StudioLiveVoiceMemberSchema = z
  .object({
    connectionId: ConnectionIdSchema,
    callId: VoiceCallIdSchema,
    muted: z.boolean(),
  })
  .strict();

export const StudioLivePublicParticipantSchema = z
  .object({
    connectionId: ConnectionIdSchema,
    clientInstanceId: ClientInstanceIdSchema,
    name: boundedIdentifier(80),
    role: z.enum(["owner", "admin", "editor", "commenter", "viewer"]),
    capabilities: z
      .object({
        view: z.literal(true),
        comment: z.boolean(),
        edit: z.boolean(),
        manageMembers: z.boolean(),
      })
      .strict(),
    state: z.enum(["active", "idle", "away"]),
    pageId: PageIdSchema.nullable(),
    tool: boundedIdentifier(48).nullable(),
    sharingScreen: z.boolean(),
    joinedAt: z.string().max(64).pipe(z.iso.datetime({ offset: true })),
    updatedAt: z.string().max(64).pipe(z.iso.datetime({ offset: true })),
  })
  .strict();

export const StudioLiveInterServerRelayEventSchema = z.union([
  z
    .object({
      type: z.literal("screen-request"),
      shareId: ScreenShareIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("screen-access"),
      shareId: ScreenShareIdSchema,
      decision: z.enum(["approved", "rejected", "ended"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("signal"),
      signalId: z.uuid(),
      shareId: ScreenShareIdSchema,
      kind: z.literal("description"),
      description: StudioLiveSessionDescriptionSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("signal"),
      signalId: z.uuid(),
      shareId: ScreenShareIdSchema,
      kind: z.literal("candidate"),
      candidate: StudioLiveIceCandidateSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("signal"),
      signalId: z.uuid(),
      shareId: ScreenShareIdSchema,
      kind: z.literal("bye"),
    })
    .strict(),
  z
    .object({
      type: z.literal("voice-signal"),
      signalId: z.uuid(),
      callId: VoiceCallIdSchema,
      kind: z.literal("description"),
      description: StudioLiveSessionDescriptionSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("voice-signal"),
      signalId: z.uuid(),
      callId: VoiceCallIdSchema,
      kind: z.literal("candidate"),
      candidate: StudioLiveIceCandidateSchema,
    })
    .strict(),
]);

export const StudioLiveInterServerRelayRequestSchema = z
  .object({
    workId: WorkIdSchema,
    targetConnectionId: ConnectionIdSchema,
    deadlineAt: z.number().int().safe(),
    sender: StudioLivePublicParticipantSchema,
    relay: StudioLiveInterServerRelayEventSchema,
  })
  .strict();

export const StudioLiveInterServerRelayResponseSchema = z
  .object({ delivered: z.boolean() })
  .strict();

export const StudioLiveCrdtSyncSchema = z
  .object({
    protocolVersion: StudioCrdtProtocolVersionSchema,
    workId: WorkIdSchema,
    requestId: StudioCrdtRequestIdSchema,
    stateVector: encodedBase64(STUDIO_CRDT_STATE_VECTOR_MAX_BYTES),
  })
  .strict();

export const StudioLiveCrdtUpdateSchema = z
  .object({
    protocolVersion: StudioCrdtProtocolVersionSchema,
    workId: WorkIdSchema,
    updateId: StudioCrdtUpdateIdSchema,
    clientSequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    update: encodedBase64(STUDIO_CRDT_UPDATE_MAX_BYTES),
  })
  .strict();

export type StudioLiveJoinInput = z.infer<typeof StudioLiveJoinSchema>;
export type StudioLivePresenceInput = z.infer<typeof StudioLivePresenceSchema>;
export type StudioLiveCursorInput = z.infer<typeof StudioLiveCursorSchema>;
export type StudioLiveLockRequestInput = z.infer<typeof StudioLiveLockRequestSchema>;
export type StudioLiveLockReleaseInput = z.infer<typeof StudioLiveLockReleaseSchema>;
export type StudioLiveScreenStateInput = z.infer<typeof StudioLiveScreenStateSchema>;
export type StudioLiveScreenAccessInput = z.infer<typeof StudioLiveScreenAccessSchema>;
export type StudioLiveScreenAnnounceInput = z.infer<typeof StudioLiveScreenAnnounceSchema>;
export type StudioLiveScreenRequestInput = z.infer<typeof StudioLiveScreenRequestSchema>;
export type StudioLiveScreenStopInput = z.infer<typeof StudioLiveScreenStopSchema>;
export type StudioLiveChatInput = z.infer<typeof StudioLiveChatSchema>;
export type StudioLiveSignalInput = z.infer<typeof StudioLiveSignalSchema>;
export type StudioLiveVoiceJoinInput = z.infer<typeof StudioLiveVoiceJoinSchema>;
export type StudioLiveVoiceStateInput = z.infer<typeof StudioLiveVoiceStateSchema>;
export type StudioLiveVoiceLeaveInput = z.infer<typeof StudioLiveVoiceLeaveSchema>;
export type StudioLiveVoiceSignalInput = z.infer<typeof StudioLiveVoiceSignalSchema>;
export type StudioLiveInterServerRelayEvent = z.infer<
  typeof StudioLiveInterServerRelayEventSchema
>;
export type StudioLiveInterServerRelayRequest = z.infer<
  typeof StudioLiveInterServerRelayRequestSchema
>;
export type StudioLiveInterServerRelayResponse = z.infer<
  typeof StudioLiveInterServerRelayResponseSchema
>;
export type StudioLiveCrdtSyncInput = z.infer<typeof StudioLiveCrdtSyncSchema>;
export type StudioLiveCrdtUpdateInput = z.infer<typeof StudioLiveCrdtUpdateSchema>;

export interface StudioLiveCrdtSyncResult {
  protocolVersion: typeof STUDIO_CRDT_PROTOCOL_VERSION;
  workId: string;
  requestId: string;
  transferId: string;
  chunks: string[];
  chunkCount: number;
  totalBytes: number;
  serverStateVector: string;
  serverSequence: string;
}

export interface StudioLiveCrdtUpdateAck {
  protocolVersion: typeof STUDIO_CRDT_PROTOCOL_VERSION;
  workId: string;
  updateId: string;
  serverSequence: string;
  serverStateVector: string;
  duplicate: boolean;
}

export interface StudioLiveCrdtRemoteUpdate {
  protocolVersion: typeof STUDIO_CRDT_PROTOCOL_VERSION;
  workId: string;
  updateId: string;
  serverSequence: string;
  update: string;
}

export interface StudioLiveParticipant {
  connectionId: string;
  clientInstanceId: string;
  name: string;
  role: CreatorCollaborationViewerRole;
  capabilities: {
    view: true;
    comment: boolean;
    edit: boolean;
    manageMembers: boolean;
  };
  state: "active" | "idle" | "away";
  pageId: string | null;
  tool: string | null;
  sharingScreen: boolean;
  joinedAt: string;
  updatedAt: string;
}

export interface StudioLiveLock {
  resourceId: string;
  leaseId: string;
  ownerConnectionId: string;
  ownerName: string;
  expiresAt: string;
}

export interface StudioLiveVoiceMember {
  connectionId: string;
  callId: string;
  muted: boolean;
}

export type StudioLiveSuccess<T> = { ok: true; data: T };
export type StudioLiveFailureCode =
  | "unauthenticated"
  | "forbidden"
  | "invalid_payload"
  | "not_joined"
  | "rate_limited"
  | "lock_conflict"
  | "lock_stale"
  | "lock_limit"
  | "peer_unavailable"
  | "temporarily_unavailable"
  | "storage_corruption"
  | "internal_error";
export type StudioLiveFailure = {
  ok: false;
  code: StudioLiveFailureCode;
  message: string;
};
export type StudioLiveAck<T> = StudioLiveSuccess<T> | StudioLiveFailure;
export type StudioLiveAckCallback<T> = (response: StudioLiveAck<T>) => void;

export interface StudioLiveLockAcquiredDecision {
  decision: "acquired";
  requestId: string;
  lock: StudioLiveLock;
}

export type StudioLiveLockRequestFailure = StudioLiveFailure & {
  decision: "denied" | "revoked";
  requestId: string;
  /** Present for a hierarchical or exact-resource conflict. */
  lock?: StudioLiveLock;
};

export type StudioLiveLockRequestAck =
  | StudioLiveSuccess<StudioLiveLockAcquiredDecision>
  | StudioLiveLockRequestFailure;

export interface StudioLiveLockReleaseDecision {
  requestId: string;
  resourceId: string;
  leaseId: string;
  released: boolean;
}

export type StudioLiveLockReleaseFailure = StudioLiveFailure & {
  requestId: string;
};

export type StudioLiveLockReleaseAck =
  | StudioLiveSuccess<StudioLiveLockReleaseDecision>
  | StudioLiveLockReleaseFailure;

export type StudioLiveLockUpdate =
  | {
      action: "acquired";
      requestId: string;
      lock: StudioLiveLock;
    }
  | {
      action: "released";
      requestId: string;
      /** Release-operation correlation is additive; requestId remains the acquisition correlation. */
      releaseRequestId?: string;
      resourceId: string;
      leaseId: string;
    }
  | {
      action: "expired" | "revoked";
      requestId: string;
      resourceId: string;
      leaseId: string;
    };

export interface StudioLiveJoinResult {
  lockProtocolVersion: typeof STUDIO_LIVE_LOCK_PROTOCOL_VERSION;
  self: StudioLiveParticipant;
  participants: StudioLiveParticipant[];
  locks: StudioLiveLock[];
  voiceMembers: StudioLiveVoiceMember[];
}

export interface StudioLiveSocketData {
  /**
   * Adapter-visible, public-only presence record. Shared Socket.IO adapters expose `socket.data`
   * through `fetchSockets()`, so this is the cluster-safe discovery surface. Never place the
   * internal user id, work authorization timestamps, or session principal in this record.
   */
  studioParticipant?: StudioLiveParticipant;
  studioWorkId?: string;
  studioVoiceMember?: StudioLiveVoiceMember;
}

export interface StudioLiveClientToServerEvents {
  [event: string]: (...args: unknown[]) => void;
}

export interface StudioLiveServerToClientEvents {
  [event: string]: (...args: unknown[]) => void;
}

export interface StudioLiveInterServerEvents {
  [STUDIO_LIVE_INTER_SERVER_RELAY_EVENT]: (
    request: StudioLiveInterServerRelayRequest,
    ack: (response: StudioLiveInterServerRelayResponse) => void
  ) => void;
}

export type StudioLiveSocket = Socket<
  StudioLiveClientToServerEvents,
  StudioLiveServerToClientEvents,
  StudioLiveInterServerEvents,
  StudioLiveSocketData
>;

export type StudioLiveNamespace = Namespace<
  StudioLiveClientToServerEvents,
  StudioLiveServerToClientEvents,
  StudioLiveInterServerEvents,
  StudioLiveSocketData
>;

export type StudioLiveAuthPrincipal = VerifiedSessionToken;
export type StudioLiveSessionAuthenticator = (
  token: string
) => Promise<StudioLiveAuthPrincipal | null>;
export type StudioLiveSessionRevalidator = (
  principal: StudioLiveAuthPrincipal
) => Promise<boolean>;

export const STUDIO_LIVE_SESSION_AUTHENTICATOR = Symbol("STUDIO_LIVE_SESSION_AUTHENTICATOR");
export const STUDIO_LIVE_SESSION_REVALIDATOR = Symbol("STUDIO_LIVE_SESSION_REVALIDATOR");

export const studioLiveSessionAuthenticatorProvider = {
  provide: STUDIO_LIVE_SESSION_AUTHENTICATOR,
  useValue: (async (token: string): Promise<StudioLiveAuthPrincipal | null> => {
    try {
      const session = verifySessionToken(token);
      if (!session) return null;
      return (await isSessionAllowed(session.userId, session.sessionVersion)) ? session : null;
    } catch {
      return null;
    }
  }) satisfies StudioLiveSessionAuthenticator,
};

export const studioLiveSessionRevalidatorProvider = {
  provide: STUDIO_LIVE_SESSION_REVALIDATOR,
  useValue: (async (principal: StudioLiveAuthPrincipal): Promise<boolean> => {
    if (principal.expiresAt <= Date.now()) return false;
    try {
      return await isSessionAllowed(principal.userId, principal.sessionVersion);
    } catch {
      return false;
    }
  }) satisfies StudioLiveSessionRevalidator,
};
