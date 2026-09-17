import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

import type { DesktopCloudProviderId } from "./cloud/types.js";
import type { DesktopCredentialVault } from "./credential-vault.js";
import type { AddressInfo } from "node:net";

export const DESKTOP_OAUTH_CREDENTIAL_SERVICE =
  "ToonStudio Desktop Sync OAuth";
export const DEFAULT_DESKTOP_OAUTH_PROFILE = "default";

export const DESKTOP_OAUTH_CLIENT_ID_ENVIRONMENT: Readonly<
  Record<DesktopCloudProviderId, string>
> = Object.freeze({
  "google-drive": "TOONSTUDIO_GOOGLE_DRIVE_OAUTH_CLIENT_ID",
  dropbox: "TOONSTUDIO_DROPBOX_OAUTH_CLIENT_ID",
  onedrive: "TOONSTUDIO_ONEDRIVE_OAUTH_CLIENT_ID",
});

export interface DesktopOAuthProviderConfig {
  readonly id: DesktopCloudProviderId;
  readonly label: string;
  readonly clientId: string;
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly accountUrl: string;
  readonly scopes: readonly string[];
  readonly tenant: string | null;
}

export interface DesktopOAuthTokenBundle {
  readonly schemaVersion: 1;
  readonly provider: DesktopCloudProviderId;
  readonly profile: string;
  readonly clientId: string;
  readonly tenant: string | null;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: string;
  readonly scope: string;
  readonly expiresAt: string;
  readonly providerAccountId: string;
  readonly accountLabel: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DesktopOAuthCredentialStatus {
  readonly provider: DesktopCloudProviderId;
  readonly profile: string;
  readonly connected: boolean;
  readonly accountLabel: string | null;
  readonly expiresAt: string | null;
  readonly scope: readonly string[];
}

export type DesktopCloudAccessTokenSource = (
  signal?: AbortSignal,
) => Promise<string>;

export type DesktopOAuthErrorCode =
  | "invalid-config"
  | "callback-timeout"
  | "callback-rejected"
  | "invalid-state"
  | "provider-response"
  | "offline-access-required"
  | "credential-missing";

export class DesktopOAuthError extends Error {
  constructor(
    readonly code: DesktopOAuthErrorCode,
    message: string,
    options: { readonly cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "DesktopOAuthError";
  }
}

function cleanProfile(value: string): string {
  const clean = value.normalize("NFKC").trim();
  if (
    clean.length < 1
    || clean.length > 80
    || !/^[\p{L}\p{N}._@+-]+$/u.test(clean)
  ) {
    throw new DesktopOAuthError("invalid-config", "OAuth profile name is invalid");
  }
  return clean;
}

function safeTenant(value: string | undefined): string {
  const candidate = value?.trim() || "common";
  return /^(?:common|consumers|organizations|[0-9a-f-]{36})$/iu.test(candidate)
    ? candidate
    : "common";
}

export function desktopOAuthProviderConfig(
  provider: DesktopCloudProviderId,
  clientIdValue: string,
  tenantValue?: string,
): DesktopOAuthProviderConfig {
  const clientId = clientIdValue.trim();
  if (!clientId || clientId.length > 512) {
    throw new DesktopOAuthError("invalid-config", "desktop OAuth client id is missing or invalid");
  }
  if (provider === "google-drive") {
    return Object.freeze({
      id: provider,
      label: "Google Drive",
      clientId,
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      accountUrl: "https://openidconnect.googleapis.com/v1/userinfo",
      scopes: Object.freeze([
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/drive.file",
      ]),
      tenant: null,
    });
  }
  if (provider === "dropbox") {
    return Object.freeze({
      id: provider,
      label: "Dropbox",
      clientId,
      authorizeUrl: "https://www.dropbox.com/oauth2/authorize",
      tokenUrl: "https://api.dropboxapi.com/oauth2/token",
      accountUrl: "https://api.dropboxapi.com/2/users/get_current_account",
      scopes: Object.freeze([
        "account_info.read",
        "files.metadata.read",
        "files.content.read",
        "files.content.write",
      ]),
      tenant: null,
    });
  }
  const tenant = safeTenant(tenantValue);
  return Object.freeze({
    id: provider,
    label: "OneDrive",
    clientId,
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    accountUrl: "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName",
    scopes: Object.freeze([
      "openid",
      "profile",
      "email",
      "offline_access",
      "Files.ReadWrite.AppFolder",
      "User.Read",
    ]),
    tenant,
  });
}

function base64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

export function createDesktopPkcePair(): {
  readonly verifier: string;
  readonly challenge: string;
} {
  const verifier = base64Url(randomBytes(64));
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  return Object.freeze({ verifier, challenge });
}

export function buildDesktopOAuthAuthorizeUrl(
  config: DesktopOAuthProviderConfig,
  input: {
    readonly redirectUri: string;
    readonly state: string;
    readonly challenge: string;
  },
): string {
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", config.scopes.join(" "));
  if (config.id === "google-drive") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent select_account");
  } else if (config.id === "dropbox") {
    url.searchParams.set("token_access_type", "offline");
  } else {
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("prompt", "select_account");
  }
  return url.toString();
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveSeconds(value: unknown, fallback = 3_600): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(86_400, Math.floor(parsed))
    : fallback;
}

async function responseJson(response: Response): Promise<JsonRecord> {
  const text = await response.text();
  if (text.length > 256 * 1024) {
    throw new DesktopOAuthError("provider-response", "OAuth provider response is too large");
  }
  if (!text) return {};
  try {
    return record(JSON.parse(text));
  } catch {
    throw new DesktopOAuthError(
      "provider-response",
      `OAuth provider returned invalid JSON (${response.status})`,
    );
  }
}

async function checkedJson(response: Response, operation: string): Promise<JsonRecord> {
  const body = await responseJson(response);
  if (response.ok) return body;
  const nested = record(body.error);
  const providerCode = stringValue(body.error)
    || stringValue(nested.code)
    || "provider-error";
  throw new DesktopOAuthError(
    "provider-response",
    `${operation} failed (${response.status}, ${providerCode.slice(0, 80)})`,
  );
}

interface OAuthTokenResponse {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly tokenType: string;
  readonly scope: string;
  readonly expiresAt: string;
}

function tokenResponse(
  body: JsonRecord,
  now: number,
  fallbackRefreshToken: string | null = null,
): OAuthTokenResponse {
  const accessToken = stringValue(body.access_token);
  const refreshToken = stringValue(body.refresh_token) || fallbackRefreshToken;
  if (!accessToken) {
    throw new DesktopOAuthError(
      "provider-response",
      "OAuth provider did not return an access token",
    );
  }
  return Object.freeze({
    accessToken,
    refreshToken,
    tokenType: stringValue(body.token_type) || "Bearer",
    scope: stringValue(body.scope),
    expiresAt: new Date(
      now + positiveSeconds(body.expires_in) * 1_000,
    ).toISOString(),
  });
}

async function tokenRequest(
  config: DesktopOAuthProviderConfig,
  values: Readonly<Record<string, string>>,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<JsonRecord> {
  let response: Response;
  try {
    response = await fetchImpl(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ client_id: config.clientId, ...values }),
      signal: signal ?? AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    throw new DesktopOAuthError(
      "provider-response",
      "OAuth provider could not be reached",
      { cause: error },
    );
  }
  return checkedJson(response, "OAuth token request");
}

export async function exchangeDesktopOAuthCode(
  config: DesktopOAuthProviderConfig,
  input: {
    readonly code: string;
    readonly verifier: string;
    readonly redirectUri: string;
  },
  dependencies: {
    readonly fetchImpl?: typeof fetch;
    readonly now?: () => number;
    readonly signal?: AbortSignal;
  } = {},
): Promise<OAuthTokenResponse> {
  const body = await tokenRequest(config, {
    grant_type: "authorization_code",
    code: input.code,
    code_verifier: input.verifier,
    redirect_uri: input.redirectUri,
  }, dependencies.fetchImpl ?? fetch, dependencies.signal);
  const tokens = tokenResponse(body, (dependencies.now ?? Date.now)());
  if (!tokens.refreshToken) {
    throw new DesktopOAuthError(
      "offline-access-required",
      "offline access was not granted; reconnect the cloud account",
    );
  }
  return tokens;
}

export async function refreshDesktopOAuthToken(
  config: DesktopOAuthProviderConfig,
  refreshToken: string,
  dependencies: {
    readonly fetchImpl?: typeof fetch;
    readonly now?: () => number;
    readonly signal?: AbortSignal;
  } = {},
): Promise<OAuthTokenResponse> {
  const body = await tokenRequest(config, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    ...(config.id === "onedrive"
      ? { scope: config.scopes.join(" ") }
      : {}),
  }, dependencies.fetchImpl ?? fetch, dependencies.signal);
  return tokenResponse(
    body,
    (dependencies.now ?? Date.now)(),
    refreshToken,
  );
}

interface DesktopOAuthAccountProfile {
  readonly providerAccountId: string;
  readonly accountLabel: string;
}

export async function fetchDesktopOAuthAccountProfile(
  config: DesktopOAuthProviderConfig,
  accessToken: string,
  dependencies: {
    readonly fetchImpl?: typeof fetch;
    readonly signal?: AbortSignal;
  } = {},
): Promise<DesktopOAuthAccountProfile> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(config.accountUrl, {
      method: config.id === "dropbox" ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(config.id === "dropbox"
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(config.id === "dropbox" ? { body: "null" } : {}),
      signal: dependencies.signal ?? AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (dependencies.signal?.aborted) throw dependencies.signal.reason;
    throw new DesktopOAuthError(
      "provider-response",
      "OAuth account profile could not be loaded",
      { cause: error },
    );
  }
  const body = await checkedJson(response, "OAuth account lookup");
  if (config.id === "google-drive") {
    const providerAccountId = stringValue(body.sub);
    const accountLabel = stringValue(body.email);
    if (!providerAccountId || !accountLabel) {
      throw new DesktopOAuthError(
        "provider-response",
        "Google account profile is incomplete",
      );
    }
    return Object.freeze({ providerAccountId, accountLabel });
  }
  if (config.id === "dropbox") {
    const providerAccountId = stringValue(body.account_id);
    const accountLabel = stringValue(body.email)
      || stringValue(record(body.name).display_name);
    if (!providerAccountId || !accountLabel) {
      throw new DesktopOAuthError(
        "provider-response",
        "Dropbox account profile is incomplete",
      );
    }
    return Object.freeze({ providerAccountId, accountLabel });
  }
  const providerAccountId = stringValue(body.id);
  const accountLabel = stringValue(body.mail)
    || stringValue(body.userPrincipalName)
    || stringValue(body.displayName);
  if (!providerAccountId || !accountLabel) {
    throw new DesktopOAuthError(
      "provider-response",
      "OneDrive account profile is incomplete",
    );
  }
  return Object.freeze({ providerAccountId, accountLabel });
}

export type DesktopBrowserLauncher = (url: string) => Promise<void>;

export async function openDesktopBrowser(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new DesktopOAuthError(
      "invalid-config",
      "desktop OAuth authorization URL must use HTTPS",
    );
  }
  const command = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "rundll32"
      : "xdg-open";
  const arguments_ = process.platform === "win32"
    ? ["url.dll,FileProtocolHandler", parsed.toString()]
    : [parsed.toString()];
  await new Promise<void>((resolveOpen, rejectOpen) => {
    const child = spawn(command, arguments_, {
      detached: true,
      stdio: "ignore",
    });
    child.once("error", (error) => {
      rejectOpen(new DesktopOAuthError(
        "invalid-config",
        "the system browser could not be opened",
        { cause: error },
      ));
    });
    child.once("spawn", () => {
      child.unref();
      resolveOpen();
    });
  });
}

export interface LoopbackCallback {
  readonly redirectUri: string;
  readonly code: Promise<string>;
  close(): Promise<void>;
}

function oauthResponsePage(success: boolean): string {
  const title = success ? "ToonStudio 연결 완료" : "ToonStudio 연결 실패";
  const message = success
    ? "계정 연결을 마쳤습니다. 이 창을 닫고 ToonStudio로 돌아가세요."
    : "계정 연결을 완료하지 못했습니다. ToonStudio에서 다시 시도하세요.";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${title}</title><style>body{font-family:system-ui,sans-serif;margin:0;display:grid;min-height:100vh;place-items:center;background:#111827;color:#f9fafb}.card{max-width:34rem;margin:2rem;padding:2rem;border:1px solid #374151;border-radius:1rem;background:#1f2937}h1{margin-top:0;font-size:1.35rem}p{line-height:1.6;color:#d1d5db}</style></head><body><main class="card"><h1>${title}</h1><p>${message}</p></main></body></html>`;
}

export async function createDesktopOAuthLoopbackCallback(
  expectedState: string,
  options: {
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
  } = {},
): Promise<LoopbackCallback> {
  if (!expectedState || expectedState.length > 512) {
    throw new DesktopOAuthError("invalid-config", "OAuth state is invalid");
  }
  const timeoutMs = options.timeoutMs ?? 5 * 60_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000) {
    throw new DesktopOAuthError("invalid-config", "OAuth callback timeout is invalid");
  }
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: unknown) => void;
  let settled = false;
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  const settle = (
    response: Parameters<typeof resolveCode>[0] | null,
    error: unknown = null,
  ): void => {
    if (settled) return;
    settled = true;
    if (error !== null) rejectCode(error);
    else resolveCode(response ?? "");
  };
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/oauth/callback") {
      response.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end("Not found");
      return;
    }
    const state = url.searchParams.get("state") ?? "";
    const providerError = url.searchParams.get("error") ?? "";
    const authorizationCode = url.searchParams.get("code") ?? "";
    if (state !== expectedState) {
      response.writeHead(400, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(oauthResponsePage(false));
      settle(null, new DesktopOAuthError(
        "invalid-state",
        "OAuth callback state did not match",
      ));
      return;
    }
    if (providerError || !authorizationCode) {
      response.writeHead(400, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(oauthResponsePage(false));
      settle(null, new DesktopOAuthError(
        "callback-rejected",
        providerError
          ? `OAuth provider rejected the request: ${providerError.slice(0, 80)}`
          : "OAuth callback did not include an authorization code",
      ));
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    });
    response.end(oauthResponsePage(true));
    settle(authorizationCode);
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      rejectListen(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true });
  }).catch((error: unknown) => {
    throw new DesktopOAuthError(
      "invalid-config",
      "desktop OAuth loopback callback could not start",
      { cause: error },
    );
  });

  const address = server.address() as AddressInfo | null;
  if (!address || typeof address.port !== "number") {
    server.close();
    throw new DesktopOAuthError(
      "invalid-config",
      "desktop OAuth loopback callback has no port",
    );
  }
  const timer = setTimeout(() => {
    settle(null, new DesktopOAuthError(
      "callback-timeout",
      "desktop OAuth callback timed out",
    ));
  }, timeoutMs);
  timer.unref?.();
  const onAbort = (): void => settle(null, options.signal?.reason ?? new Error("aborted"));
  options.signal?.addEventListener("abort", onAbort, { once: true });

  return {
    redirectUri: `http://127.0.0.1:${address.port}/oauth/callback`,
    code,
    async close(): Promise<void> {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (!server.listening) return;
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) rejectClose(error);
          else resolveClose();
        });
      });
    },
  };
}

function credentialAccount(
  provider: DesktopCloudProviderId,
  profileValue: string,
): string {
  return `oauth:${provider}:${cleanProfile(profileValue)}`;
}

function isProvider(value: unknown): value is DesktopCloudProviderId {
  return value === "google-drive" || value === "dropbox" || value === "onedrive";
}

function parsedBundle(raw: string): DesktopOAuthTokenBundle | null {
  if (Buffer.byteLength(raw, "utf8") > 512 * 1024) return null;
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const row = candidate as Partial<DesktopOAuthTokenBundle>;
  if (
    row.schemaVersion !== 1
    || !isProvider(row.provider)
    || typeof row.profile !== "string"
    || typeof row.clientId !== "string"
    || row.clientId.length < 1
    || row.clientId.length > 512
    || (row.tenant !== null && typeof row.tenant !== "string")
    || typeof row.accessToken !== "string"
    || row.accessToken.length < 1
    || row.accessToken.length > 256 * 1024
    || typeof row.refreshToken !== "string"
    || row.refreshToken.length < 1
    || row.refreshToken.length > 256 * 1024
    || typeof row.tokenType !== "string"
    || typeof row.scope !== "string"
    || typeof row.expiresAt !== "string"
    || typeof row.providerAccountId !== "string"
    || typeof row.accountLabel !== "string"
    || typeof row.createdAt !== "string"
    || typeof row.updatedAt !== "string"
  ) return null;
  if (
    row.profile !== cleanProfile(row.profile)
    || !Number.isFinite(Date.parse(row.expiresAt))
    || !Number.isFinite(Date.parse(row.createdAt))
    || !Number.isFinite(Date.parse(row.updatedAt))
  ) return null;
  return Object.freeze(row as DesktopOAuthTokenBundle);
}

function splitScope(value: string): readonly string[] {
  return Object.freeze(
    value.split(/[ ,]+/u).map((entry) => entry.trim()).filter(Boolean),
  );
}

export type DesktopOAuthLoopbackFactory = (
  state: string,
  options?: {
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
  },
) => Promise<LoopbackCallback>;

export interface DesktopOAuthCredentialManagerDependencies {
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly launchBrowser?: DesktopBrowserLauncher;
  readonly createLoopback?: DesktopOAuthLoopbackFactory;
}

export interface DesktopOAuthLoginOptions {
  readonly profile?: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export class DesktopOAuthCredentialManager {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly launchBrowser: DesktopBrowserLauncher;
  private readonly createLoopback: DesktopOAuthLoopbackFactory;
  private readonly refreshes = new Map<string, Promise<string>>();

  constructor(
    private readonly vault: DesktopCredentialVault,
    dependencies: DesktopOAuthCredentialManagerDependencies = {},
  ) {
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.now = dependencies.now ?? Date.now;
    this.launchBrowser = dependencies.launchBrowser ?? openDesktopBrowser;
    this.createLoopback = dependencies.createLoopback
      ?? createDesktopOAuthLoopbackCallback;
  }

  private async load(
    provider: DesktopCloudProviderId,
    profileValue: string,
    signal?: AbortSignal,
  ): Promise<DesktopOAuthTokenBundle | null> {
    const profile = cleanProfile(profileValue);
    const account = credentialAccount(provider, profile);
    const raw = await this.vault.get(
      DESKTOP_OAUTH_CREDENTIAL_SERVICE,
      account,
      signal,
    );
    if (raw === null) return null;
    const bundle = parsedBundle(raw);
    if (
      bundle === null
      || bundle.provider !== provider
      || bundle.profile !== profile
    ) {
      await this.vault.delete(
        DESKTOP_OAUTH_CREDENTIAL_SERVICE,
        account,
        signal,
      );
      return null;
    }
    return bundle;
  }

  private async save(
    bundle: DesktopOAuthTokenBundle,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.vault.set(
      DESKTOP_OAUTH_CREDENTIAL_SERVICE,
      credentialAccount(bundle.provider, bundle.profile),
      JSON.stringify(bundle),
      signal,
    );
  }

  async status(
    provider: DesktopCloudProviderId,
    profileValue = DEFAULT_DESKTOP_OAUTH_PROFILE,
    signal?: AbortSignal,
  ): Promise<DesktopOAuthCredentialStatus> {
    const profile = cleanProfile(profileValue);
    const bundle = await this.load(provider, profile, signal);
    return Object.freeze({
      provider,
      profile,
      connected: bundle !== null,
      accountLabel: bundle?.accountLabel ?? null,
      expiresAt: bundle?.expiresAt ?? null,
      scope: bundle ? splitScope(bundle.scope) : Object.freeze([]),
    });
  }

  async login(
    config: DesktopOAuthProviderConfig,
    options: DesktopOAuthLoginOptions = {},
  ): Promise<DesktopOAuthCredentialStatus> {
    const profile = cleanProfile(
      options.profile ?? DEFAULT_DESKTOP_OAUTH_PROFILE,
    );
    const state = base64Url(randomBytes(32));
    const pkce = createDesktopPkcePair();
    const callback = await this.createLoopback(state, {
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
    try {
      const authorizeUrl = buildDesktopOAuthAuthorizeUrl(config, {
        redirectUri: callback.redirectUri,
        state,
        challenge: pkce.challenge,
      });
      await this.launchBrowser(authorizeUrl);
      const code = await callback.code;
      const tokens = await exchangeDesktopOAuthCode(config, {
        code,
        verifier: pkce.verifier,
        redirectUri: callback.redirectUri,
      }, {
        fetchImpl: this.fetchImpl,
        now: this.now,
        signal: options.signal,
      });
      const account = await fetchDesktopOAuthAccountProfile(
        config,
        tokens.accessToken,
        { fetchImpl: this.fetchImpl, signal: options.signal },
      );
      const timestamp = new Date(this.now()).toISOString();
      const bundle: DesktopOAuthTokenBundle = Object.freeze({
        schemaVersion: 1,
        provider: config.id,
        profile,
        clientId: config.clientId,
        tenant: config.tenant,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken!,
        tokenType: tokens.tokenType,
        scope: tokens.scope || config.scopes.join(" "),
        expiresAt: tokens.expiresAt,
        providerAccountId: account.providerAccountId,
        accountLabel: account.accountLabel,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await this.save(bundle, options.signal);
      return this.status(config.id, profile, options.signal);
    } finally {
      await callback.close().catch(() => undefined);
    }
  }

  private async refreshAccessToken(
    provider: DesktopCloudProviderId,
    profile: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const bundle = await this.load(provider, profile, signal);
    if (bundle === null) {
      throw new DesktopOAuthError(
        "credential-missing",
        `no ${provider} OAuth credential exists for profile ${profile}`,
      );
    }
    if (Date.parse(bundle.expiresAt) - this.now() > 90_000) {
      return bundle.accessToken;
    }
    const config = desktopOAuthProviderConfig(
      provider,
      bundle.clientId,
      bundle.tenant ?? undefined,
    );
    const refreshed = await refreshDesktopOAuthToken(
      config,
      bundle.refreshToken,
      { fetchImpl: this.fetchImpl, now: this.now, signal },
    );
    const updated: DesktopOAuthTokenBundle = Object.freeze({
      ...bundle,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? bundle.refreshToken,
      tokenType: refreshed.tokenType || bundle.tokenType,
      scope: refreshed.scope || bundle.scope,
      expiresAt: refreshed.expiresAt,
      updatedAt: new Date(this.now()).toISOString(),
    });
    await this.save(updated, signal);
    return updated.accessToken;
  }

  async accessToken(
    provider: DesktopCloudProviderId,
    profileValue = DEFAULT_DESKTOP_OAUTH_PROFILE,
    signal?: AbortSignal,
  ): Promise<string> {
    const profile = cleanProfile(profileValue);
    const key = `${provider}:${profile}`;
    const active = this.refreshes.get(key);
    if (active) return active;
    const promise = this.refreshAccessToken(provider, profile, signal);
    this.refreshes.set(key, promise);
    try {
      return await promise;
    } finally {
      if (this.refreshes.get(key) === promise) this.refreshes.delete(key);
    }
  }

  accessTokenSource(
    provider: DesktopCloudProviderId,
    profile = DEFAULT_DESKTOP_OAUTH_PROFILE,
  ): DesktopCloudAccessTokenSource {
    return (signal) => this.accessToken(provider, profile, signal);
  }

  async logout(
    provider: DesktopCloudProviderId,
    profileValue = DEFAULT_DESKTOP_OAUTH_PROFILE,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const profile = cleanProfile(profileValue);
    const bundle = await this.load(provider, profile, signal);
    if (bundle === null) return false;
    await revokeDesktopOAuthToken(bundle, this.fetchImpl, signal);
    return this.vault.delete(
      DESKTOP_OAUTH_CREDENTIAL_SERVICE,
      credentialAccount(provider, profile),
      signal,
    );
  }
}

async function revokeDesktopOAuthToken(
  bundle: DesktopOAuthTokenBundle,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<void> {
  try {
    if (bundle.provider === "google-drive") {
      await fetchImpl("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: bundle.accessToken }),
        signal: signal ?? AbortSignal.timeout(10_000),
      });
    } else if (bundle.provider === "dropbox") {
      await fetchImpl("https://api.dropboxapi.com/2/auth/token/revoke", {
        method: "POST",
        headers: { Authorization: `Bearer ${bundle.accessToken}` },
        signal: signal ?? AbortSignal.timeout(10_000),
      });
    }
  } catch {
    // Removing the local credential must remain possible when provider
    // revocation is unavailable. The provider token expires independently.
  }
}
