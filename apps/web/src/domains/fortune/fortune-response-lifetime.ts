import { fortuneKstDate } from "@toonspectrum/core/fortune";

interface ExternalLifetime {
  kind: "calendar" | "horoscope" | "special-days";
  checkedAt?: string;
  expiresAt?: string;
  referenceDate?: string;
}
/** Legacy responses may omit expiry, but must still obey the same maximum TTL. */
export function validatedFortuneExpiry(value: ExternalLifetime, now = Date.now()): string {
  const checked = Date.parse(value.checkedAt ?? "");
  if (!Number.isFinite(checked) || checked > now + 300000) throw new Error("invalid-source-time");
  let maximum = checked + (value.kind === "horoscope" ? 3600000 : 86400000);
  if (value.kind === "horoscope") {
    if (value.referenceDate !== fortuneKstDate(new Date(now))) throw new Error("expired-source-day");
    maximum = Math.min(maximum, Date.parse(`${value.referenceDate}T00:00:00+09:00`) + 86400000);
  }
  const expires = value.expiresAt === undefined ? maximum : Date.parse(value.expiresAt);
  if (!Number.isFinite(expires) || expires <= checked || expires <= now || expires > maximum) throw new Error("invalid-source-expiry");
  return new Date(expires).toISOString();
}

export const FORTUNE_RESPONSE_BYTE_LIMIT = 65536;
export async function readFortuneResponse(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.ok || response.redirected || !response.body || Number(response.headers.get("content-length")) > FORTUNE_RESPONSE_BYTE_LIMIT) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("fortune-response-rejected");
  }
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0, text = "";
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > FORTUNE_RESPONSE_BYTE_LIMIT) throw new Error("fortune-response-too-large");
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally {
    signal.removeEventListener("abort", cancel); cancel(); reader.releaseLock();
  }
}
