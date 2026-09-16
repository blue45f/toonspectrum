import {
  createDecipheriv,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { TextDecoder } from "node:util";

import { and, eq } from "drizzle-orm";

import { accounts, db, users } from "../../db";
import { ensureOAuthTables } from "../../server/oauth";
import {
  revokeUserSessions,
  softDeleteUserAccount,
} from "../../server/user-lifecycle";

const NAVER_UNLINK_CLOCK_SKEW_SECONDS = 10 * 60;
const NAVER_PROTOCOL_BLOCK_BYTES = 16;

export interface NaverUnlinkEvent {
  readonly clientId: string;
  readonly userId: string;
  readonly timestamp: number;
}

export class NaverWebhookConfigurationError extends Error {}
export class NaverWebhookAuthenticationError extends Error {}
export class NaverWebhookPayloadError extends Error {}

function configured(
  env: NodeJS.ProcessEnv,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const raw = env[key];
    const value = raw?.trim() ?? "";
    if (value && value === raw) return value;
  }
  throw new NaverWebhookConfigurationError(`${keys.join(" or ")} is not configured`);
}

function scalarString(
  value: unknown,
  label: string,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw new NaverWebhookPayloadError(`${label} must be a scalar string`);
  }
  const normalized = value.trim();
  if (!normalized || normalized !== value || normalized.length > maximumLength) {
    throw new NaverWebhookPayloadError(`${label} is invalid`);
  }
  return normalized;
}

function constantTimeEqual(value: string, expected: string): boolean {
  const valueBytes = Buffer.from(value, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return valueBytes.length === expectedBytes.length
    && timingSafeEqual(valueBytes, expectedBytes);
}

// Naver's published disconnect protocol explicitly derives both AES and HMAC
// keys from MD5(client secret). This is protocol compatibility, not password hashing.
function naverProtocolKey(clientSecret: string): Buffer {
  // codeql[js/weak-cryptographic-algorithm,js/insufficient-password-hash]
  return createHash("md5").update(clientSecret, "utf8").digest().subarray(
    0,
    NAVER_PROTOCOL_BLOCK_BYTES,
  );
}

function expectedSignature(
  clientId: string,
  encryptUniqueId: string,
  timestamp: string,
  key: Buffer,
): string {
  const base = `clientId=${clientId}&encryptUniqueId=${encryptUniqueId}&timestamp=${timestamp}`;
  return createHmac("sha256", key).update(base, "utf8").digest("base64url");
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function decryptUniqueId(encrypted: string, key: Buffer): string {
  let payload: Buffer;
  try {
    payload = Buffer.from(encrypted, "base64url");
  } catch {
    throw new NaverWebhookPayloadError("encryptUniqueId is not base64url");
  }
  if (
    payload.length < NAVER_PROTOCOL_BLOCK_BYTES * 2
    || (payload.length - NAVER_PROTOCOL_BLOCK_BYTES) % NAVER_PROTOCOL_BLOCK_BYTES !== 0
  ) {
    throw new NaverWebhookPayloadError("encryptUniqueId has an invalid block length");
  }

  try {
    const iv = payload.subarray(0, NAVER_PROTOCOL_BLOCK_BYTES);
    const ciphertext = payload.subarray(NAVER_PROTOCOL_BLOCK_BYTES);
    const decipher = createDecipheriv("aes-128-cbc", key, iv);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    const userId = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
    if (
      !userId
      || userId !== userId.trim()
      || userId.length > 512
      || hasControlCharacters(userId)
    ) {
      throw new NaverWebhookPayloadError("decrypted Naver user id is invalid");
    }
    return userId;
  } catch (error) {
    if (error instanceof NaverWebhookPayloadError) throw error;
    throw new NaverWebhookAuthenticationError("Naver user id decryption failed");
  }
}

export function parseNaverUnlinkWebhook(
  payload: unknown,
  env: NodeJS.ProcessEnv = process.env,
  nowSeconds = Math.floor(Date.now() / 1_000),
): NaverUnlinkEvent {
  const expectedClientId = configured(env, [
    "NAVER_OAUTH_CLIENT_ID",
    "NAVER_CLIENT_ID",
  ]);
  const clientSecret = configured(env, [
    "NAVER_OAUTH_CLIENT_SECRET",
    "NAVER_CLIENT_SECRET",
  ]);
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new NaverWebhookPayloadError("invalid Naver unlink payload");
  }

  const body = payload as Record<string, unknown>;
  const clientId = scalarString(body.clientId, "clientId", 512);
  const encryptUniqueId = scalarString(
    body.encryptUniqueId,
    "encryptUniqueId",
    4_096,
  );
  const timestampText = scalarString(body.timestamp, "timestamp", 20);
  const signature = scalarString(body.signature, "signature", 512);
  if (!constantTimeEqual(clientId, expectedClientId)) {
    throw new NaverWebhookAuthenticationError("unexpected Naver client id");
  }
  if (!/^\d{1,20}$/u.test(timestampText)) {
    throw new NaverWebhookPayloadError("invalid Naver unlink timestamp");
  }
  const timestamp = Number(timestampText);
  if (
    !Number.isSafeInteger(timestamp)
    || Math.abs(nowSeconds - timestamp) > NAVER_UNLINK_CLOCK_SKEW_SECONDS
  ) {
    throw new NaverWebhookAuthenticationError("expired Naver unlink request");
  }

  const key = naverProtocolKey(clientSecret);
  const calculated = expectedSignature(
    clientId,
    encryptUniqueId,
    timestampText,
    key,
  );
  if (!constantTimeEqual(signature, calculated)) {
    throw new NaverWebhookAuthenticationError("invalid Naver unlink signature");
  }

  return {
    clientId,
    userId: decryptUniqueId(encryptUniqueId, key),
    timestamp,
  };
}

export interface NaverUnlinkAccountState {
  readonly userId: string;
  readonly hasAnotherLoginMethod: boolean;
}

export interface NaverUnlinkStore {
  findAccountState(
    providerAccountId: string,
  ): Promise<NaverUnlinkAccountState | null>;
  revokeSessions(userId: string): Promise<void>;
  removeNaverLink(
    userId: string,
    providerAccountId: string,
  ): Promise<void>;
  softDelete(userId: string, reason: string): Promise<void>;
}

const databaseNaverUnlinkStore: NaverUnlinkStore = {
  async findAccountState(providerAccountId) {
    await ensureOAuthTables();
    const [linked] = await db
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(
        and(
          eq(accounts.provider, "naver"),
          eq(accounts.providerAccountId, providerAccountId),
        ),
      )
      .limit(1);
    if (!linked) return null;

    const [userRows, accountRows] = await Promise.all([
      db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, linked.userId))
        .limit(1),
      db
        .select({
          provider: accounts.provider,
          providerAccountId: accounts.providerAccountId,
        })
        .from(accounts)
        .where(eq(accounts.userId, linked.userId)),
    ]);
    const hasOtherProvider = accountRows.some(
      (account) =>
        account.provider !== "naver"
        || account.providerAccountId !== providerAccountId,
    );
    return {
      userId: linked.userId,
      hasAnotherLoginMethod:
        Boolean(userRows[0]?.passwordHash) || hasOtherProvider,
    };
  },
  async revokeSessions(userId) {
    const result = await revokeUserSessions(userId);
    if (!result.ok) throw new Error("failed to revoke linked sessions");
  },
  async removeNaverLink(userId, providerAccountId) {
    await db
      .delete(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.provider, "naver"),
          eq(accounts.providerAccountId, providerAccountId),
        ),
      );
  },
  async softDelete(userId, reason) {
    const result = await softDeleteUserAccount(userId, reason);
    if (!result) {
      throw new Error("failed to delete unlinked Naver-only account");
    }
  },
};

export async function processNaverUnlink(
  event: NaverUnlinkEvent,
  store: NaverUnlinkStore = databaseNaverUnlinkStore,
): Promise<"not-linked" | "link-removed" | "account-deleted"> {
  const state = await store.findAccountState(event.userId);
  if (!state) return "not-linked";
  if (!state.hasAnotherLoginMethod) {
    await store.softDelete(state.userId, "naver-unlink");
    return "account-deleted";
  }

  await store.revokeSessions(state.userId);
  await store.removeNaverLink(state.userId, event.userId);
  return "link-removed";
}
