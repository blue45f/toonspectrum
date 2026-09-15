import { createHash } from "node:crypto";

export type AuthEmailPurpose = "verify-email" | "reset-password";

export interface AuthEmailConfig {
  readonly provider: "disabled" | "resend";
  readonly apiKey?: string;
  readonly from?: string;
  readonly replyTo?: string;
  readonly webAppBaseUrl: string;
}

type AuthEmailEnvironment = Partial<Record<
  | "AUTH_EMAIL_PROVIDER"
  | "AUTH_EMAIL_FROM"
  | "AUTH_EMAIL_REPLY_TO"
  | "RESEND_API_KEY"
  | "WEB_APP_BASE_URL",
  string | undefined
>>;

export class AuthEmailConfigurationError extends Error {
  constructor() {
    super("authentication email delivery is not configured");
    this.name = "AuthEmailConfigurationError";
  }
}

export class AuthEmailDeliveryError extends Error {
  constructor(readonly status: number | null = null) {
    super("authentication email delivery failed");
    this.name = "AuthEmailDeliveryError";
  }
}
function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function resolveAuthEmailConfig(
  environment: AuthEmailEnvironment = process.env,
): AuthEmailConfig {
  const apiKey = optional(environment.RESEND_API_KEY);
  const from = optional(environment.AUTH_EMAIL_FROM);
  const selected = optional(environment.AUTH_EMAIL_PROVIDER)
    ?? (apiKey || from ? "resend" : "disabled");
  if (selected !== "disabled" && selected !== "resend") {
    throw new AuthEmailConfigurationError();
  }
  const webAppBaseUrl = (
    optional(environment.WEB_APP_BASE_URL) ?? "http://localhost:5173"
  ).replace(/\/$/u, "");
  if (
    selected === "resend"
    && (!apiKey || !from || !/^https?:\/\//u.test(webAppBaseUrl))
  ) {
    throw new AuthEmailConfigurationError();
  }
  return {
    provider: selected,
    webAppBaseUrl,
    ...(apiKey ? { apiKey } : {}),
    ...(from ? { from } : {}),
    ...(optional(environment.AUTH_EMAIL_REPLY_TO)
      ? { replyTo: optional(environment.AUTH_EMAIL_REPLY_TO) }
      : {}),
  };
}
export function isAuthEmailDeliveryConfigured(
  environment: AuthEmailEnvironment = process.env,
): boolean {
  try {
    return resolveAuthEmailConfig(environment).provider === "resend";
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function authEmailContent(
  purpose: AuthEmailPurpose,
  token: string,
  config: AuthEmailConfig,
) {
  const verify = purpose === "verify-email";
  const route = verify ? "/auth/verify-email" : "/auth/reset-password";
  const link = `${config.webAppBaseUrl}${route}?token=${encodeURIComponent(token)}`;
  const heading = verify ? "이메일 주소 확인" : "비밀번호 재설정";
  const instruction = verify
    ? "아래 버튼을 눌러 이메일 주소를 확인하면 가입이 완료됩니다."
    : "아래 버튼을 눌러 새 비밀번호를 설정해 주세요.";
  const expiry = verify ? "30분" : "20분";
  return { verify, link, heading, instruction, expiry };
}
export async function sendAuthEmail(
  input: {
    readonly purpose: AuthEmailPurpose;
    readonly to: string;
    readonly token: string;
  },
  options: {
    readonly environment?: AuthEmailEnvironment;
    readonly fetchImpl?: typeof fetch;
  } = {},
): Promise<{ readonly providerMessageId: string }> {
  const config = resolveAuthEmailConfig(options.environment);
  if (config.provider !== "resend" || !config.apiKey || !config.from) {
    throw new AuthEmailConfigurationError();
  }
  const content = authEmailContent(input.purpose, input.token, config);
  const subject = content.verify
    ? "[ToonStudio] 이메일 주소를 확인해 주세요"
    : "[ToonStudio] 비밀번호를 재설정해 주세요";
  const text = [
    content.heading,
    "",
    content.instruction,
    content.link,
    "",
    `이 링크는 ${content.expiry} 동안 한 번만 사용할 수 있습니다.`,
    "본인이 요청하지 않았다면 이 메일을 무시해 주세요.",
  ].join("\n");
  const safeLink = escapeHtml(content.link);
  const html = `<!doctype html><html lang="ko"><body style="margin:0;background:#f6f5f2;color:#211f1c;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><div style="max-width:560px;margin:0 auto;padding:40px 20px"><div style="background:#fff;border:1px solid #dedbd5;border-radius:18px;padding:32px"><p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#e4542f">TOONSTUDIO</p><h1 style="margin:0 0 18px;font-size:24px">${content.heading}</h1><p style="margin:0 0 24px;line-height:1.7">${content.instruction}</p><p style="margin:0 0 24px"><a href="${safeLink}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#e4542f;color:#fff;text-decoration:none;font-weight:700">${content.heading}</a></p><p style="margin:0;color:#6b665f;font-size:13px;line-height:1.7">이 링크는 ${content.expiry} 동안 한 번만 사용할 수 있습니다.<br>본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p></div></div></body></html>`;
  const idempotencyKey = `auth-${input.purpose}-${createHash("sha256")
    .update(input.token, "utf8")
    .digest("hex")}`.slice(0, 256);
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: config.from,
        to: [input.to],
        subject,
        text,
        html,
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
        tags: [{ name: "category", value: input.purpose.replaceAll("-", "_") }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AuthEmailDeliveryError();
  }
  if (!response.ok) throw new AuthEmailDeliveryError(response.status);
  const payload = await response.json().catch(() => null) as {
    id?: unknown;
  } | null;
  if (!payload || typeof payload.id !== "string" || !payload.id) {
    throw new AuthEmailDeliveryError(response.status);
  }
  return { providerMessageId: payload.id };
}
