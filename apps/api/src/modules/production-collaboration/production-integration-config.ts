export const GOOGLE_WORKSPACE_SCOPES = Object.freeze([
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/drive.file",
]);

export type ProductionIntegrationCostPolicy =
  | "zero-cost-only"
  | "explicit-cost-enabled";

export interface ProductionIntegrationDailyLimits {
  readonly googleCalendarSyncs: number;
  readonly gmailDrafts: number;
  readonly googleDriveUploads: number;
  readonly notifications: number;
  readonly documensoEnvelopes: number;
}

export interface ProductionIntegrationConfig {
  readonly publicOrigin: string | null;
  readonly timeoutMs: number;
  readonly costPolicy: ProductionIntegrationCostPolicy;
  readonly zeroCostOnly: boolean;
  readonly dailyLimits: ProductionIntegrationDailyLimits;
  readonly google: {
    readonly configured: boolean;
    readonly clientId: string | null;
    readonly clientSecret: string | null;
    readonly redirectUri: string | null;
    readonly encryptionKey: Buffer | null;
  };
  readonly documenso: {
    readonly configured: boolean;
    readonly baseUrl: string | null;
    readonly apiToken: string | null;
    readonly selfHosted: boolean;
    readonly hostedAllowed: boolean;
  };
  readonly toss: {
    readonly configured: boolean;
    readonly apiBaseUrl: string;
    readonly secretKey: string | null;
    readonly testMode: boolean;
    readonly liveAllowed: boolean;
  };
  readonly notification: {
    readonly genericWebhookUrl: string | null;
    readonly genericWebhookSecret: string | null;
    readonly discordWebhookUrl: string | null;
    readonly ntfyBaseUrl: string | null;
    readonly ntfyTopic: string | null;
    readonly ntfyToken: string | null;
    readonly vapidSubject: string | null;
    readonly vapidPublicKey: string | null;
    readonly vapidPrivateKey: string | null;
  };
}

type EnvLike = Partial<Record<string, string | undefined>>;

function trimmed(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const normalized = trimmed(value);
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

function loopbackHostname(hostname: string): boolean {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "[::1]";
}

export function safeExternalBaseUrl(
  raw: string | null,
  options: { readonly allowLoopback?: boolean } = {},
): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const secure = url.protocol === "https:";
  const allowedLoopback = options.allowLoopback === true
    && url.protocol === "http:"
    && loopbackHostname(url.hostname);
  if (!secure && !allowedLoopback) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString().replace(/\/$/u, "");
}

function encryptionKey(raw: string | null): Buffer | null {
  if (!raw) return null;
  try {
    const key = Buffer.from(raw, "base64");
    return key.byteLength === 32 ? key : null;
  } catch {
    return null;
  }
}

function resolveCostPolicy(env: EnvLike): ProductionIntegrationCostPolicy {
  return env.PRODUCTION_INTEGRATION_COST_POLICY === "explicit-cost-enabled"
    ? "explicit-cost-enabled"
    : "zero-cost-only";
}

export function resolveProductionIntegrationConfig(
  env: EnvLike = process.env,
): ProductionIntegrationConfig {
  const production = env.NODE_ENV === "production";
  const costPolicy = resolveCostPolicy(env);
  const publicOrigin = safeExternalBaseUrl(
    trimmed(env.PRODUCTION_PUBLIC_ORIGIN),
    { allowLoopback: !production },
  );
  const googleClientId = trimmed(env.PRODUCTION_GOOGLE_OAUTH_CLIENT_ID);
  const googleClientSecret = trimmed(env.PRODUCTION_GOOGLE_OAUTH_CLIENT_SECRET);
  const googleRedirectUri = safeExternalBaseUrl(
    trimmed(env.PRODUCTION_GOOGLE_OAUTH_REDIRECT_URI),
    { allowLoopback: !production },
  );
  const googleEncryptionKey = encryptionKey(
    trimmed(env.PRODUCTION_INTEGRATION_ENCRYPTION_KEY),
  );
  const documensoBaseUrl = safeExternalBaseUrl(
    trimmed(env.DOCUMENSO_BASE_URL)
      ?? "https://app.documenso.com/api/v2",
    { allowLoopback: !production },
  );
  const documensoToken = trimmed(env.DOCUMENSO_API_TOKEN);
  const documensoSelfHosted = Boolean(
    documensoBaseUrl
    && !documensoBaseUrl.startsWith("https://app.documenso.com/"),
  );
  const documensoHostedAllowed = documensoSelfHosted
    || (
      costPolicy === "explicit-cost-enabled"
      && env.PRODUCTION_DOCUMENSO_ALLOW_HOSTED === "true"
    );
  const tossSecretKey = trimmed(env.TOSS_PAYMENTS_SECRET_KEY);
  const ntfyBaseUrl = safeExternalBaseUrl(
    trimmed(env.PRODUCTION_NTFY_BASE_URL),
    { allowLoopback: !production },
  );
  const genericWebhookUrl = safeExternalBaseUrl(
    trimmed(env.PRODUCTION_GENERIC_WEBHOOK_URL),
    { allowLoopback: !production },
  );
  const discordWebhookUrl = safeExternalBaseUrl(
    trimmed(env.PRODUCTION_DISCORD_WEBHOOK_URL),
    { allowLoopback: !production },
  );

  return Object.freeze({
    publicOrigin,
    timeoutMs: boundedInteger(
      env.PRODUCTION_INTEGRATION_TIMEOUT_MS,
      15_000,
      1_000,
      60_000,
    ),
    costPolicy,
    zeroCostOnly: costPolicy === "zero-cost-only",
    dailyLimits: Object.freeze({
      googleCalendarSyncs: boundedInteger(
        env.PRODUCTION_DAILY_GOOGLE_CALENDAR_SYNCS,
        20,
        0,
        1_000,
      ),
      gmailDrafts: boundedInteger(
        env.PRODUCTION_DAILY_GMAIL_DRAFTS,
        100,
        0,
        10_000,
      ),
      googleDriveUploads: boundedInteger(
        env.PRODUCTION_DAILY_GOOGLE_DRIVE_UPLOADS,
        50,
        0,
        10_000,
      ),
      notifications: boundedInteger(
        env.PRODUCTION_DAILY_NOTIFICATIONS,
        200,
        0,
        10_000,
      ),
      documensoEnvelopes: boundedInteger(
        env.PRODUCTION_DAILY_DOCUMENSO_ENVELOPES,
        20,
        0,
        1_000,
      ),
    }),
    google: Object.freeze({
      configured: Boolean(
        googleClientId
        && googleClientSecret
        && googleRedirectUri
        && googleEncryptionKey,
      ),
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      redirectUri: googleRedirectUri,
      encryptionKey: googleEncryptionKey,
    }),
    documenso: Object.freeze({
      configured: Boolean(
        documensoBaseUrl
        && documensoToken
        && documensoHostedAllowed,
      ),
      baseUrl: documensoBaseUrl,
      apiToken: documensoToken,
      selfHosted: documensoSelfHosted,
      hostedAllowed: documensoHostedAllowed,
    }),
    toss: Object.freeze({
      configured: Boolean(tossSecretKey),
      apiBaseUrl: safeExternalBaseUrl(
        trimmed(env.TOSS_PAYMENTS_API_BASE_URL)
          ?? "https://api.tosspayments.com",
      ) ?? "https://api.tosspayments.com",
      secretKey: tossSecretKey,
      testMode: Boolean(tossSecretKey?.startsWith("test_")),
      liveAllowed: costPolicy === "explicit-cost-enabled"
        && env.PRODUCTION_TOSS_ALLOW_LIVE === "true",
    }),
    notification: Object.freeze({
      genericWebhookUrl,
      genericWebhookSecret: trimmed(
        env.PRODUCTION_GENERIC_WEBHOOK_SECRET,
      ),
      discordWebhookUrl,
      ntfyBaseUrl,
      ntfyTopic: trimmed(env.PRODUCTION_NTFY_TOPIC),
      ntfyToken: trimmed(env.PRODUCTION_NTFY_TOKEN),
      vapidSubject: trimmed(env.PRODUCTION_WEB_PUSH_VAPID_SUBJECT),
      vapidPublicKey: trimmed(env.PRODUCTION_WEB_PUSH_VAPID_PUBLIC_KEY),
      vapidPrivateKey: trimmed(env.PRODUCTION_WEB_PUSH_VAPID_PRIVATE_KEY),
    }),
  });
}
