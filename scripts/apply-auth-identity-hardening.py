from __future__ import annotations

from pathlib import Path
import re
import textwrap

ROOT = Path(__file__).resolve().parents[1]


def path(rel: str) -> Path:
    return ROOT / rel


def read(rel: str) -> str:
    return path(rel).read_text(encoding="utf-8")


def write(rel: str, content: str) -> None:
    target = path(rel)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace(rel: str, old: str, new: str, count: int = 1) -> None:
    content = read(rel)
    actual = content.count(old)
    if actual != count:
        raise RuntimeError(f"{rel}: expected {count} exact matches, found {actual}")
    write(rel, content.replace(old, new, count))


def replace_re(rel: str, pattern: str, replacement: str, count: int = 1) -> None:
    content = read(rel)
    updated, actual = re.subn(pattern, replacement, content, count=count, flags=re.S | re.M)
    if actual != count:
        raise RuntimeError(f"{rel}: expected {count} regex matches, found {actual}: {pattern}")
    write(rel, updated)


# ---------------------------------------------------------------------------
# Administrator authorization: email is profile data, never an authority.
# Keep the legacy exports temporarily so call sites fail closed without a broad
# unrelated refactor. ADMIN_EMAILS is intentionally ignored at runtime.
# ---------------------------------------------------------------------------
write(
    "apps/api/src/server/admin-emails.ts",
    textwrap.dedent(
        '''\
        /**
         * @deprecated Administrator privileges are durable DB role state.
         * Email addresses are mutable profile data and never grant authority.
         */
        export const DEFAULT_ADMIN_EMAILS = [] as const;

        export function normalizeAdminEmail(email: string | null | undefined): string {
          return String(email ?? "").trim().toLowerCase();
        }

        export function getAdminEmailWhitelist(): Set<string> {
          return new Set<string>();
        }

        export function isWhitelistedAdminEmail(
          _email: string | null | undefined,
        ): boolean {
          return false;
        }

        export function resolveEffectiveAdminRole(
          role: string | null | undefined,
          _email: string | null | undefined,
        ): "admin" | "operator" | "creator" | "user" {
          const normalized = String(role ?? "").trim().toLowerCase();
          if (normalized === "admin" || normalized === "operator") return normalized;
          if (normalized === "creator") return "creator";
          return "user";
        }
        '''
    ),
)

write(
    "apps/web/src/shared/lib/__tests__/admin-emails.test.ts",
    textwrap.dedent(
        '''\
        import { afterEach, describe, expect, it } from "vitest";

        import {
          DEFAULT_ADMIN_EMAILS,
          getAdminEmailWhitelist,
          isWhitelistedAdminEmail,
          normalizeAdminEmail,
          resolveEffectiveAdminRole,
        } from "../../../../../../apps/api/src/server/admin-emails";

        describe("administrator role authority", () => {
          const original = process.env.ADMIN_EMAILS;

          afterEach(() => {
            if (original === undefined) delete process.env.ADMIN_EMAILS;
            else process.env.ADMIN_EMAILS = original;
          });

          it("never grants administrator privileges from built-in or configured emails", () => {
            process.env.ADMIN_EMAILS = "blue45f@gmail.com,ops@example.com";
            expect(DEFAULT_ADMIN_EMAILS).toEqual([]);
            expect(getAdminEmailWhitelist().size).toBe(0);
            expect(isWhitelistedAdminEmail("blue45f@gmail.com")).toBe(false);
            expect(isWhitelistedAdminEmail("ops@example.com")).toBe(false);
            expect(resolveEffectiveAdminRole("user", "blue45f@gmail.com")).toBe("user");
            expect(resolveEffectiveAdminRole("creator", "ops@example.com")).toBe("creator");
          });

          it("normalizes profile email without treating it as authorization", () => {
            expect(normalizeAdminEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
            expect(normalizeAdminEmail(null)).toBe("");
          });

          it("accepts only explicit persisted admin and operator roles", () => {
            expect(resolveEffectiveAdminRole("admin", "reader@example.com")).toBe("admin");
            expect(resolveEffectiveAdminRole("operator", "reader@example.com")).toBe("operator");
            expect(resolveEffectiveAdminRole("owner", "reader@example.com")).toBe("user");
          });
        });
        '''
    ),
)

replace(
    "apps/api/src/modules/auth/auth.controller.session.test.ts",
    '''  it("exposes admin role for built-in ADMIN_EMAILS whitelist accounts even when DB role is user", () => {
    const result = authResponseUser({
      id: "owner",
      name: "Owner",
      email: "blue45f@gmail.com",
      image: null,
      role: "user",
    });

    expect(result).toEqual({
      id: "owner",
      name: "Owner",
      email: "blue45f@gmail.com",
      image: null,
      role: "admin",
    });
  });''',
    '''  it("never grants administrator privileges from an email address", () => {
    const result = authResponseUser({
      id: "owner",
      name: "Owner",
      email: "blue45f@gmail.com",
      image: null,
      role: "user",
    });

    expect(result).toEqual({
      id: "owner",
      name: "Owner",
      email: "blue45f@gmail.com",
      image: null,
      role: "user",
    });
  });''',
)

# ---------------------------------------------------------------------------
# Password hashing: retain legacy verification, issue versioned hashes, and use
# asynchronous scrypt on request paths so attacker input cannot block the loop.
# ---------------------------------------------------------------------------
write(
    "apps/web/src/shared/lib/auth-crypto.ts",
    textwrap.dedent(
        '''\
        import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";

        const HASH_VERSION = "scrypt-v1";
        const KEY_LENGTH = 64;

        function deriveAsync(password: string, salt: string): Promise<Buffer> {
          return new Promise((resolve, reject) => {
            scrypt(password, salt, KEY_LENGTH, (error, derivedKey) => {
              if (error) reject(error);
              else resolve(derivedKey);
            });
          });
        }

        function encode(salt: string, hash: Buffer): string {
          return `${HASH_VERSION}$${salt}$${hash.toString("hex")}`;
        }

        function parse(stored: string): { salt: string; hash: Buffer } | null {
          const versioned = stored.split("$");
          if (versioned.length === 3 && versioned[0] === HASH_VERSION) {
            const [, salt, hex] = versioned;
            if (!salt || !/^[0-9a-f]{128}$/u.test(hex ?? "")) return null;
            return { salt, hash: Buffer.from(hex, "hex") };
          }

          // Legacy salt:hash rows remain valid and are upgraded on the next
          // password-changing operation rather than locking existing users out.
          const [salt, hex, extra] = stored.split(":");
          if (extra !== undefined || !salt || !/^[0-9a-f]{128}$/u.test(hex ?? "")) {
            return null;
          }
          return { salt, hash: Buffer.from(hex, "hex") };
        }

        export function hashPassword(password: string): string {
          const salt = randomBytes(16).toString("hex");
          return encode(salt, scryptSync(password, salt, KEY_LENGTH));
        }

        export async function hashPasswordAsync(password: string): Promise<string> {
          const salt = randomBytes(16).toString("hex");
          return encode(salt, await deriveAsync(password, salt));
        }

        export function verifyPassword(
          password: string,
          stored: string | null | undefined,
        ): boolean {
          if (!stored) return false;
          const parsed = parse(stored);
          if (!parsed) return false;
          const candidate = scryptSync(password, parsed.salt, KEY_LENGTH);
          return candidate.length === parsed.hash.length
            && timingSafeEqual(candidate, parsed.hash);
        }

        export async function verifyPasswordAsync(
          password: string,
          stored: string | null | undefined,
        ): Promise<boolean> {
          if (!stored) return false;
          const parsed = parse(stored);
          if (!parsed) return false;
          const candidate = await deriveAsync(password, parsed.salt);
          return candidate.length === parsed.hash.length
            && timingSafeEqual(candidate, parsed.hash);
        }

        // A fixed-format non-user credential equalizes missing-account work.
        export const DUMMY_PASSWORD_HASH = hashPassword(
          "toonstudio-authentication-dummy-password-not-a-user",
        );
        '''
    ),
)

write(
    "apps/web/src/shared/lib/__tests__/auth-crypto.test.ts",
    textwrap.dedent(
        '''\
        import { describe, expect, it } from "vitest";

        import {
          DUMMY_PASSWORD_HASH,
          hashPassword,
          hashPasswordAsync,
          verifyPassword,
          verifyPasswordAsync,
        } from "../auth-crypto";

        describe("password hashing", () => {
          it("issues versioned salted hashes without plaintext", () => {
            const hash = hashPassword("correct horse battery staple");
            expect(hash).toMatch(/^scrypt-v1\$[0-9a-f]{32}\$[0-9a-f]{128}$/u);
            expect(hash).not.toContain("correct horse");
          });

          it("verifies current and legacy rows", async () => {
            const current = await hashPasswordAsync("correct horse battery staple");
            expect(await verifyPasswordAsync("correct horse battery staple", current)).toBe(true);
            expect(await verifyPasswordAsync("wrong", current)).toBe(false);

            const legacy = hashPassword("legacy password");
            const [, salt, digest] = legacy.split("$");
            expect(verifyPassword("legacy password", `${salt}:${digest}`)).toBe(true);
          });

          it("uses distinct salts and a valid dummy credential", async () => {
            const left = await hashPasswordAsync("same password value");
            const right = await hashPasswordAsync("same password value");
            expect(left).not.toBe(right);
            expect(await verifyPasswordAsync("not the dummy value", DUMMY_PASSWORD_HASH)).toBe(false);
          });
        });
        '''
    ),
)

# ---------------------------------------------------------------------------
# OAuth identity ownership and explicit account-link lifecycle.
# ---------------------------------------------------------------------------
replace(
    "apps/api/src/server/oauth.ts",
    '''export class OAuthAccountBlockedError extends Error {
  constructor(readonly publicMessage: string) {
    super(publicMessage);
    this.name = "OAuthAccountBlockedError";
  }
}
''',
    '''export class OAuthAccountBlockedError extends Error {
  constructor(readonly publicMessage: string) {
    super(publicMessage);
    this.name = "OAuthAccountBlockedError";
  }
}

export class OAuthAccountLinkRequiredError extends Error {
  constructor(readonly provider: OAuthProviderId) {
    super("an existing account must explicitly link this provider");
    this.name = "OAuthAccountLinkRequiredError";
  }
}

export class OAuthAccountAlreadyLinkedError extends Error {
  constructor(readonly provider: OAuthProviderId) {
    super("this provider identity belongs to another account");
    this.name = "OAuthAccountAlreadyLinkedError";
  }
}

export class OAuthLastLoginMethodError extends Error {
  constructor() {
    super("the last login method cannot be removed");
    this.name = "OAuthLastLoginMethodError";
  }
}
''',
)

replace_re(
    "apps/api/src/server/oauth.ts",
    r'''export function issueState\(id: OAuthProviderId\): string \{.*?\n\}\n\nexport function verifyState\(.*?\n\}\n\n(?=export function verifyBrowserBoundState)''',
    '''export type OAuthStatePurpose = "login" | "link";

type VerifiedOAuthState = Readonly<{
  purpose: OAuthStatePurpose;
  issuedAt: number;
}>;

export function issueState(
  id: OAuthProviderId,
  purpose: OAuthStatePurpose = "login",
): string {
  const payload = `${id}.${purpose}.${randomBytes(16).toString("hex")}.${Date.now()}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

function verifyStatePayload(
  id: OAuthProviderId,
  state: string | undefined,
  maxAgeMs = 10 * 60_000,
): VerifiedOAuthState | null {
  if (!state || typeof state !== "string" || state.length > OAUTH_STATE_MAX_LENGTH) {
    return null;
  }
  const dot = state.lastIndexOf(".");
  if (dot < 0) return null;
  const payloadB64 = state.slice(0, dot);
  const signature = state.slice(dot + 1);
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = sign(payload);
  const actualBytes = Buffer.from(signature, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (
    actualBytes.length !== expectedBytes.length
    || !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    return null;
  }

  const parts = payload.split(".");
  const legacy = parts.length === 3;
  const [provider, purposeRaw, nonce, timestampRaw] = legacy
    ? [parts[0], "login", parts[1], parts[2]]
    : parts;
  if (
    provider !== id
    || (purposeRaw !== "login" && purposeRaw !== "link")
    || !/^[a-f0-9]{32}$/u.test(nonce ?? "")
  ) {
    return null;
  }
  const issuedAt = Number(timestampRaw);
  const ageMs = Date.now() - issuedAt;
  if (!Number.isFinite(issuedAt) || ageMs < -60_000 || ageMs >= maxAgeMs) {
    return null;
  }
  return { purpose: purposeRaw, issuedAt };
}

export function verifyState(
  id: OAuthProviderId,
  state: string | undefined,
  maxAgeMs = 10 * 60_000,
): boolean {
  return verifyStatePayload(id, state, maxAgeMs) !== null;
}

export function readOAuthStatePurpose(
  id: OAuthProviderId,
  state: string | undefined,
): OAuthStatePurpose | null {
  return verifyStatePayload(id, state)?.purpose ?? null;
}

''',
)

replace_re(
    "apps/api/src/server/oauth.ts",
    r'''export function canAutoLinkOAuthEmail\(.*?\n\}\n\n(?=function normalizedEmail)''',
    '''export function canAutoLinkOAuthEmail(
  _provider: OAuthProviderId,
  _emailVerified: boolean | undefined,
): boolean {
  // Email equality is never proof that two login identities have the same
  // owner. Linking is allowed only from an authenticated explicit-link flow.
  return false;
}

''',
)

replace_re(
    "apps/api/src/server/oauth.ts",
    r'''// 프로필 → user/account upsert\..*?\nasync function upsertOAuthUser\(.*?\n\}\n\n(?=function normalizeRole)''',
    '''// Provider subject is the identity key. A verified email may populate a
// brand-new account, but an existing matching email requires explicit linking.
async function clearStoredOAuthTokens(
  id: OAuthProviderId,
  providerAccountId: string,
): Promise<void> {
  await db
    .update(accounts)
    .set({
      refresh_token: null,
      access_token: null,
      expires_at: null,
      token_type: null,
      scope: null,
      id_token: null,
      session_state: null,
    })
    .where(
      and(
        eq(accounts.provider, id),
        eq(accounts.providerAccountId, providerAccountId),
      ),
    );
}

async function resolveOAuthUser(
  userId: string,
  fallback: Pick<NormalizedProfile, "email" | "name" | "image">,
): Promise<OAuthUser> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const block = getUserAuthBlock(user);
  if (block) throw new OAuthAccountBlockedError(block);
  if (!user) throw new Error("oauth user does not exist");

  const resolvedEmail = user.email ?? fallback.email;
  const dbRole = normalizeRole(user.role);
  const role = resolveEffectiveAdminRole(dbRole, resolvedEmail);
  return {
    id: user.id,
    name: user.name ?? fallback.name,
    email: resolvedEmail,
    image: user.image ?? fallback.image,
    role,
    sessionVersion: normalizeSessionVersion(user.sessionVersion),
  };
}

async function upsertOAuthUser(
  id: OAuthProviderId,
  profile: NormalizedProfile,
): Promise<OAuthUser> {
  await ensureOAuthTables();
  const verifiedEmail = profile.emailVerified === true ? profile.email : null;
  const accountEmail = verifiedEmail
    ?? `${id}_${profile.providerAccountId}@${id}.local`;
  const name = profile.name ?? providerConfig(id).label;

  const userId = await db.transaction(async (transaction) => {
    const [linked] = await transaction
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(
        and(
          eq(accounts.provider, id),
          eq(accounts.providerAccountId, profile.providerAccountId),
        ),
      )
      .limit(1);
    if (linked) return linked.userId;

    if (verifiedEmail) {
      const [emailOwner] = await transaction
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, verifiedEmail))
        .limit(1);
      if (emailOwner) throw new OAuthAccountLinkRequiredError(id);
    }

    const candidateUserId = randomUUID();
    const [insertedUser] = await transaction
      .insert(users)
      .values({
        id: candidateUserId,
        email: accountEmail,
        emailVerified: verifiedEmail ? new Date() : null,
        name,
        image: profile.image ?? null,
        avatar: avatarFor(accountEmail),
        role: "user",
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });

    if (!insertedUser) {
      const [racedAccount] = await transaction
        .select({ userId: accounts.userId })
        .from(accounts)
        .where(
          and(
            eq(accounts.provider, id),
            eq(accounts.providerAccountId, profile.providerAccountId),
          ),
        )
        .limit(1);
      if (racedAccount) return racedAccount.userId;
      if (verifiedEmail) throw new OAuthAccountLinkRequiredError(id);
      throw new Error("oauth user conflict could not be resolved");
    }

    await transaction
      .insert(accounts)
      .values({
        userId: insertedUser.id,
        type: "oauth",
        provider: id,
        providerAccountId: profile.providerAccountId,
      })
      .onConflictDoNothing({
        target: [accounts.provider, accounts.providerAccountId],
      });

    const [authoritativeAccount] = await transaction
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(
        and(
          eq(accounts.provider, id),
          eq(accounts.providerAccountId, profile.providerAccountId),
        ),
      )
      .limit(1);
    if (!authoritativeAccount) {
      throw new Error("oauth account conflict could not be resolved");
    }
    return authoritativeAccount.userId;
  });

  await clearStoredOAuthTokens(id, profile.providerAccountId);
  return resolveOAuthUser(userId, {
    email: verifiedEmail ?? accountEmail,
    name,
    image: profile.image ?? null,
  });
}

async function linkOAuthAccount(
  userId: string,
  id: OAuthProviderId,
  profile: NormalizedProfile,
): Promise<OAuthUser> {
  await ensureOAuthTables();
  await db.transaction(async (transaction) => {
    const [user] = await transaction
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const block = getUserAuthBlock(user);
    if (block) throw new OAuthAccountBlockedError(block);

    const [existing] = await transaction
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(
        and(
          eq(accounts.provider, id),
          eq(accounts.providerAccountId, profile.providerAccountId),
        ),
      )
      .limit(1);
    if (existing && existing.userId !== userId) {
      throw new OAuthAccountAlreadyLinkedError(id);
    }
    if (!existing) {
      await transaction.insert(accounts).values({
        userId,
        type: "oauth",
        provider: id,
        providerAccountId: profile.providerAccountId,
      });
    }
  });

  await clearStoredOAuthTokens(id, profile.providerAccountId);
  return resolveOAuthUser(userId, {
    email: profile.emailVerified === true ? profile.email : null,
    name: profile.name,
    image: profile.image,
  });
}

export async function listUserOAuthAccounts(userId: string): Promise<
  ReadonlyArray<{ provider: OAuthProviderId; canUnlink: boolean }>
> {
  await ensureOAuthTables();
  const [user, rows] = await Promise.all([
    db
      .select({ passwordHash: users.passwordHash, status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((result) => result[0] ?? null),
    db
      .select({ provider: accounts.provider })
      .from(accounts)
      .where(eq(accounts.userId, userId)),
  ]);
  const block = getUserAuthBlock(user);
  if (block) throw new OAuthAccountBlockedError(block);
  const providers = rows
    .map(({ provider }) => provider)
    .filter(isOAuthProvider);
  return providers.map((provider) => ({
    provider,
    canUnlink: Boolean(user?.passwordHash) || providers.length > 1,
  }));
}

export async function unlinkUserOAuthAccount(
  userId: string,
  id: OAuthProviderId,
): Promise<void> {
  await ensureOAuthTables();
  await db.transaction(async (transaction) => {
    const [user] = await transaction
      .select({ passwordHash: users.passwordHash, status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const block = getUserAuthBlock(user);
    if (block) throw new OAuthAccountBlockedError(block);

    const linked = await transaction
      .select({ provider: accounts.provider })
      .from(accounts)
      .where(eq(accounts.userId, userId));
    const targetExists = linked.some(({ provider }) => provider === id);
    if (!targetExists) return;
    if (!user?.passwordHash && linked.length <= 1) {
      throw new OAuthLastLoginMethodError();
    }
    await transaction
      .delete(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.provider, id)));
  });
}

''',
)

replace(
    "apps/api/src/server/oauth.ts",
    '''export async function handleOAuthCallback(
  id: OAuthProviderId,
  code: string,
  state: string,
  pkceVerifier?: string,
): Promise<OAuthUser> {
  const tokens = await exchangeCode(id, code, state, pkceVerifier);
  const accessToken = tokens.access_token as string | undefined;
  if (!accessToken) throw new Error("no access_token");
  const profile = await fetchProfile(id, accessToken);
  // 로그인 전용 OAuth 토큰은 저장하지 않는다. 제공자 신원을 확인한 뒤 자체 HttpOnly 세션을 발급한다.
  return upsertOAuthUser(id, profile);
}
''',
    '''export async function handleOAuthCallback(
  id: OAuthProviderId,
  code: string,
  state: string,
  pkceVerifier?: string,
): Promise<OAuthUser> {
  const tokens = await exchangeCode(id, code, state, pkceVerifier);
  const accessToken = tokens.access_token as string | undefined;
  if (!accessToken) throw new Error("no access_token");
  const profile = await fetchProfile(id, accessToken);
  // 로그인 전용 OAuth 토큰은 저장하지 않는다. 제공자 신원을 확인한 뒤 자체 HttpOnly 세션을 발급한다.
  return upsertOAuthUser(id, profile);
}

export async function handleOAuthLinkCallback(
  userId: string,
  id: OAuthProviderId,
  code: string,
  state: string,
  pkceVerifier?: string,
): Promise<OAuthUser> {
  const tokens = await exchangeCode(id, code, state, pkceVerifier);
  const accessToken = tokens.access_token as string | undefined;
  if (!accessToken) throw new Error("no access_token");
  const profile = await fetchProfile(id, accessToken);
  return linkOAuthAccount(userId, id, profile);
}
''',
)

replace(
    "apps/api/src/server/oauth.ts",
    '''export async function handleGoogleIdToken(idToken: string): Promise<OAuthUser> {
  const profile = await verifyGoogleIdToken(idToken);
  // ID 토큰은 로그인 순간의 검증 증명일 뿐 장기 자격 증명이 아니다. 검증 후 원문을 저장하지 않는다.
  return upsertOAuthUser("google", profile);
}
''',
    '''export async function handleGoogleIdToken(idToken: string): Promise<OAuthUser> {
  const profile = await verifyGoogleIdToken(idToken);
  // ID 토큰은 로그인 순간의 검증 증명일 뿐 장기 자격 증명이 아니다. 검증 후 원문을 저장하지 않는다.
  return upsertOAuthUser("google", profile);
}

export async function handleGoogleIdTokenLink(
  userId: string,
  idToken: string,
): Promise<OAuthUser> {
  const profile = await verifyGoogleIdToken(idToken);
  return linkOAuthAccount(userId, "google", profile);
}
''',
)

# OAuth policy/state tests.
replace(
    "apps/web/src/shared/lib/__tests__/oauth.test.ts",
    "  issueState,\n  verifyBrowserBoundState,",
    "  issueState,\n  readOAuthStatePurpose,\n  verifyBrowserBoundState,",
)
replace(
    "apps/web/src/shared/lib/__tests__/oauth.test.ts",
    '''  it("다른 provider로는 검증 실패(혼용 방지)", () => {
    const s = issueState("google");
    expect(verifyState("kakao", s)).toBe(false);
  });
''',
    '''  it("다른 provider로는 검증 실패(혼용 방지)", () => {
    const s = issueState("google");
    expect(verifyState("kakao", s)).toBe(false);
  });

  it("로그인과 명시적 계정 연결 목적을 서명 state에 보존한다", () => {
    expect(readOAuthStatePurpose("google", issueState("google"))).toBe("login");
    expect(readOAuthStatePurpose("github", issueState("github", "link"))).toBe("link");
  });
''',
)
replace(
    "apps/web/src/shared/lib/__tests__/oauth.test.ts",
    '''  it("네이버 프로필 이메일은 검증 표시가 있어도 자동 계정 병합에 사용하지 않는다", () => {
    expect(canAutoLinkOAuthEmail("naver", true)).toBe(false);
    expect(canAutoLinkOAuthEmail("naver", false)).toBe(false);
    expect(canAutoLinkOAuthEmail("google", true)).toBe(true);
    expect(canAutoLinkOAuthEmail("kakao", true)).toBe(true);
    expect(canAutoLinkOAuthEmail("github", true)).toBe(true);
  });''',
    '''  it("어떤 공급자도 이메일 일치만으로 기존 계정에 자동 병합하지 않는다", () => {
    expect(canAutoLinkOAuthEmail("naver", true)).toBe(false);
    expect(canAutoLinkOAuthEmail("naver", false)).toBe(false);
    expect(canAutoLinkOAuthEmail("google", true)).toBe(false);
    expect(canAutoLinkOAuthEmail("kakao", true)).toBe(false);
    expect(canAutoLinkOAuthEmail("github", true)).toBe(false);
  });''',
)

# ---------------------------------------------------------------------------
# Controller routes: atomic signup, asynchronous password verification,
# account-link listing/linking/unlinking, and friendly collision failures.
# ---------------------------------------------------------------------------
replace(
    "apps/api/src/modules/auth/auth.controller.ts",
    "  Controller,\n  ForbiddenException,",
    "  ConflictException,\n  Controller,\n  Delete,\n  ForbiddenException,",
)
replace(
    "apps/api/src/modules/auth/auth.controller.ts",
    'import { hashPassword, verifyPassword } from "../../../../web/src/shared/lib/auth-crypto";',
    '''import {
  DUMMY_PASSWORD_HASH,
  hashPasswordAsync,
  verifyPasswordAsync,
} from "../../../../web/src/shared/lib/auth-crypto";''',
)
replace(
    "apps/api/src/modules/auth/auth.controller.ts",
    "  handleGoogleIdToken,\n  handleOAuthCallback,",
    "  handleGoogleIdToken,\n  handleGoogleIdTokenLink,\n  handleOAuthCallback,\n  handleOAuthLinkCallback,",
)
replace(
    "apps/api/src/modules/auth/auth.controller.ts",
    "  listAuthProviders,\n  OAuthAccountBlockedError,\n  providerMode,",
    "  listAuthProviders,\n  listUserOAuthAccounts,\n  OAuthAccountAlreadyLinkedError,\n  OAuthAccountBlockedError,\n  OAuthAccountLinkRequiredError,\n  OAuthLastLoginMethodError,\n  providerMode,\n  readOAuthStatePurpose,\n  unlinkUserOAuthAccount,",
)

replace(
    "apps/api/src/modules/auth/auth.controller.ts",
    '''  @Get("providers")
  async getProviders() {
    const config = await getAppConfig();
    return listAuthProviders({
      kakao: config.authKakao,
      naver: config.authNaver,
    });
  }
''',
    '''  @Get("providers")
  async getProviders() {
    const config = await getAppConfig();
    return listAuthProviders({
      kakao: config.authKakao,
      naver: config.authNaver,
    });
  }

  @Get("account-links")
  async getAccountLinks(@Headers("x-user-id") userId: string | undefined) {
    if (!userId) throw new UnauthorizedException({ error: "로그인이 필요해요." });
    return { accounts: await listUserOAuthAccounts(userId) };
  }

  @Delete("account-links/:provider")
  async unlinkAccount(
    @Param("provider") provider: string,
    @Headers("x-user-id") userId: string | undefined,
  ) {
    if (!userId) throw new UnauthorizedException({ error: "로그인이 필요해요." });
    if (!isOAuthProvider(provider)) {
      throw new BadRequestException({ error: "지원하지 않는 제공자예요." });
    }
    try {
      await unlinkUserOAuthAccount(userId, provider);
      return { ok: true };
    } catch (error: unknown) {
      if (error instanceof OAuthLastLoginMethodError) {
        throw new ConflictException({
          error: "마지막 로그인 수단은 연결 해제할 수 없어요. 다른 로그인 수단을 먼저 연결해 주세요.",
        });
      }
      if (error instanceof OAuthAccountBlockedError) {
        throw new ForbiddenException({ error: error.publicMessage });
      }
      throw error;
    }
  }
''',
)

replace(
    "apps/api/src/modules/auth/auth.controller.ts",
    '''  // 제공자 콜백 — code 교환 → 사용자 upsert → HttpOnly 세션 쿠키 발급 후 프론트 복귀.''',
    '''  @Get("oauth/:provider/link/start")
  oauthLinkStart(
    @Param("provider") provider: string,
    @Headers("x-user-id") userId: string | undefined,
    @Res() res: Response,
  ) {
    if (!userId) throw new UnauthorizedException({ error: "로그인이 필요해요." });
    if (!isOAuthProvider(provider)) {
      throw new BadRequestException({ error: "지원하지 않는 제공자예요." });
    }
    if (providerMode(provider) !== "oauth" || !isAuthorizationCodeFlowConfigured(provider)) {
      throw new ServiceUnavailableException({
        error: "이 로그인 제공자의 계정 연결이 아직 설정되지 않았어요.",
      });
    }
    const state = issueState(provider, "link");
    const pkceVerifier = provider === "github" ? issuePkceVerifier() : undefined;
    const url = buildAuthorizeUrl(provider, state, {
      ...(pkceVerifier
        ? { pkceCodeChallenge: createPkceCodeChallenge(pkceVerifier) }
        : {}),
    });
    if (!url) {
      throw new ServiceUnavailableException({
        error: "이 로그인 제공자의 계정 연결이 아직 설정되지 않았어요.",
      });
    }
    applyOAuthStateCookie(res, provider, state);
    if (pkceVerifier) applyOAuthPkceVerifierCookie(res, provider, pkceVerifier);
    return res.redirect(url);
  }

  // 제공자 콜백 — code 교환 → 사용자 upsert → HttpOnly 세션 쿠키 발급 후 프론트 복귀.''',
)

replace(
    "apps/api/src/modules/auth/auth.controller.ts",
    '''    if (!state || !verifyBrowserBoundState(provider, state, browserState))
      return res.redirect(`${web}/auth/callback#error=bad_state`);
    if (provider === "github" && !isValidPkceVerifier(browserPkceVerifier)) {''',
    '''    if (!state || !verifyBrowserBoundState(provider, state, browserState))
      return res.redirect(`${web}/auth/callback#error=bad_state`);
    const purpose = readOAuthStatePurpose(provider, state);
    if (!purpose) return res.redirect(`${web}/auth/callback#error=bad_state`);
    if (provider === "github" && !isValidPkceVerifier(browserPkceVerifier)) {''',
)

replace(
    "apps/api/src/modules/auth/auth.controller.ts",
    '''    try {
      const user = await handleOAuthCallback(
        provider,
        code,
        state,
        browserPkceVerifier ?? undefined,
      );
      const token = signSession(
        user.id,
        normalizeSessionVersion(user.sessionVersion),
      );
      applyAuthSessionCookie(res, token);
      return res.redirect(`${web}/auth/callback#session=1`);
    } catch {
      this.logOAuthFailure(
        "authorization-code",
        provider,
        "authorization-code-processing-failed",
      );
      return res.redirect(`${web}/auth/callback#error=oauth_failed`);
    }''',
    '''    try {
      if (purpose === "link") {
        const currentUserId = requestUserId(request);
        if (!currentUserId) {
          return res.redirect(`${web}/auth/callback#error=link_login_required`);
        }
        await handleOAuthLinkCallback(
          currentUserId,
          provider,
          code,
          state,
          browserPkceVerifier ?? undefined,
        );
        return res.redirect(
          `${web}/auth/callback#session=1&linked=${encodeURIComponent(provider)}`,
        );
      }

      const user = await handleOAuthCallback(
        provider,
        code,
        state,
        browserPkceVerifier ?? undefined,
      );
      const token = signSession(
        user.id,
        normalizeSessionVersion(user.sessionVersion),
      );
      applyAuthSessionCookie(res, token);
      return res.redirect(`${web}/auth/callback#session=1`);
    } catch (caught: unknown) {
      if (caught instanceof OAuthAccountLinkRequiredError) {
        return res.redirect(`${web}/auth/callback#error=account_link_required`);
      }
      if (caught instanceof OAuthAccountAlreadyLinkedError) {
        return res.redirect(`${web}/auth/callback#error=account_already_linked`);
      }
      this.logOAuthFailure(
        "authorization-code",
        provider,
        "authorization-code-processing-failed",
      );
      return res.redirect(`${web}/auth/callback#error=oauth_failed`);
    }''',
)

replace(
    "apps/api/src/modules/auth/auth.controller.ts",
    '''      if (err instanceof OAuthAccountBlockedError) {
        throw new ForbiddenException({ error: err.publicMessage });
      }
      // DB·외부 라이브러리의 내부 오류 메시지나 자격 증명 세부정보는 응답에 노출하지 않는다.''',
    '''      if (err instanceof OAuthAccountBlockedError) {
        throw new ForbiddenException({ error: err.publicMessage });
      }
      if (err instanceof OAuthAccountLinkRequiredError) {
        throw new ConflictException({
          error: "같은 이메일의 기존 계정이 있어요. 기존 방식으로 로그인한 뒤 설정에서 Google 계정을 연결해 주세요.",
        });
      }
      // DB·외부 라이브러리의 내부 오류 메시지나 자격 증명 세부정보는 응답에 노출하지 않는다.''',
)

replace(
    "apps/api/src/modules/auth/auth.controller.ts",
    '''  /**
   * Keep production OAuth failures diagnosable without logging authorization''',
    '''  @Post("oauth/google/id-token/link")
  async linkGoogleIdToken(
    @Body(new ZodValidationPipe(GoogleIdTokenDto)) body: GoogleIdTokenDto,
    @Headers("x-user-id") userId: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    if (!userId) throw new UnauthorizedException({ error: "로그인이 필요해요." });
    if (!isAllowedAuthRequestOrigin(origin)) {
      throw new ForbiddenException({ error: "허용되지 않은 사이트에서 보낸 요청이에요." });
    }
    try {
      const user = await handleGoogleIdTokenLink(userId, body.idToken);
      return { ok: true, user: authResponseUser(user) };
    } catch (error: unknown) {
      if (error instanceof OAuthAccountAlreadyLinkedError) {
        throw new ConflictException({ error: "이 Google 계정은 다른 회원에게 이미 연결되어 있어요." });
      }
      if (error instanceof OAuthAccountBlockedError) {
        throw new ForbiddenException({ error: error.publicMessage });
      }
      throw error;
    }
  }

  /**
   * Keep production OAuth failures diagnosable without logging authorization''',
)

replace(
    "apps/api/src/modules/auth/auth.controller.ts",
    '''    if (password.length < 6)
      throw new BadRequestException({
        error: "비밀번호는 6자 이상이어야 해요.",
      });

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) {
      throw new HttpException(
        { error: "이미 가입된 이메일이에요." },
        HttpStatus.CONFLICT,
      );
    }

    await db
      .insert(users)
      .values({
        email,
        name,
        image,
        avatar,
        passwordHash: hashPassword(password),
      });
    return { ok: true };''',
    '''    if (password.length < 12 || password.length > 256)
      throw new BadRequestException({
        error: "비밀번호는 12자 이상 256자 이하로 입력해 주세요.",
      });

    const passwordHash = await hashPasswordAsync(password);
    const [inserted] = await db
      .insert(users)
      .values({
        email,
        name,
        image,
        avatar,
        passwordHash,
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    if (!inserted) {
      throw new HttpException(
        { error: "이미 가입된 이메일이에요." },
        HttpStatus.CONFLICT,
      );
    }
    return { ok: true };''',
)

replace(
    "apps/api/src/modules/auth/auth.controller.ts",
    '''    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new HttpException(''',
    '''    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const passwordMatches = await verifyPasswordAsync(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !passwordMatches) {
      throw new HttpException(''',
)

replace(
    "apps/api/src/modules/auth/auth.controller.ts",
    '''function normalizeEmail(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .trim();
}
''',
    '''function normalizeEmail(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .trim();
}

function requestUserId(request: Request): string | null {
  const value = request.headers["x-user-id"];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) return value.find((item) => item.trim())?.trim() ?? null;
  return null;
}
''',
)

# Stronger client-side signup guidance while login remains compatible with old passwords.
replace(
    "apps/web/src/domains/auth/components/auth-modal.tsx",
    'password: z.string().min(6, "비밀번호는 6자 이상이어야 해요."),',
    'password: z.string().min(12, "비밀번호는 12자 이상이어야 해요.").max(256, "비밀번호가 너무 깁니다."),',
)
replace(
    "apps/web/src/domains/auth/components/auth-modal.tsx",
    'placeholder="비밀번호 (6자 이상)"',
    'placeholder={mode === "signup" ? "비밀번호 (12자 이상)" : "비밀번호"}',
)

# Account-link management UI.
write(
    "apps/web/src/domains/account/AuthAccountLinksCard.tsx",
    textwrap.dedent(
        '''\
        import { CheckCircle2, Link2, Unlink } from "lucide-react";
        import { useEffect, useMemo, useState } from "react";

        import {
          parseAuthProviderDiscovery,
          type AuthProviderDiscovery,
        } from "@/domains/auth/components/auth-provider-discovery";
        import { withCsrfProtection } from "@/shared/lib/csrf";
        import { apiPath } from "@/infrastructure/api";

        type Provider = "google" | "kakao" | "naver" | "github";
        type LinkedAccount = { provider: Provider; canUnlink: boolean };
        const LABELS: Record<Provider, string> = {
          google: "Google",
          kakao: "카카오",
          naver: "네이버",
          github: "GitHub",
        };

        export function AuthAccountLinksCard({ userId }: { userId: string | null }) {
          const [providers, setProviders] = useState<AuthProviderDiscovery>({});
          const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
          const [message, setMessage] = useState("");
          const [busy, setBusy] = useState<Provider | null>(null);

          const refresh = async () => {
            if (!userId) return;
            const [providerResponse, accountResponse] = await Promise.all([
              fetch(apiPath("/auth/providers"), { cache: "no-store" }),
              fetch(apiPath("/auth/account-links"), { cache: "no-store" }),
            ]);
            if (providerResponse.ok) {
              setProviders(parseAuthProviderDiscovery(await providerResponse.json()));
            }
            if (accountResponse.ok) {
              const payload = await accountResponse.json() as { accounts?: LinkedAccount[] };
              setAccounts(Array.isArray(payload.accounts) ? payload.accounts : []);
            }
          };

          useEffect(() => {
            void refresh().catch(() => setMessage("연결 정보를 불러오지 못했어요."));
          }, [userId]);

          const linked = useMemo(
            () => new Map(accounts.map((account) => [account.provider, account])),
            [accounts],
          );
          if (!userId) return null;

          const available = (Object.keys(LABELS) as Provider[]).filter((provider) => {
            const config = providers[provider];
            return config?.mode === "oauth";
          });

          const unlink = async (provider: Provider) => {
            setBusy(provider);
            setMessage("");
            try {
              const response = await fetch(
                apiPath(`/auth/account-links/${provider}`),
                withCsrfProtection({ method: "DELETE" }),
              );
              const payload = await response.json().catch(() => null) as { error?: string } | null;
              if (!response.ok) throw new Error(payload?.error || "연결 해제에 실패했어요.");
              await refresh();
              setMessage(`${LABELS[provider]} 연결을 해제했어요.`);
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "연결 해제에 실패했어요.");
            } finally {
              setBusy(null);
            }
          };

          return (
            <section id="account-security" className="mb-6 rounded-2xl border border-line bg-panel/40 p-5">
              <div className="mb-4 flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Link2 size={16} />
                </span>
                <div>
                  <h2 className="text-base font-semibold">로그인 계정 연결</h2>
                  <p className="mt-1 text-xs leading-relaxed text-fg-2">
                    같은 이메일만으로 계정을 자동 합치지 않습니다. 로그인한 상태에서 직접 연결해 주세요.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {available.map((provider) => {
                  const account = linked.get(provider);
                  const config = providers[provider];
                  return (
                    <div key={provider} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line bg-card px-3 py-2">
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        {account && <CheckCircle2 size={15} className="text-good" />}
                        {LABELS[provider]}
                      </span>
                      {account ? (
                        <button
                          type="button"
                          disabled={!account.canUnlink || busy === provider}
                          onClick={() => void unlink(provider)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold text-fg-2 disabled:cursor-not-allowed disabled:opacity-40"
                          title={account.canUnlink ? "이 로그인 연결 해제" : "마지막 로그인 수단은 해제할 수 없습니다."}
                        >
                          <Unlink size={13} /> 연결 해제
                        </button>
                      ) : config?.redirectAvailable ? (
                        <button
                          type="button"
                          onClick={() => globalThis.location.assign(apiPath(`/auth/oauth/${provider}/link/start`))}
                          className="min-h-9 rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent"
                        >
                          연결하기
                        </button>
                      ) : (
                        <span className="text-xs text-fg-3">서버 설정 필요</span>
                      )}
                    </div>
                  );
                })}
                {available.length === 0 && (
                  <p className="rounded-xl border border-line bg-card p-3 text-xs text-fg-3">
                    현재 연결할 수 있는 소셜 로그인 제공자가 없습니다.
                  </p>
                )}
              </div>
              {message && <p className="mt-3 text-xs text-fg-2" role="status">{message}</p>}
            </section>
          );
        }
        '''
    ),
)
replace(
    "apps/web/src/domains/account/SettingsPage.tsx",
    'import { LibraryBackupImport } from "./LibraryBackupImport";',
    'import { AuthAccountLinksCard } from "./AuthAccountLinksCard";\nimport { LibraryBackupImport } from "./LibraryBackupImport";',
)
replace(
    "apps/web/src/domains/account/SettingsPage.tsx",
    '''      <Link to="/settings/ai" className="mb-6 flex min-h-16 items-center justify-between rounded-xl border border-line p-4 text-accent">
        <span><strong>통합 AI 설정</strong><span className="mt-1 block text-sm text-fg-2">텍스트·이미지·영상·3D의 사용자 키와 암호화 보관함을 한곳에서 관리</span></span>
        <ChevronRight size={18} aria-hidden />
      </Link>
''',
    '''      <Link to="/settings/ai" className="mb-6 flex min-h-16 items-center justify-between rounded-xl border border-line p-4 text-accent">
        <span><strong>통합 AI 설정</strong><span className="mt-1 block text-sm text-fg-2">텍스트·이미지·영상·3D의 사용자 키와 암호화 보관함을 한곳에서 관리</span></span>
        <ChevronRight size={18} aria-hidden />
      </Link>

      <AuthAccountLinksCard userId={userId} />
''',
)

replace(
    "apps/web/src/domains/account/AuthCallbackPage.tsx",
    '''  access_denied: "auth.callback.error.accessDenied",
};''',
    '''  access_denied: "auth.callback.error.accessDenied",
  account_link_required: "auth.callback.error.oauthFailed",
  account_already_linked: "auth.callback.error.oauthFailed",
  link_login_required: "auth.callback.error.oauthFailed",
};''',
)
replace(
    "apps/web/src/domains/account/AuthCallbackPage.tsx",
    '''      globalThis.setTimeout(() => navigate("/", { replace: true }), isDemo ? 1400 : 700);''',
    '''      const destination = params.linked ? "/settings#account-security" : "/";
      globalThis.setTimeout(() => navigate(destination, { replace: true }), isDemo ? 1400 : 700);''',
)

# ---------------------------------------------------------------------------
# DB-level normalized email uniqueness. Existing production rows are audited
# before normalization; migration aborts rather than guessing ownership.
# ---------------------------------------------------------------------------
write(
    "apps/api/src/db/migrations/0057_auth_identity_hardening.sql",
    textwrap.dedent(
        '''\
        -- Authentication identity hardening: normalized email uniqueness and
        -- bounded provider subjects. Abort on ambiguous historical ownership.
        BEGIN;

        DO $$
        BEGIN
          IF EXISTS (
            SELECT lower(btrim(email))
            FROM public."user"
            WHERE email IS NOT NULL
            GROUP BY lower(btrim(email))
            HAVING count(*) > 1
          ) THEN
            RAISE EXCEPTION 'normalized duplicate user emails must be reconciled before migration 0057';
          END IF;
        END
        $$;

        UPDATE public."user"
        SET email = lower(btrim(email))
        WHERE email IS NOT NULL
          AND email IS DISTINCT FROM lower(btrim(email));

        CREATE UNIQUE INDEX IF NOT EXISTS user_email_normalized_unique
          ON public."user" (lower(btrim(email)))
          WHERE email IS NOT NULL;

        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'account_provider_account_id_length_check'
              AND conrelid = 'public.account'::regclass
          ) THEN
            ALTER TABLE public.account
              ADD CONSTRAINT account_provider_account_id_length_check
              CHECK (length("providerAccountId") BETWEEN 1 AND 512) NOT VALID;
          END IF;
        END
        $$;

        ALTER TABLE public.account
          VALIDATE CONSTRAINT account_provider_account_id_length_check;

        COMMIT;
        '''
    ),
)
manifest = read("scripts/production-database-migrations.manifest").rstrip() + "\n"
entry = "apps/api/src/db/migrations/0057_auth_identity_hardening.sql\n"
if entry not in manifest:
    manifest += entry
write("scripts/production-database-migrations.manifest", manifest)

replace(
    "scripts/run-production-database-migrations.test.mjs",
    '''  expect(manifest).toHaveLength(56);
  expect(manifest[0].id).toBe("0001_studio_ai_usage_ledger");
  expect(manifest.at(-1).id).toBe(
    "0056_studio_ai_free_pool_contract",
  );
  expect(new Set(manifest.map(({ checksum }) => checksum)).size).toBe(56);''',
    '''  expect(manifest).toHaveLength(57);
  expect(manifest[0].id).toBe("0001_studio_ai_usage_ledger");
  expect(manifest.at(-1).id).toBe(
    "0057_auth_identity_hardening",
  );
  expect(new Set(manifest.map(({ checksum }) => checksum)).size).toBe(57);''',
)

# Document the removed runtime authority so it is not reintroduced accidentally.
for rel in [".env.example", ".env.production.example"]:
    content = read(rel)
    content = re.sub(
        r"# 관리자 이메일 화이트리스트[^\n]*\nADMIN_EMAILS=.*",
        "# Deprecated: 이메일은 관리자 권한을 부여하지 않습니다. DB role을 운영 절차로 변경하세요.\nADMIN_EMAILS=",
        content,
        count=1,
    )
    write(rel, content)

# Remove the one-shot patch machinery from the resulting commit.
path(".github/workflows/apply-auth-identity-hardening.yml").unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
