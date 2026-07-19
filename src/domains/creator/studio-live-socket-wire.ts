import {
  STUDIO_LIVE_SDP_MAX_LENGTH,
  studioLiveDisplayName,
  studioLiveStringFitsByteContract,
  type StudioLiveParticipant,
} from "./studio-live-collaboration-protocol";

export type ServerRole = StudioLiveParticipant["role"];

export interface ServerParticipant {
  connectionId: string;
  clientInstanceId: string;
  name: string;
  role: ServerRole;
  state: "active" | "idle" | "away";
  pageId: string | null;
  tool: string | null;
  sharingScreen: boolean;
  updatedAt: string;
}

export interface ServerLock {
  resourceId: string;
  leaseId: string;
  ownerConnectionId: string;
  ownerName: string;
  expiresAt: string;
}

export interface ServerVoiceMember {
  connectionId: string;
  callId: string;
  muted: boolean;
}

export interface ServerJoinSnapshot {
  /** Missing on v1 gateways; new clients retain their legacy wire behavior in that case. */
  lockProtocolVersion: number;
  self: ServerParticipant;
  participants: ServerParticipant[];
  locks: ServerLock[];
  voiceMembers: ServerVoiceMember[];
}

export interface ServerFailure {
  ok: false;
  code: string;
  message: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasDisallowedControlCharacter(value: string, allowSdpLineEndings = false): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (allowSdpLineEndings && (codePoint === 10 || codePoint === 13)) continue;
    if (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)) return true;
  }
  return false;
}

export function safeString(value: unknown, maximum: number, allowEmpty = false): value is string {
  if (typeof value !== "string" || value.length > maximum) return false;
  if (hasDisallowedControlCharacter(value)) return false;
  if (allowEmpty) return true;
  return value.trim().length > 0;
}

export function safeIdentifier(value: unknown, maximum: number): value is string {
  return safeString(value, maximum) && value === value.trim();
}

export function nullableString(
  value: unknown,
  maximum: number,
  allowEmpty = false
): value is string | null {
  return value === null || safeString(value, maximum, allowEmpty);
}

export function safeSdpString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= STUDIO_LIVE_SDP_MAX_LENGTH &&
    studioLiveStringFitsByteContract(value, STUDIO_LIVE_SDP_MAX_LENGTH) &&
    value.trim().length > 0 &&
    !hasDisallowedControlCharacter(value, true)
  );
}

export function isRole(value: unknown): value is ServerRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "editor" ||
    value === "commenter" ||
    value === "viewer"
  );
}

export function parseParticipant(value: unknown): ServerParticipant | null {
  if (
    !isRecord(value) ||
    !safeString(value.connectionId, 128) ||
    !safeString(value.clientInstanceId, 80) ||
    typeof value.name !== "string" ||
    !isRole(value.role) ||
    (value.state !== "active" && value.state !== "idle" && value.state !== "away") ||
    !nullableString(value.pageId, 160) ||
    !nullableString(value.tool, 48) ||
    typeof value.sharingScreen !== "boolean" ||
    typeof value.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.updatedAt))
  ) {
    return null;
  }
  return {
    connectionId: value.connectionId,
    clientInstanceId: value.clientInstanceId,
    name: value.name,
    role: value.role,
    state: value.state,
    pageId: value.pageId,
    tool: value.tool,
    sharingScreen: value.sharingScreen,
    updatedAt: value.updatedAt,
  };
}

export function parseLock(value: unknown): ServerLock | null {
  if (
    !isRecord(value) ||
    !safeString(value.resourceId, 200) ||
    !safeString(value.leaseId, 80) ||
    !safeString(value.ownerConnectionId, 128) ||
    typeof value.ownerName !== "string" ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.expiresAt))
  ) {
    return null;
  }
  return {
    resourceId: value.resourceId,
    leaseId: value.leaseId,
    ownerConnectionId: value.ownerConnectionId,
    ownerName: value.ownerName,
    expiresAt: value.expiresAt,
  };
}

export function parseVoiceMember(value: unknown): ServerVoiceMember | null {
  if (
    !isRecord(value) ||
    !safeIdentifier(value.connectionId, 128) ||
    !safeIdentifier(value.callId, 160) ||
    typeof value.muted !== "boolean"
  ) {
    return null;
  }
  return {
    connectionId: value.connectionId,
    callId: value.callId,
    muted: value.muted,
  };
}

export function parseFailure(value: unknown): ServerFailure | null {
  if (
    !isRecord(value) ||
    value.ok !== false ||
    !safeString(value.code, 80) ||
    !safeString(value.message, 500)
  ) {
    return null;
  }
  return { ok: false, code: value.code, message: value.message };
}

export function parseJoinAck(value: unknown): ServerJoinSnapshot | ServerFailure | null {
  const failure = parseFailure(value);
  if (failure) return failure;
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) return null;
  const self = parseParticipant(value.data.self);
  const lockProtocolVersion = value.data.lockProtocolVersion === undefined
    ? 1
    : value.data.lockProtocolVersion;
  if (
    !self ||
    typeof lockProtocolVersion !== "number" ||
    !Number.isInteger(lockProtocolVersion) ||
    lockProtocolVersion < 1 ||
    lockProtocolVersion > 100 ||
    !Array.isArray(value.data.participants) ||
    !Array.isArray(value.data.locks) ||
    (value.data.voiceMembers !== undefined && !Array.isArray(value.data.voiceMembers))
  ) {
    return null;
  }
  const participants = value.data.participants.map(parseParticipant);
  const locks = value.data.locks.map(parseLock);
  const voiceMembers = Array.isArray(value.data.voiceMembers)
    ? value.data.voiceMembers.map(parseVoiceMember)
    : [];
  if (
    participants.some((participant) => participant === null) ||
    locks.some((lock) => lock === null) ||
    voiceMembers.some((member) => member === null)
  ) {
    return null;
  }
  return {
    lockProtocolVersion,
    self,
    participants: participants as ServerParticipant[],
    locks: locks as ServerLock[],
    voiceMembers: voiceMembers as ServerVoiceMember[],
  };
}

export function publicParticipant(value: ServerParticipant): StudioLiveParticipant {
  return {
    sessionId: value.connectionId,
    displayName: studioLiveDisplayName(value.name, { fallback: "팀원" }),
    role: value.role,
  };
}
