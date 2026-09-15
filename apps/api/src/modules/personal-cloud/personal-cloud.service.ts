import { Injectable } from "@nestjs/common";

import {
  personalCloudProviderConfig,
  personalCloudRuntimeConfig,
} from "./personal-cloud.config";
import {
  createPersonalCloudNonce,
  createPersonalCloudPkcePair,
  decryptPersonalCloudSecret,
  encryptPersonalCloudSecret,
  encodePersonalCloudOAuthState,
  personalCloudTokenContext,
  verifyPersonalCloudOAuthState,
} from "./personal-cloud.crypto";
import {
  buildPersonalCloudAuthorizeUrl,
  exchangePersonalCloudCode,
  fetchPersonalCloudAccountProfile,
  refreshPersonalCloudToken,
  revokePersonalCloudToken,
} from "./personal-cloud.provider";
import { PersonalCloudRepository } from "./personal-cloud.repository";
import {
  PERSONAL_CLOUD_PROVIDERS,
  maskPersonalCloudAccountLabel,
  type PersonalCloudConnectionRecord,
  type PersonalCloudConnectionStatus,
  type PersonalCloudOAuthCookiePayload,
  type PersonalCloudProviderId,
  type PersonalCloudTokenSet,
} from "./personal-cloud.types";

export class PersonalCloudServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PersonalCloudServiceError";
  }
}

function safeReturnTo(value: string | undefined): string {
  const candidate = value?.trim() || "/studio?view=storage";
  if (
    candidate.length <= 1_000
    && candidate.startsWith("/studio")
    && !candidate.startsWith("//")
    && !candidate.includes("\0")
  ) {
    return candidate;
  }
  return "/studio?view=storage";
}

function tokenContext(record: Pick<PersonalCloudConnectionRecord, "userId" | "provider">, kind: "access" | "refresh") {
  return personalCloudTokenContext(record.userId, record.provider, kind);
}

function encryptTokens(
  userId: string,
  provider: PersonalCloudProviderId,
  tokens: PersonalCloudTokenSet,
  secret: string,
): { readonly access: string; readonly refresh: string } {
  if (!tokens.refreshToken) throw new PersonalCloudServiceError(409, "offline-access-required", "장기 저장 권한을 받지 못했습니다. 계정을 다시 연결해 주세요.");
  return Object.freeze({
    access: encryptPersonalCloudSecret(
      tokens.accessToken,
      personalCloudTokenContext(userId, provider, "access"),
      secret,
    ),
    refresh: encryptPersonalCloudSecret(
      tokens.refreshToken,
      personalCloudTokenContext(userId, provider, "refresh"),
      secret,
    ),
  });
}

function splitScope(value: string): readonly string[] {
  return Object.freeze(value.split(/[ ,]+/u).map((entry) => entry.trim()).filter(Boolean));
}

@Injectable()
export class PersonalCloudService {
  constructor(private readonly repository: PersonalCloudRepository) {}

  async status(userId: string): Promise<readonly PersonalCloudConnectionStatus[]> {
    const connections = new Map(
      (await this.repository.list(userId)).map((connection) => [connection.provider, connection] as const),
    );
    return Object.freeze(PERSONAL_CLOUD_PROVIDERS.map((provider) => {
      const config = personalCloudProviderConfig(provider);
      const connection = connections.get(provider) ?? null;
      return Object.freeze({
        provider,
        label: config.label,
        configured: config.configured,
        connected: connection !== null,
        reason: config.configured ? null : config.reason,
        accountLabel: connection ? maskPersonalCloudAccountLabel(connection.accountLabel) : null,
        scope: connection ? splitScope(connection.scope) : Object.freeze([]),
        accessTokenExpiresAt: connection?.accessTokenExpiresAt.toISOString() ?? null,
        updatedAt: connection?.updatedAt.toISOString() ?? null,
        lastUsedAt: connection?.lastUsedAt?.toISOString() ?? null,
      });
    }));
  }

  startConnection(input: {
    readonly userId: string;
    readonly provider: PersonalCloudProviderId;
    readonly returnTo?: string;
  }): { readonly authorizeUrl: string; readonly cookieValue: string; readonly maxAgeMs: number } {
    const runtime = personalCloudRuntimeConfig(input.provider);
    if (!runtime.provider.configured) {
      throw new PersonalCloudServiceError(503, "provider-not-configured", `${runtime.provider.label} 개인 저장소 연결이 아직 설정되지 않았습니다.`);
    }
    const issuedAt = Date.now();
    const nonce = createPersonalCloudNonce();
    const returnTo = safeReturnTo(input.returnTo);
    const pkce = createPersonalCloudPkcePair();
    const state = encodePersonalCloudOAuthState({
      version: 1,
      provider: input.provider,
      userId: input.userId,
      nonce,
      returnTo,
      issuedAt,
    }, runtime.stateSecret);
    const cookiePayload: PersonalCloudOAuthCookiePayload = {
      version: 1,
      provider: input.provider,
      userId: input.userId,
      nonce,
      verifier: pkce.verifier,
      returnTo,
      issuedAt,
    };
    const cookieValue = encryptPersonalCloudSecret(
      JSON.stringify(cookiePayload),
      personalCloudTokenContext(input.userId, input.provider, "oauth-cookie"),
      runtime.tokenEncryptionSecret,
    );
    return Object.freeze({
      authorizeUrl: buildPersonalCloudAuthorizeUrl(runtime.provider, { state, challenge: pkce.challenge }),
      cookieValue,
      maxAgeMs: 10 * 60_000,
    });
  }

  async completeConnection(input: {
    readonly provider: PersonalCloudProviderId;
    readonly state: string;
    readonly code: string;
    readonly cookieValue: string;
    readonly sessionUserId?: string;
  }): Promise<{ readonly returnTo: string; readonly accountLabel: string }> {
    const runtime = personalCloudRuntimeConfig(input.provider);
    if (!runtime.provider.configured) {
      throw new PersonalCloudServiceError(503, "provider-not-configured", "개인 저장소 연결이 설정되지 않았습니다.");
    }
    const state = verifyPersonalCloudOAuthState(input.state, runtime.stateSecret);
    if (!state || state.provider !== input.provider) {
      throw new PersonalCloudServiceError(400, "invalid-state", "저장소 연결 요청이 만료되었거나 올바르지 않습니다.");
    }
    if (!input.sessionUserId) {
      throw new PersonalCloudServiceError(401, "session-required", "저장소 연결을 완료하려면 다시 로그인해 주세요.");
    }
    if (input.sessionUserId !== state.userId) {
      throw new PersonalCloudServiceError(403, "session-user-mismatch", "현재 로그인 계정과 저장소 연결 요청이 일치하지 않습니다.");
    }
    let cookie: PersonalCloudOAuthCookiePayload;
    try {
      const plaintext = decryptPersonalCloudSecret(
        input.cookieValue,
        personalCloudTokenContext(state.userId, state.provider, "oauth-cookie"),
        runtime.tokenEncryptionSecret,
      );
      cookie = JSON.parse(plaintext) as PersonalCloudOAuthCookiePayload;
    } catch {
      throw new PersonalCloudServiceError(400, "invalid-oauth-cookie", "저장소 연결 확인 정보를 복구하지 못했습니다.");
    }
    if (
      cookie.version !== 1
      || cookie.provider !== state.provider
      || cookie.userId !== state.userId
      || cookie.nonce !== state.nonce
      || cookie.returnTo !== state.returnTo
      || cookie.issuedAt !== state.issuedAt
      || typeof cookie.verifier !== "string"
      || cookie.verifier.length < 43
      || cookie.verifier.length > 128
    ) {
      throw new PersonalCloudServiceError(400, "oauth-binding-mismatch", "저장소 연결 요청 정보가 일치하지 않습니다.");
    }
    const tokens = await exchangePersonalCloudCode(runtime.provider, {
      code: input.code,
      verifier: cookie.verifier,
    });
    const account = await fetchPersonalCloudAccountProfile(runtime.provider, tokens.accessToken);
    const encrypted = encryptTokens(state.userId, state.provider, tokens, runtime.tokenEncryptionSecret);
    await this.repository.upsert({
      userId: state.userId,
      provider: state.provider,
      providerAccountId: account.providerAccountId,
      accountLabel: account.accountLabel,
      encryptedAccessToken: encrypted.access,
      encryptedRefreshToken: encrypted.refresh,
      tokenType: tokens.tokenType,
      scope: tokens.scope || runtime.provider.scopes.join(" "),
      accessTokenExpiresAt: tokens.expiresAt,
    });
    return Object.freeze({
      returnTo: safeReturnTo(state.returnTo),
      accountLabel: maskPersonalCloudAccountLabel(account.accountLabel),
    });
  }

  private decryptToken(record: PersonalCloudConnectionRecord, kind: "access" | "refresh", secret: string): string {
    return decryptPersonalCloudSecret(
      kind === "access" ? record.encryptedAccessToken : record.encryptedRefreshToken,
      tokenContext(record, kind),
      secret,
    );
  }

  async accessToken(
    userId: string,
    provider: PersonalCloudProviderId,
  ): Promise<{
    readonly accessToken: string;
    readonly tokenType: string;
    readonly expiresAt: string;
    readonly scope: readonly string[];
    readonly accountLabel: string;
  }> {
    const runtime = personalCloudRuntimeConfig(provider);
    if (!runtime.provider.configured) {
      throw new PersonalCloudServiceError(503, "provider-not-configured", "개인 저장소 연결이 설정되지 않았습니다.");
    }
    const record = await this.repository.find(userId, provider);
    if (!record) throw new PersonalCloudServiceError(404, "connection-not-found", "연결된 개인 저장소 계정이 없습니다.");
    let accessToken = this.decryptToken(record, "access", runtime.tokenEncryptionSecret);
    let expiresAt = record.accessTokenExpiresAt;
    let scope = record.scope;
    let tokenType = record.tokenType;
    if (expiresAt.getTime() - Date.now() <= 90_000) {
      const refreshToken = this.decryptToken(record, "refresh", runtime.tokenEncryptionSecret);
      const refreshed = await refreshPersonalCloudToken(runtime.provider, refreshToken);
      const encrypted = encryptTokens(userId, provider, refreshed, runtime.tokenEncryptionSecret);
      const updated = await this.repository.updateTokens({
        userId,
        provider,
        encryptedAccessToken: encrypted.access,
        encryptedRefreshToken: encrypted.refresh,
        tokenType: refreshed.tokenType,
        scope: refreshed.scope || record.scope,
        accessTokenExpiresAt: refreshed.expiresAt,
      });
      accessToken = refreshed.accessToken;
      expiresAt = updated.accessTokenExpiresAt;
      scope = updated.scope;
      tokenType = updated.tokenType;
    } else {
      await this.repository.touch(userId, provider);
    }
    return Object.freeze({
      accessToken,
      tokenType,
      expiresAt: expiresAt.toISOString(),
      scope: splitScope(scope),
      accountLabel: maskPersonalCloudAccountLabel(record.accountLabel),
    });
  }

  async disconnect(userId: string, provider: PersonalCloudProviderId): Promise<boolean> {
    const runtime = personalCloudRuntimeConfig(provider);
    const record = await this.repository.find(userId, provider);
    if (!record) return false;
    if (runtime.provider.configured) {
      try {
        const token = this.decryptToken(record, "access", runtime.tokenEncryptionSecret);
        await revokePersonalCloudToken(provider, token);
      } catch {
        // Delete local credentials even when a provider revoke call or legacy token fails.
      }
    }
    return this.repository.remove(userId, provider);
  }
}
