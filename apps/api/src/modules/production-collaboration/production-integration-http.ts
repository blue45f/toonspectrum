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
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maximumBytes) {
    throw new ProductionExternalHttpError(
      "external_response_too_large",
      response.status,
      response.status >= 500,
    );
  }
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
      signal: AbortSignal.timeout(timeoutMs),
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
