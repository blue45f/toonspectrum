import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { canonicalJson } from "./production-integration-artifacts";

export interface GoogleCredentialEnvelope {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: string;
  readonly tokenType: string;
  readonly scope: string;
}

export function encryptIntegrationCredential(
  credential: GoogleCredentialEnvelope,
  key: Buffer,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(canonicalJson(credential), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}export function decryptIntegrationCredential(
  ciphertext: string,
  key: Buffer,
): GoogleCredentialEnvelope {
  const [version, ivRaw, tagRaw, bodyRaw, ...extra] = ciphertext.split(".");
  if (
    version !== "v1"
    || !ivRaw
    || !tagRaw
    || !bodyRaw
    || extra.length > 0
  ) {
    throw new Error("invalid production integration credential envelope");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(bodyRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext) as Partial<GoogleCredentialEnvelope>;
  if (
    typeof parsed.accessToken !== "string"
    || typeof parsed.expiresAt !== "string"
    || typeof parsed.tokenType !== "string"
    || typeof parsed.scope !== "string"
    || (parsed.refreshToken !== null
      && typeof parsed.refreshToken !== "string")
  ) {
    throw new Error("invalid production integration credential payload");
  }
  return parsed as GoogleCredentialEnvelope;
}
