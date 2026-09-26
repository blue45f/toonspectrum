import { createHmac, timingSafeEqual } from "node:crypto";

import {
  PrivateObjectReferenceSchema,
  type PrivateObjectReference,
} from "../../platform/adapters/private-object-storage/private-object-storage.contract";

const TOKEN_VERSION = "v1";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60_000;
const DEVELOPMENT_SECRET = "toonspectrum-creator-intelligence-dev-secret";

interface MeshJobTokenPayload {
  readonly sub: string;
  readonly job: string;
  readonly exp: number;
}

function signingSecret(): string {
  const configured = process.env.AUTH_SESSION_SECRET?.trim()
    || process.env.AUTH_STATE_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Creator Intelligence mesh tokens require AUTH_SESSION_SECRET.");
  }
  return DEVELOPMENT_SECRET;
}

function signature(body: string): string {
  return createHmac("sha256", signingSecret())
    .update(body, "utf8")
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  try {
    return timingSafeEqual(Buffer.from(left), Buffer.from(right));
  } catch {
    return false;
  }
}

function validUserId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 256) {
    throw new TypeError("invalid mesh job owner");
  }
  return normalized;
}

function validJobId(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{6,120}$/u.test(normalized)) {
    throw new TypeError("invalid mesh job id");
  }
  return normalized;
}

export function signCreatorIntelligenceMeshJobToken(
  userIdValue: string,
  jobIdValue: string,
  now = Date.now(),
): string {
  const payload: MeshJobTokenPayload = {
    sub: validUserId(userIdValue),
    job: validJobId(jobIdValue),
    exp: now + TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const body = `${TOKEN_VERSION}.${encoded}`;
  return `${body}.${signature(body)}`;
}

export function verifyCreatorIntelligenceMeshJobToken(
  tokenValue: string,
  userIdValue: string,
  now = Date.now(),
): string | null {
  const token = tokenValue.trim();
  if (!token || token.length > 768) return null;
  const [version, encoded, provided, extra] = token.split(".");
  if (version !== TOKEN_VERSION || !encoded || !provided || extra !== undefined) return null;
  const body = `${version}.${encoded}`;
  if (!safeEqual(provided, signature(body))) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<MeshJobTokenPayload>;
    if (payload.sub !== validUserId(userIdValue)) return null;
    if (!Number.isSafeInteger(payload.exp) || Number(payload.exp) <= now) return null;
    return validJobId(String(payload.job ?? ""));
  } catch {
    return null;
  }
}


const ARTIFACT_TOKEN_VERSION = "v1a";
const ARTIFACT_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000;

interface MeshArtifactTokenPayload {
  readonly sub: string;
  readonly object: PrivateObjectReference;
  readonly filename: string;
  readonly exp: number;
}

export interface VerifiedCreatorIntelligenceMeshArtifact {
  readonly object: PrivateObjectReference;
  readonly filename: string;
}

function validFilename(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/u.test(normalized)) {
    throw new TypeError("invalid mesh artifact filename");
  }
  return normalized;
}

export function signCreatorIntelligenceMeshArtifactToken(
  userIdValue: string,
  objectValue: PrivateObjectReference,
  filenameValue: string,
  now = Date.now(),
): string {
  const payload: MeshArtifactTokenPayload = {
    sub: validUserId(userIdValue),
    object: PrivateObjectReferenceSchema.parse(objectValue),
    filename: validFilename(filenameValue),
    exp: now + ARTIFACT_TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const body = `${ARTIFACT_TOKEN_VERSION}.${encoded}`;
  return `${body}.${signature(body)}`;
}

export function verifyCreatorIntelligenceMeshArtifactToken(
  tokenValue: string,
  userIdValue: string,
  now = Date.now(),
): VerifiedCreatorIntelligenceMeshArtifact | null {
  const token = tokenValue.trim();
  if (!token || token.length > 4096) return null;
  const [version, encoded, provided, extra] = token.split(".");
  if (
    version !== ARTIFACT_TOKEN_VERSION
    || !encoded
    || !provided
    || extra !== undefined
  ) return null;
  const body = `${version}.${encoded}`;
  if (!safeEqual(provided, signature(body))) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<MeshArtifactTokenPayload>;
    if (payload.sub !== validUserId(userIdValue)) return null;
    if (!Number.isSafeInteger(payload.exp) || Number(payload.exp) <= now) return null;
    return Object.freeze({
      object: PrivateObjectReferenceSchema.parse(payload.object),
      filename: validFilename(String(payload.filename ?? "")),
    });
  } catch {
    return null;
  }
}
