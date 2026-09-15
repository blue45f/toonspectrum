import type { PersonalCloudProviderConfig } from "./personal-cloud.config";
import type {
  PersonalCloudAccountProfile,
  PersonalCloudProviderId,
  PersonalCloudTokenSet,
} from "./personal-cloud.types";

export type PersonalCloudFetch = typeof fetch;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveSeconds(value: unknown, fallback = 3_600): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(86_400, Math.floor(parsed)) : fallback;
}

async function responseJson(response: Response): Promise<JsonRecord> {
  const text = await response.text();
  if (text.length > 256 * 1024) throw new Error("personal cloud provider response is too large");
  if (!text) return {};
  try {
    return record(JSON.parse(text));
  } catch {
    throw new Error(`personal cloud provider returned invalid JSON (${response.status})`);
  }
}

async function checkedJson(response: Response, operation: string): Promise<JsonRecord> {
  const body = await responseJson(response);
  if (!response.ok) {
    const nested = record(body.error);
    const message = stringValue(body.error_description)
      || stringValue(body.error_summary)
      || stringValue(nested.message)
      || stringValue(body.message)
      || `${operation} failed (${response.status})`;
    throw new Error(message.slice(0, 400));
  }
  return body;
}

export function buildPersonalCloudAuthorizeUrl(
  config: PersonalCloudProviderConfig,
  input: { readonly state: string; readonly challenge: string },
): string {
  if (!config.configured) throw new Error("personal cloud provider is not configured");
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
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

function tokenRequestBody(
  config: PersonalCloudProviderConfig,
  values: Readonly<Record<string, string>>,
): URLSearchParams {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...values,
  });
  if (config.id === "dropbox") {
    body.set("client_id", config.clientId);
    body.set("client_secret", config.clientSecret);
  }
  return body;
}

function tokenSet(body: JsonRecord, fallbackRefreshToken: string | null = null): PersonalCloudTokenSet {
  const accessToken = stringValue(body.access_token);
  const refreshToken = stringValue(body.refresh_token) || fallbackRefreshToken;
  if (!accessToken) throw new Error("personal cloud provider did not return an access token");
  return Object.freeze({
    accessToken,
    refreshToken,
    tokenType: stringValue(body.token_type) || "Bearer",
    scope: stringValue(body.scope),
    expiresAt: new Date(Date.now() + positiveSeconds(body.expires_in) * 1_000),
  });
}

export async function exchangePersonalCloudCode(
  config: PersonalCloudProviderConfig,
  input: { readonly code: string; readonly verifier: string },
  fetchImpl: PersonalCloudFetch = fetch,
): Promise<PersonalCloudTokenSet> {
  const response = await fetchImpl(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: tokenRequestBody(config, {
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.verifier,
      redirect_uri: config.redirectUri,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const tokens = tokenSet(await checkedJson(response, "OAuth token exchange"));
  if (!tokens.refreshToken) {
    throw new Error("offline access was not granted; reconnect the personal cloud account");
  }
  return tokens;
}

export async function refreshPersonalCloudToken(
  config: PersonalCloudProviderConfig,
  refreshToken: string,
  fetchImpl: PersonalCloudFetch = fetch,
): Promise<PersonalCloudTokenSet> {
  const response = await fetchImpl(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: tokenRequestBody(config, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      ...(config.id === "onedrive" ? { scope: config.scopes.join(" ") } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  return tokenSet(await checkedJson(response, "OAuth token refresh"), refreshToken);
}

export async function fetchPersonalCloudAccountProfile(
  config: PersonalCloudProviderConfig,
  accessToken: string,
  fetchImpl: PersonalCloudFetch = fetch,
): Promise<PersonalCloudAccountProfile> {
  const response = await fetchImpl(config.accountUrl, {
    method: config.id === "dropbox" ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(config.id === "dropbox" ? { "Content-Type": "application/json" } : {}),
    },
    ...(config.id === "dropbox" ? { body: "null" } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await checkedJson(response, "personal cloud account lookup");
  if (config.id === "google-drive") {
    const id = stringValue(body.sub);
    const email = stringValue(body.email);
    if (!id || !email) throw new Error("Google account profile is incomplete");
    return Object.freeze({ providerAccountId: id, accountLabel: email });
  }
  if (config.id === "dropbox") {
    const id = stringValue(body.account_id);
    const email = stringValue(body.email);
    const name = stringValue(record(body.name).display_name);
    if (!id || !(email || name)) throw new Error("Dropbox account profile is incomplete");
    return Object.freeze({ providerAccountId: id, accountLabel: email || name });
  }
  const id = stringValue(body.id);
  const label = stringValue(body.mail) || stringValue(body.userPrincipalName) || stringValue(body.displayName);
  if (!id || !label) throw new Error("OneDrive account profile is incomplete");
  return Object.freeze({ providerAccountId: id, accountLabel: label });
}

export async function revokePersonalCloudToken(
  provider: PersonalCloudProviderId,
  accessToken: string,
  fetchImpl: PersonalCloudFetch = fetch,
): Promise<void> {
  try {
    if (provider === "google-drive") {
      await fetchImpl(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(8_000),
      });
    } else if (provider === "dropbox") {
      await fetchImpl("https://api.dropboxapi.com/2/auth/token/revoke", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8_000),
      });
    }
  } catch {
    // Local disconnection must still complete when a provider revoke endpoint is unavailable.
  }
}
