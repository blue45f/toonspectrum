import { timingSafeEqual } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { accounts, db, users } from "../../db";
import { ensureOAuthTables } from "../../server/oauth";
import {
  revokeUserSessions,
  softDeleteUserAccount,
} from "../../server/user-lifecycle";

export const KAKAO_UNLINK_REFERRER_TYPES = [
  "ACCOUNT_DELETE",
  "FORCED_ACCOUNT_DELETE",
  "UNLINK_FROM_APPS",
  "UNLINK_FROM_ADMIN",
  "INCOMPLETE_SIGN_UP",
] as const;

export type KakaoUnlinkReferrerType =
  (typeof KAKAO_UNLINK_REFERRER_TYPES)[number];

export interface KakaoUnlinkEvent {
  readonly appId: string;
  readonly userId: string;
  readonly referrerType: KakaoUnlinkReferrerType;
}

export class KakaoWebhookConfigurationError extends Error {}
export class KakaoWebhookAuthenticationError extends Error {}
export class KakaoWebhookPayloadError extends Error {}

function configured(env: NodeJS.ProcessEnv, key: string): string {
  const raw = env[key];
  const value = raw?.trim() ?? "";
  if (!value || value !== raw) {
    throw new KakaoWebhookConfigurationError(`${key} is not configured`);
  }
  return value;
}

function scalarString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

function constantTimeEqual(value: string, expected: string): boolean {
  const valueBytes = Buffer.from(value, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return valueBytes.length === expectedBytes.length
    && timingSafeEqual(valueBytes, expectedBytes);
}

export function parseKakaoUnlinkWebhook(
  authorization: string | undefined,
  payload: unknown,
  env: NodeJS.ProcessEnv = process.env,
): KakaoUnlinkEvent {
  const adminKey = configured(env, "KAKAO_ADMIN_KEY");
  const expectedAppId = configured(env, "KAKAO_APP_ID");
  const expectedAuthorization = `KakaoAK ${adminKey}`;
  if (
    typeof authorization !== "string"
    || !constantTimeEqual(authorization.trim(), expectedAuthorization)
  ) {
    throw new KakaoWebhookAuthenticationError(
      "invalid Kakao webhook authority",
    );
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new KakaoWebhookPayloadError("invalid Kakao unlink payload");
  }
  const body = payload as Record<string, unknown>;
  const appId = scalarString(body.app_id);
  const userId = scalarString(body.user_id);
  const referrerType = scalarString(body.referrer_type);
  if (!appId || !/^\d{1,20}$/u.test(appId) || appId !== expectedAppId) {
    throw new KakaoWebhookAuthenticationError("unexpected Kakao app id");
  }
  if (!userId || !/^\d{1,32}$/u.test(userId)) {
    throw new KakaoWebhookPayloadError("invalid Kakao user id");
  }
  if (
    !referrerType
    || !KAKAO_UNLINK_REFERRER_TYPES.includes(
      referrerType as KakaoUnlinkReferrerType,
    )
  ) {
    throw new KakaoWebhookPayloadError("invalid Kakao unlink referrer");
  }
  return {
    appId,
    userId,
    referrerType: referrerType as KakaoUnlinkReferrerType,
  };
}

export interface KakaoUnlinkAccountState {
  readonly userId: string;
  readonly hasAnotherLoginMethod: boolean;
}

export interface KakaoUnlinkStore {
  findAccountState(
    providerAccountId: string,
  ): Promise<KakaoUnlinkAccountState | null>;
  revokeSessions(userId: string): Promise<void>;
  removeKakaoLink(
    userId: string,
    providerAccountId: string,
  ): Promise<void>;
  softDelete(userId: string, reason: string): Promise<void>;
}

const databaseKakaoUnlinkStore: KakaoUnlinkStore = {
  async findAccountState(providerAccountId) {
    await ensureOAuthTables();
    const [linked] = await db
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(
        and(
          eq(accounts.provider, "kakao"),
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
        account.provider !== "kakao"
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
  async removeKakaoLink(userId, providerAccountId) {
    await db
      .delete(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.provider, "kakao"),
          eq(accounts.providerAccountId, providerAccountId),
        ),
      );
  },
  async softDelete(userId, reason) {
    const result = await softDeleteUserAccount(userId, reason);
    if (!result) {
      throw new Error("failed to delete unlinked Kakao-only account");
    }
  },
};

export async function processKakaoUnlink(
  event: KakaoUnlinkEvent,
  store: KakaoUnlinkStore = databaseKakaoUnlinkStore,
): Promise<"not-linked" | "link-removed" | "account-deleted"> {
  const state = await store.findAccountState(event.userId);
  if (!state) return "not-linked";
  if (!state.hasAnotherLoginMethod) {
    await store.softDelete(
      state.userId,
      `kakao-unlink:${event.referrerType}`,
    );
    return "account-deleted";
  }

  // 세션을 먼저 폐기해 연동 삭제가 일시 실패해도 다음 웹훅 재시도가 안전하다.
  await store.revokeSessions(state.userId);
  await store.removeKakaoLink(state.userId, event.userId);
  return "link-removed";
}
