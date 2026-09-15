import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, like } from "drizzle-orm";

import { db, verificationTokens } from "../db";

import type { AuthEmailPurpose } from "./auth-email";

export type AuthOneTimeTokenPurpose = AuthEmailPurpose;
export type AuthDatabaseTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

const RAW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const TOKEN_TTL_MS: Readonly<Record<AuthOneTimeTokenPurpose, number>> = {
  "verify-email": 30 * 60_000,
  "reset-password": 20 * 60_000,
};
export function authTokenIdentifier(
  purpose: AuthOneTimeTokenPurpose,
  userId: string,
): string {
  return `${purpose}:${userId}`;
}

export function hashAuthToken(rawToken: string): string {
  const digest = createHash("sha256")
    .update(rawToken, "utf8")
    .digest("hex");
  return `sha256:${digest}`;
}

export function isValidRawAuthToken(value: unknown): value is string {
  return typeof value === "string" && RAW_TOKEN_PATTERN.test(value);
}

function parseUserId(
  purpose: AuthOneTimeTokenPurpose,
  identifier: string,
): string | null {
  const prefix = `${purpose}:`;
  return identifier.startsWith(prefix)
    ? identifier.slice(prefix.length) || null
    : null;
}
export async function issueAuthOneTimeToken(
  purpose: AuthOneTimeTokenPurpose,
  userId: string,
): Promise<string> {
  const rawToken = randomBytes(32).toString("base64url");
  const identifier = authTokenIdentifier(purpose, userId);
  const expires = new Date(Date.now() + TOKEN_TTL_MS[purpose]);

  await db.transaction(async (transaction) => {
    await transaction
      .delete(verificationTokens)
      .where(eq(verificationTokens.identifier, identifier));
    await transaction.insert(verificationTokens).values({
      identifier,
      token: hashAuthToken(rawToken),
      expires,
    });
  });
  return rawToken;
}

export async function revokeAuthOneTimeTokens(
  purpose: AuthOneTimeTokenPurpose,
  userId: string,
): Promise<void> {
  await db
    .delete(verificationTokens)
    .where(eq(
      verificationTokens.identifier,
      authTokenIdentifier(purpose, userId),
    ));
}
export async function consumeAuthOneTimeToken<T>(
  purpose: AuthOneTimeTokenPurpose,
  rawToken: unknown,
  apply: (
    transaction: AuthDatabaseTransaction,
    userId: string,
  ) => Promise<T>,
): Promise<T | null> {
  if (!isValidRawAuthToken(rawToken)) return null;
  const digest = hashAuthToken(rawToken);
  return db.transaction(async (transaction) => {
    const [consumed] = await transaction
      .delete(verificationTokens)
      .where(and(
        eq(verificationTokens.token, digest),
        like(verificationTokens.identifier, `${purpose}:%`),
        gt(verificationTokens.expires, new Date()),
      ))
      .returning({ identifier: verificationTokens.identifier });
    if (!consumed) return null;
    const userId = parseUserId(purpose, consumed.identifier);
    if (!userId) return null;
    return apply(transaction, userId);
  });
}
