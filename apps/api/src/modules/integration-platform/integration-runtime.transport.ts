export type IntegrationRuntimeFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface IntegrationRuntimeHttpRequest {
  readonly url: string;
  readonly method?: "GET" | "POST" | "PUT" | "PATCH";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly allowedHosts: readonly string[];
  readonly timeoutMs?: number;
  readonly maximumResponseBytes?: number;
}

export interface IntegrationRuntimeHttpResponse {
  readonly status: number;
  readonly body: unknown;
  readonly contentType: string;
}

export class IntegrationRuntimeExternalError extends Error {
  constructor(
    readonly code: string,
    readonly status: number | null,
    readonly uncertain: boolean,
  ) {
    super(code);
    this.name = "IntegrationRuntimeExternalError";
  }
}

function hostAllowed(hostname: string, allowed: readonly string[]): boolean {
  const lower = hostname.toLowerCase();
  return allowed.some((candidate) => {
    const expected = candidate.toLowerCase();
    if (expected.startsWith(".")) {
      return lower.endsWith(expected) && lower.length > expected.length;
    }
    return lower === expected;
  });
}

function safeUrl(raw: string, allowedHosts: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new IntegrationRuntimeExternalError("external_url_invalid", null, false);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !hostAllowed(url.hostname, allowedHosts)
  ) {
    throw new IntegrationRuntimeExternalError("external_url_rejected", null, false);
  }
  return url;
}

async function boundedBody(
  response: Response,
  maximumBytes: number,
): Promise<unknown> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new IntegrationRuntimeExternalError(
      "external_response_too_large",
      response.status,
      true,
    );
  }
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > maximumBytes) {
        throw new IntegrationRuntimeExternalError(
          "external_response_too_large",
          response.status,
          true,
        );
      }
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof IntegrationRuntimeExternalError) throw error;
    throw new IntegrationRuntimeExternalError(
      "external_response_incomplete",
      response.status,
      true,
    );
  } finally {
    reader.releaseLock();
  }

  if (length === 0) return null;
  const text = Buffer.concat(chunks, length).toString("utf8");
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const firstCharacter = text.trimStart()[0];
  if (contentType.includes("json") || firstCharacter === "{" || firstCharacter === "[") {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new IntegrationRuntimeExternalError(
        "external_response_invalid_json",
        response.status,
        response.ok,
      );
    }
  }
  return text.slice(0, 16_384);
}

export class IntegrationRuntimeTransport {
  constructor(private readonly fetcher: IntegrationRuntimeFetch = fetch) {}

  async request(input: IntegrationRuntimeHttpRequest): Promise<IntegrationRuntimeHttpResponse> {
    const url = safeUrl(input.url, input.allowedHosts);
    const body = input.body;
    if (body !== undefined && Buffer.byteLength(body) > 131_072) {
      throw new IntegrationRuntimeExternalError("external_request_too_large", null, false);
    }

    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: input.method ?? "GET",
        headers: {
          Accept: "application/json, text/plain;q=0.8",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...input.headers,
        },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(input.timeoutMs ?? 15_000),
      });
    } catch (error) {
      throw new IntegrationRuntimeExternalError(
        error instanceof DOMException && error.name === "TimeoutError"
          ? "external_timeout"
          : "external_network_error",
        null,
        true,
      );
    }

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined);
      throw new IntegrationRuntimeExternalError(
        "external_redirect_blocked",
        response.status,
        true,
      );
    }

    const parsed = await boundedBody(
      response,
      input.maximumResponseBytes ?? 1_048_576,
    );
    if (!response.ok) {
      throw new IntegrationRuntimeExternalError(
        `external_http_${response.status}`,
        response.status,
        response.status === 408 || response.status === 409 || response.status === 425 ||
          response.status === 429 || response.status >= 500,
      );
    }
    return {
      status: response.status,
      body: parsed,
      contentType: response.headers.get("content-type") ?? "",
    };
  }
}
