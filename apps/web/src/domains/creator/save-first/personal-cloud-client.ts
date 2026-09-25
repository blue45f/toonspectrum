import { api, getApiErrorMessage } from "@/platform/api";

export const PERSONAL_CLOUD_PROVIDER_IDS = [
  "google-drive",
  "dropbox",
  "onedrive",
] as const;

export type PersonalCloudProviderId = (typeof PERSONAL_CLOUD_PROVIDER_IDS)[number];

export interface PersonalCloudConnectionStatus {
  readonly provider: PersonalCloudProviderId;
  readonly label: string;
  readonly configured: boolean;
  readonly connected: boolean;
  readonly reason: string | null;
  readonly accountLabel: string | null;
  readonly scope: readonly string[];
  readonly accessTokenExpiresAt: string | null;
  readonly updatedAt: string | null;
  readonly lastUsedAt: string | null;
}

export interface PersonalCloudAccessToken {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly expiresAt: string;
  readonly scope: readonly string[];
  readonly accountLabel: string;
}
interface PersonalCloudStartResponse {
  readonly authorizeUrl: string;
  readonly expiresInMs: number;
}

function isProvider(value: unknown): value is PersonalCloudProviderId {
  return typeof value === "string"
    && PERSONAL_CLOUD_PROVIDER_IDS.includes(value as PersonalCloudProviderId);
}

function normalizedStatus(value: unknown): PersonalCloudConnectionStatus | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PersonalCloudConnectionStatus>;
  if (!isProvider(candidate.provider) || typeof candidate.label !== "string") return null;
  return Object.freeze({
    provider: candidate.provider,
    label: candidate.label.slice(0, 120),
    configured: candidate.configured === true,
    connected: candidate.connected === true,
    reason: typeof candidate.reason === "string" ? candidate.reason.slice(0, 240) : null,
    accountLabel: typeof candidate.accountLabel === "string"
      ? candidate.accountLabel.slice(0, 320)
      : null,
    scope: Object.freeze(Array.isArray(candidate.scope)
      ? candidate.scope.filter((entry): entry is string => typeof entry === "string").slice(0, 32)
      : []),
    accessTokenExpiresAt: typeof candidate.accessTokenExpiresAt === "string"
      ? candidate.accessTokenExpiresAt
      : null,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : null,
    lastUsedAt: typeof candidate.lastUsedAt === "string" ? candidate.lastUsedAt : null,
  });
}

export async function listPersonalCloudConnections(): Promise<readonly PersonalCloudConnectionStatus[]> {
  const body = await api.get<unknown>("/personal-cloud/status");
  if (!Array.isArray(body)) {
    throw new Error("개인 저장소 연결 상태를 해석하지 못했습니다.");
  }
  return Object.freeze(body.map(normalizedStatus).filter(
    (entry): entry is PersonalCloudConnectionStatus => entry !== null,
  ));
}

export async function startPersonalCloudConnection(
  provider: PersonalCloudProviderId,
  returnTo = "/studio?view=storage",
): Promise<PersonalCloudStartResponse> {
  try {
    const body = await api.post<PersonalCloudStartResponse>(
      `/personal-cloud/oauth/${provider}/start`,
      { returnTo },
    );
    const url = new URL(body.authorizeUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      throw new Error("개인 저장소 인증 주소가 안전하지 않습니다.");
    }
    return Object.freeze({
      authorizeUrl: url.toString(),
      expiresInMs: Number.isFinite(body.expiresInMs)
        ? Math.max(0, body.expiresInMs)
        : 0,
    });
  } catch (error) {
    throw new Error(
      await getApiErrorMessage(error, "개인 저장소 연결을 시작하지 못했습니다."),
      { cause: error },
    );
  }
}

export async function getPersonalCloudAccessToken(
  provider: PersonalCloudProviderId,
): Promise<PersonalCloudAccessToken> {
  try {
    const body = await api.post<PersonalCloudAccessToken>(
      `/personal-cloud/${provider}/access-token`,
    );
    if (!body.accessToken || !body.expiresAt) {
      throw new Error("개인 저장소 접근 권한을 받지 못했습니다.");
    }
    return Object.freeze({
      accessToken: body.accessToken,
      tokenType: body.tokenType || "Bearer",
      expiresAt: body.expiresAt,
      scope: Object.freeze(Array.isArray(body.scope) ? body.scope : []),
      accountLabel: body.accountLabel || "",
    });
  } catch (error) {
    throw new Error(
      await getApiErrorMessage(error, "개인 저장소 접근 권한을 받지 못했습니다."),
      { cause: error },
    );
  }
}

export async function disconnectPersonalCloud(
  provider: PersonalCloudProviderId,
): Promise<boolean> {
  try {
    const body = await api.delete<{ readonly disconnected?: unknown }>(
      `/personal-cloud/${provider}`,
    );
    return body.disconnected === true;
  } catch (error) {
    throw new Error(
      await getApiErrorMessage(error, "개인 저장소 연결을 해제하지 못했습니다."),
      { cause: error },
    );
  }
}
