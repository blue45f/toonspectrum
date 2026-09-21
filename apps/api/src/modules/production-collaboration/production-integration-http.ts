import { createHmac } from "node:crypto";

export class ProductionExternalHttpError extends Error {
  constructor(
    readonly code: string,
    readonly status: number | null,
    readonly uncertain: boolean,
    readonly responseBody: unknown = null,
  ) {
    super(code);
    this.name = "ProductionExternalHttpError";
  }
}

async function boundedResponseBody(
  response: Response,
  maximumBytes = 1_048_576,
): Promise<unknown> {
  if (!response.body) return null;
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  const declared = Number(response.headers.get("content-length") ?? 0);
  try {
    if (!Number.isFinite(declared) || declared < 0 || declared > maximumBytes) throw new ProductionExternalHttpError("external_response_too_large", response.status, true);
    while (true) {
      const part = await reader.read(); if (part.done) break;
      length += part.value.byteLength;
      if (length > maximumBytes) throw new ProductionExternalHttpError("external_response_too_large", response.status, true);
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof ProductionExternalHttpError) throw error;
    throw new ProductionExternalHttpError("external_response_incomplete", response.status, true);
  } finally { reader.releaseLock(); }
  const buffer = Buffer.concat(chunks, length);
  if (buffer.byteLength === 0) return null;
  const text = buffer.toString("utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text: text.slice(0, 4_096) };
  }
}

export async function externalFetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: "manual",
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new ProductionExternalHttpError(
      error instanceof DOMException && error.name === "TimeoutError"
        ? "external_timeout"
        : "external_network_error",
      null,
      true,
    );
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => undefined);
    throw new ProductionExternalHttpError("external_redirect_blocked", response.status, true);
  }
  const body = await boundedResponseBody(response);
  if (!response.ok) {
    throw new ProductionExternalHttpError(
      `external_http_${response.status}`,
      response.status,
      response.status >= 500 || response.status === 429,
      body,
    );
  }
  return body as T;
}

export function webhookSignature(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}
