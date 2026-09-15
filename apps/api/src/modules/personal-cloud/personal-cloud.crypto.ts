import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import type {
  PersonalCloudOAuthStatePayload,
  PersonalCloudProviderId,
} from "./personal-cloud.types";

const ENVELOPE_VERSION = "v1";
const STATE_VERSION = "s1";
const STATE_MAX_AGE_MS = 10 * 60_000;

function requireSecret(secret: string, label: string): Buffer {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error(`${label} must contain at least 32 UTF-8 bytes`);
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

function encodedJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodedJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

export function createPersonalCloudPkcePair(): {
  readonly verifier: string;
  readonly challenge: string;
} {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  return Object.freeze({ verifier, challenge });
}

export function createPersonalCloudNonce(): string {
  return randomBytes(24).toString("base64url");
}

export function encryptPersonalCloudSecret(
  plaintext: string,
  context: string,
  secret: string,
): string {
  const key = requireSecret(secret, "personal cloud token encryption key");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENVELOPE_VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptPersonalCloudSecret(
  envelope: string,
  context: string,
  secret: string,
): string {
  const [version, ivValue, ciphertextValue, tagValue, ...rest] = envelope.split(".");
  if (version !== ENVELOPE_VERSION || !ivValue || !ciphertextValue || !tagValue || rest.length > 0) {
    throw new Error("invalid personal cloud secret envelope");
  }
  const key = requireSecret(secret, "personal cloud token encryption key");
  const iv = Buffer.from(ivValue, "base64url");
  const ciphertext = Buffer.from(ciphertextValue, "base64url");
  const tag = Buffer.from(tagValue, "base64url");
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length > 64 * 1024) {
    throw new Error("invalid personal cloud secret envelope");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function personalCloudTokenContext(
  userId: string,
  provider: PersonalCloudProviderId,
  kind: "access" | "refresh" | "oauth-cookie",
): string {
  return `toonspectrum.personal-cloud.v1:${kind}:${provider}:${userId}`;
}

export function issuePersonalCloudOAuthState(
  payload: PersonalCloudOAuthStatePayload,
  secret: string,
): string {
  const key = requireSecret(secret, "personal cloud OAuth state secret");
  const encoded = encodedJson(payload);
  const signature = createHmac("sha256", key).update(encoded, "ascii").digest("base64url");
  return `${STATE_VERSION}.${encoded}.${signature}`;
}

export function verifyPersonalCloudOAuthState(
  value: string,
  secret: string,
  now = Date.now(),
): PersonalCloudOAuthStatePayload | null {
  const [version, encoded, signature, ...rest] = value.split(".");
  if (version !== STATE_VERSION || !encoded || !signature || rest.length > 0 || value.length > 4_096) {
    return null;
  }
  let key: Buffer;
  try {
    key = requireSecret(secret, "personal cloud OAuth state secret");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", key).update(encoded, "ascii").digest("base64url");
  const receivedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
    return null;
  }
  try {
    const payload = decodedJson<PersonalCloudOAuthStatePayload>(encoded);
    if (
      payload.version !== 1
      || typeof payload.userId !== "string"
      || payload.userId.length < 1
      || payload.userId.length > 200
      || typeof payload.nonce !== "string"
      || payload.nonce.length < 16
      || payload.nonce.length > 256
      || typeof payload.returnTo !== "string"
      || !payload.returnTo.startsWith("/studio")
      || payload.returnTo.startsWith("//")
      || payload.returnTo.length > 1_000
      || !Number.isSafeInteger(payload.issuedAt)
      || payload.issuedAt > now + 30_000
      || now - payload.issuedAt > STATE_MAX_AGE_MS
      || !["google-drive", "dropbox", "onedrive"].includes(payload.provider)
    ) {
      return null;
    }
    return Object.freeze(payload);
  } catch {
    return null;
  }
}
