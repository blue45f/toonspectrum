export const PERSONAL_CLOUD_PROVIDERS = [
  "google-drive",
  "dropbox",
  "onedrive",
] as const;

export type PersonalCloudProviderId = (typeof PERSONAL_CLOUD_PROVIDERS)[number];

export interface PersonalCloudTokenSet {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly tokenType: string;
  readonly scope: string;
  readonly expiresAt: Date;
}

export interface PersonalCloudAccountProfile {
  readonly providerAccountId: string;
  readonly accountLabel: string;
}

export interface PersonalCloudConnectionRecord {
  readonly userId: string;
  readonly provider: PersonalCloudProviderId;
  readonly providerAccountId: string;
  readonly accountLabel: string;
  readonly encryptedAccessToken: string;
  readonly encryptedRefreshToken: string;
  readonly tokenType: string;
  readonly scope: string;
  readonly accessTokenExpiresAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastUsedAt: Date | null;
}

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

export interface PersonalCloudOAuthCookiePayload {
  readonly version: 1;
  readonly provider: PersonalCloudProviderId;
  readonly userId: string;
  readonly nonce: string;
  readonly verifier: string;
  readonly returnTo: string;
  readonly issuedAt: number;
}

export interface PersonalCloudOAuthStatePayload {
  readonly version: 1;
  readonly provider: PersonalCloudProviderId;
  readonly userId: string;
  readonly nonce: string;
  readonly returnTo: string;
  readonly issuedAt: number;
}

export function isPersonalCloudProvider(value: string): value is PersonalCloudProviderId {
  return PERSONAL_CLOUD_PROVIDERS.includes(value as PersonalCloudProviderId);
}

export function maskPersonalCloudAccountLabel(value: string): string {
  const clean = value.trim().slice(0, 320);
  const at = clean.indexOf("@");
  if (at > 0) {
    const local = clean.slice(0, at);
    const domain = clean.slice(at + 1);
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}${"*".repeat(Math.max(3, Math.min(8, local.length - visible.length)))}@${domain}`;
  }
  if (clean.length <= 4) return `${clean.slice(0, 1)}***`;
  return `${clean.slice(0, 2)}${"*".repeat(Math.min(8, clean.length - 4))}${clean.slice(-2)}`;
}
