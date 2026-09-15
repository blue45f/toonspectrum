import { createHash } from "node:crypto";

import {
  GOOGLE_WORKSPACE_SCOPES,
  type ProductionIntegrationConfig,
} from "./production-integration-config";
import {
  buildGoogleRawMessage,
  type ProductionCalendarEvent,
} from "./production-integration-artifacts";
import {
  externalFetchJson,
  ProductionExternalHttpError,
} from "./production-integration-http";
import type {
  GoogleCredentialEnvelope,
} from "./production-integration-crypto";

interface GoogleTokenResponse {
  readonly access_token: string;
  readonly expires_in: number;
  readonly refresh_token?: string;
  readonly scope?: string;
  readonly token_type?: string;
}

interface GoogleUserInfo {
  readonly sub: string;
  readonly email?: string;
}

function requiredGoogleConfig(config: ProductionIntegrationConfig) {
  if (
    !config.google.configured
    || !config.google.clientId
    || !config.google.clientSecret
    || !config.google.redirectUri
  ) {
    throw new Error("google_workspace_not_configured");
  }
  return {
    clientId: config.google.clientId,
    clientSecret: config.google.clientSecret,
    redirectUri: config.google.redirectUri,
  };
}export function googleAuthorizationUrl(
  config: ProductionIntegrationConfig,
  state: string,
): string {
  const required = requiredGoogleConfig(config);
  const params = new URLSearchParams({
    client_id: required.clientId,
    redirect_uri: required.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_WORKSPACE_SCOPES.join(" "),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function credentialFromToken(
  token: GoogleTokenResponse,
  fallbackRefreshToken: string | null = null,
): GoogleCredentialEnvelope {
  if (!token.access_token || !Number.isFinite(token.expires_in)) {
    throw new Error("invalid_google_token_response");
  }
  return Object.freeze({
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? fallbackRefreshToken,
    expiresAt: new Date(
      Date.now() + Math.max(60, token.expires_in) * 1_000,
    ).toISOString(),
    tokenType: token.token_type ?? "Bearer",
    scope: token.scope ?? GOOGLE_WORKSPACE_SCOPES.join(" "),
  });
}

export async function exchangeGoogleAuthorizationCode(
  config: ProductionIntegrationConfig,
  code: string,
): Promise<GoogleCredentialEnvelope> {
  const required = requiredGoogleConfig(config);
  const body = new URLSearchParams({
    code,
    client_id: required.clientId,
    client_secret: required.clientSecret,
    redirect_uri: required.redirectUri,
    grant_type: "authorization_code",
  });
  const token = await externalFetchJson<GoogleTokenResponse>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
    config.timeoutMs,
  );
  return credentialFromToken(token);
}export async function refreshGoogleCredential(
  config: ProductionIntegrationConfig,
  credential: GoogleCredentialEnvelope,
): Promise<GoogleCredentialEnvelope> {
  if (Date.parse(credential.expiresAt) > Date.now() + 60_000) {
    return credential;
  }
  if (!credential.refreshToken) {
    throw new Error("google_refresh_token_missing");
  }
  const required = requiredGoogleConfig(config);
  const body = new URLSearchParams({
    client_id: required.clientId,
    client_secret: required.clientSecret,
    refresh_token: credential.refreshToken,
    grant_type: "refresh_token",
  });
  const token = await externalFetchJson<GoogleTokenResponse>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
    config.timeoutMs,
  );
  return credentialFromToken(token, credential.refreshToken);
}

export async function googleUserInfo(
  config: ProductionIntegrationConfig,
  credential: GoogleCredentialEnvelope,
): Promise<GoogleUserInfo> {
  return externalFetchJson<GoogleUserInfo>(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: {
        Authorization: `${credential.tokenType} ${credential.accessToken}`,
      },
    },
    config.timeoutMs,
  );
}

function googleCalendarEventId(projectId: string, key: string): string {
  return createHash("sha256")
    .update(`${projectId}:${key}`)
    .digest("hex")
    .slice(0, 40);
}

interface GoogleCalendarEventResponse {
  readonly id: string;
  readonly htmlLink?: string;
  readonly status?: string;
}async function writeGoogleCalendarEvent(input: {
  readonly config: ProductionIntegrationConfig;
  readonly credential: GoogleCredentialEnvelope;
  readonly projectId: string;
  readonly event: ProductionCalendarEvent;
}): Promise<GoogleCalendarEventResponse> {
  const id = googleCalendarEventId(input.projectId, input.event.key);
  const payload = {
    id,
    summary: input.event.title,
    description: `${input.event.description}\n\n${input.event.url}`,
    start: { dateTime: input.event.startsAt, timeZone: "UTC" },
    end: { dateTime: input.event.endsAt, timeZone: "UTC" },
    extendedProperties: {
      private: {
        toonspectrumProjectId: input.projectId,
        toonspectrumEventKey: input.event.key,
      },
    },
  };
  const headers = {
    Authorization: `${input.credential.tokenType} ${input.credential.accessToken}`,
    "Content-Type": "application/json",
  };
  try {
    return await externalFetchJson<GoogleCalendarEventResponse>(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      { method: "POST", headers, body: JSON.stringify(payload) },
      input.config.timeoutMs,
    );
  } catch (error) {
    if (!(error instanceof ProductionExternalHttpError)
      || error.status !== 409) throw error;
    return externalFetchJson<GoogleCalendarEventResponse>(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${id}`,
      { method: "PUT", headers, body: JSON.stringify(payload) },
      input.config.timeoutMs,
    );
  }
}

export async function syncGoogleCalendar(input: {
  readonly config: ProductionIntegrationConfig;
  readonly credential: GoogleCredentialEnvelope;
  readonly projectId: string;
  readonly events: readonly ProductionCalendarEvent[];
}) {
  const items: GoogleCalendarEventResponse[] = [];
  for (const event of input.events) {
    items.push(await writeGoogleCalendarEvent({ ...input, event }));
  }
  return Object.freeze({
    synced: items.length,
    events: Object.freeze(items),
  });
}interface GmailDraftResponse {
  readonly id: string;
  readonly message?: {
    readonly id?: string;
    readonly threadId?: string;
  };
}

export async function createGoogleGmailDraft(input: {
  readonly config: ProductionIntegrationConfig;
  readonly credential: GoogleCredentialEnvelope;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly subject: string;
  readonly body: string;
}): Promise<GmailDraftResponse> {
  const raw = buildGoogleRawMessage(input);
  return externalFetchJson<GmailDraftResponse>(
    "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
    {
      method: "POST",
      headers: {
        Authorization: `${input.credential.tokenType} ${input.credential.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: { raw } }),
    },
    input.config.timeoutMs,
  );
}

export interface GoogleDriveFileResponse {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly webViewLink?: string;
  readonly createdTime?: string;
  readonly modifiedTime?: string;
  readonly size?: string;
}

interface GoogleDriveFileListResponse {
  readonly files?: readonly GoogleDriveFileResponse[];
}

function driveAuthorizationHeaders(
  credential: GoogleCredentialEnvelope,
): Record<string, string> {
  return {
    Authorization: `${credential.tokenType} ${credential.accessToken}`,
  };
}

function escapeGoogleDriveQueryValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function googleDriveFileQuery(input: {
  readonly projectId: string;
  readonly artifact: string;
  readonly contentDigest?: string;
  readonly folderId?: string;
}): string {
  const projectId = escapeGoogleDriveQueryValue(input.projectId);
  const artifact = escapeGoogleDriveQueryValue(input.artifact);
  const predicates = [
    "trashed = false",
    `appProperties has { key='toonspectrumProjectId' and value='${projectId}' }`,
    `appProperties has { key='toonspectrumArtifact' and value='${artifact}' }`,
  ];
  if (input.contentDigest) {
    const contentDigest = escapeGoogleDriveQueryValue(input.contentDigest);
    predicates.push(
      `appProperties has { key='toonspectrumContentDigest' and value='${contentDigest}' }`,
    );
  }
  if (input.folderId) {
    predicates.push(`'${escapeGoogleDriveQueryValue(input.folderId)}' in parents`);
  }
  return predicates.join(" and ");
}

async function findGoogleDriveArtifact(input: {
  readonly config: ProductionIntegrationConfig;
  readonly credential: GoogleCredentialEnvelope;
  readonly projectId: string;
  readonly artifact: string;
  readonly contentDigest?: string;
  readonly folderId?: string;
}): Promise<GoogleDriveFileResponse | null> {
  const params = new URLSearchParams({
    q: googleDriveFileQuery(input),
    spaces: "drive",
    pageSize: "2",
    orderBy: "modifiedTime desc",
    fields: "files(id,name,mimeType,webViewLink,createdTime,modifiedTime,size)",
  });
  const response = await externalFetchJson<GoogleDriveFileListResponse>(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    { headers: driveAuthorizationHeaders(input.credential) },
    input.config.timeoutMs,
  );
  return response.files?.[0] ?? null;
}

function googleDriveMultipartBody(input: {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly sourceMimeType: string;
  readonly content: string;
  readonly boundary: string;
}): string {
  return [
    `--${input.boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(input.metadata),
    `--${input.boundary}`,
    `Content-Type: ${input.sourceMimeType}; charset=UTF-8`,
    "Content-Transfer-Encoding: binary",
    "",
    input.content,
    `--${input.boundary}--`,
    "",
  ].join("\r\n");
}

export async function uploadGoogleDriveArtifact(input: {
  readonly config: ProductionIntegrationConfig;
  readonly credential: GoogleCredentialEnvelope;
  readonly projectId: string;
  readonly artifact: string;
  readonly fileName: string;
  readonly sourceMimeType: string;
  readonly googleMimeType: string | null;
  readonly content: string;
  readonly folderId?: string;
}): Promise<GoogleDriveFileResponse & { readonly created: boolean }> {
  const byteLength = Buffer.byteLength(input.content, "utf8");
  if (byteLength < 1 || byteLength > 5 * 1_024 * 1_024) {
    throw new Error("google_drive_artifact_size_exceeded");
  }
  const contentDigest = `sha256:${createHash("sha256")
    .update(input.content, "utf8")
    .digest("hex")}`;
  const convertedWorkspaceFile = input.googleMimeType !== null;
  const existing = await findGoogleDriveArtifact({
    ...input,
    ...(convertedWorkspaceFile ? { contentDigest } : {}),
  });
  // Google Workspace conversion is create-only. Reuse the exact app-created
  // file when its content digest matches, but never overwrite a later Sheet.
  if (convertedWorkspaceFile && existing) {
    return Object.freeze({ ...existing, created: false });
  }
  const boundary = `toonspectrum_${createHash("sha256")
    .update(`${input.projectId}:${input.artifact}:${byteLength}`)
    .digest("hex")
    .slice(0, 24)}`;
  const metadata: Record<string, unknown> = {
    name: input.fileName,
    mimeType: input.googleMimeType ?? input.sourceMimeType,
    appProperties: {
      toonspectrumProjectId: input.projectId,
      toonspectrumArtifact: input.artifact,
      toonspectrumContentDigest: contentDigest,
    },
  };
  if (input.folderId && !existing) metadata.parents = [input.folderId];
  const fields = "id,name,mimeType,webViewLink,createdTime,modifiedTime,size";
  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing.id)}?uploadType=multipart&fields=${encodeURIComponent(fields)}`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${encodeURIComponent(fields)}`;
  const file = await externalFetchJson<GoogleDriveFileResponse>(
    url,
    {
      method: existing ? "PATCH" : "POST",
      headers: {
        ...driveAuthorizationHeaders(input.credential),
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: googleDriveMultipartBody({
        metadata,
        sourceMimeType: input.sourceMimeType,
        content: input.content,
        boundary,
      }),
    },
    input.config.timeoutMs,
  );
  if (!file.id || !file.name || !file.mimeType) {
    throw new Error("invalid_google_drive_file_response");
  }
  return Object.freeze({ ...file, created: existing === null });
}
