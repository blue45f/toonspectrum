import type { PersonalCloudProviderId } from "./personal-cloud.types";

export interface PersonalCloudProviderConfig {
  readonly id: PersonalCloudProviderId;
  readonly label: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly accountUrl: string;
  readonly scopes: readonly string[];
  readonly redirectUri: string;
  readonly configured: boolean;
  readonly reason: string | null;
}

export interface PersonalCloudRuntimeConfig {
  readonly provider: PersonalCloudProviderConfig;
  readonly webAppBaseUrl: string;
  readonly stateSecret: string;
  readonly tokenEncryptionSecret: string;
}

type EnvLike = Partial<Record<string, string | undefined>>;

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

function exactOrigin(value: string, fallback: string): string {
  const candidate = value || fallback;
  try {
    const parsed = new URL(candidate);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return fallback;
    if (parsed.pathname !== "/" && parsed.pathname !== "") return fallback;
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) {
      return fallback;
    }
    return parsed.origin;
  } catch {
    return fallback;
  }
}

function googleCredentials(env: EnvLike): { readonly clientId: string; readonly clientSecret: string } {
  return {
    clientId: clean(env.GOOGLE_DRIVE_OAUTH_CLIENT_ID) || clean(env.GOOGLE_OAUTH_CLIENT_ID),
    clientSecret: clean(env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET) || clean(env.GOOGLE_OAUTH_CLIENT_SECRET),
  };
}

function providerCredentials(
  provider: PersonalCloudProviderId,
  env: EnvLike,
): { readonly clientId: string; readonly clientSecret: string } {
  if (provider === "google-drive") return googleCredentials(env);
  if (provider === "dropbox") {
    return {
      clientId: clean(env.DROPBOX_OAUTH_CLIENT_ID),
      clientSecret: clean(env.DROPBOX_OAUTH_CLIENT_SECRET),
    };
  }
  return {
    clientId: clean(env.ONEDRIVE_OAUTH_CLIENT_ID),
    clientSecret: clean(env.ONEDRIVE_OAUTH_CLIENT_SECRET),
  };
}

function providerEndpoints(provider: PersonalCloudProviderId, env: EnvLike) {
  if (provider === "google-drive") {
    return {
      label: "Google Drive",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      accountUrl: "https://openidconnect.googleapis.com/v1/userinfo",
      scopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/drive.file",
      ],
    } as const;
  }
  if (provider === "dropbox") {
    return {
      label: "Dropbox",
      authorizeUrl: "https://www.dropbox.com/oauth2/authorize",
      tokenUrl: "https://api.dropboxapi.com/oauth2/token",
      accountUrl: "https://api.dropboxapi.com/2/users/get_current_account",
      scopes: ["account_info.read", "files.content.read", "files.content.write"],
    } as const;
  }
  const tenant = clean(env.ONEDRIVE_OAUTH_TENANT) || "common";
  const safeTenant = /^(?:common|consumers|organizations|[0-9a-f-]{36})$/iu.test(tenant)
    ? tenant
    : "common";
  return {
    label: "OneDrive",
    authorizeUrl: `https://login.microsoftonline.com/${safeTenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${safeTenant}/oauth2/v2.0/token`,
    accountUrl: "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName",
    scopes: ["openid", "profile", "email", "offline_access", "Files.ReadWrite.AppFolder", "User.Read"],
  } as const;
}

export function personalCloudProviderConfig(
  provider: PersonalCloudProviderId,
  env: EnvLike = process.env,
): PersonalCloudProviderConfig {
  const credentials = providerCredentials(provider, env);
  const endpoints = providerEndpoints(provider, env);
  const redirectBase = exactOrigin(
    clean(env.PERSONAL_CLOUD_OAUTH_REDIRECT_BASE_URL) || clean(env.OAUTH_REDIRECT_BASE_URL),
    "http://localhost:4001",
  );
  const stateSecret = clean(env.PERSONAL_CLOUD_OAUTH_STATE_SECRET) || clean(env.AUTH_STATE_SECRET);
  const tokenSecret = clean(env.PERSONAL_CLOUD_TOKEN_ENCRYPTION_KEY);
  const missing: string[] = [];
  if (!credentials.clientId) missing.push("client-id");
  if (!credentials.clientSecret) missing.push("client-secret");
  if (Buffer.byteLength(stateSecret, "utf8") < 32) missing.push("state-secret");
  if (Buffer.byteLength(tokenSecret, "utf8") < 32) missing.push("token-encryption-key");
  return Object.freeze({
    id: provider,
    label: endpoints.label,
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    authorizeUrl: endpoints.authorizeUrl,
    tokenUrl: endpoints.tokenUrl,
    accountUrl: endpoints.accountUrl,
    scopes: Object.freeze([...endpoints.scopes]),
    redirectUri: `${redirectBase}/api/personal-cloud/oauth/${provider}/callback`,
    configured: missing.length === 0,
    reason: missing.length === 0 ? null : `missing-${missing.join("+")}`,
  });
}

export function personalCloudRuntimeConfig(
  provider: PersonalCloudProviderId,
  env: EnvLike = process.env,
): PersonalCloudRuntimeConfig {
  const providerConfig = personalCloudProviderConfig(provider, env);
  return Object.freeze({
    provider: providerConfig,
    webAppBaseUrl: exactOrigin(clean(env.WEB_APP_BASE_URL), "http://localhost:5173"),
    stateSecret: clean(env.PERSONAL_CLOUD_OAUTH_STATE_SECRET) || clean(env.AUTH_STATE_SECRET),
    tokenEncryptionSecret: clean(env.PERSONAL_CLOUD_TOKEN_ENCRYPTION_KEY),
  });
}

export function personalCloudOAuthCookieName(): string {
  return "toonspectrum.personal-cloud-oauth.v1";
}
