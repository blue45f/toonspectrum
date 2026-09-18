import { createHash } from "node:crypto";

import {
  DesktopCloudError,
  type DesktopCloudProviderId,
} from "./types.js";

import type { DesktopCloudAccessTokenSource } from "../oauth.js";

export interface DesktopCloudHttpOptions {
  readonly provider: DesktopCloudProviderId;
  readonly accessToken: string | DesktopCloudAccessTokenSource;
  readonly fetchImpl?: typeof fetch;
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function normalizeCloudRelativePath(value: string): string {
  const normalized = value
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .join("/");
  if (
    !normalized
    || normalized === "."
    || normalized.startsWith("../")
    || normalized.includes("/../")
    || normalized.includes("\u0000")
  ) {
    throw new TypeError(`invalid cloud relative path: ${value}`);
  }
  return normalized;
}

export function cloudPathSegments(value: string): readonly string[] {
  return normalizeCloudRelativePath(value).split("/");
}

export function asciiJsonHeader(value: unknown): string {
  return JSON.stringify(value).replace(/[^\x20-\x7e]/gu, (character) => {
    const point = character.codePointAt(0) ?? 0;
    return `\\u${point.toString(16).padStart(4, "0")}`;
  });
}

async function boundedText(response: Response): Promise<string> {
  const text = await response.text();
  return text.length > 32_768 ? `${text.slice(0, 32_768)}…` : text;
}

export async function jsonObject(
  response: Response,
  provider: DesktopCloudProviderId,
): Promise<Record<string, unknown>> {
  const text = await boundedText(response);
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch (error) {
    throw new DesktopCloudError(
      provider,
      "invalid-response",
      `cloud provider returned invalid JSON (${response.status})`,
      { cause: error },
    );
  }
  throw new DesktopCloudError(
    provider,
    "invalid-response",
    `cloud provider returned a non-object response (${response.status})`,
  );
}

function providerStatusCode(status: number):
  | "unauthorized"
  | "not-found"
  | "version-conflict"
  | "network" {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404 || status === 410) return "not-found";
  if (status === 409 || status === 412) return "version-conflict";
  return "network";
}

export class DesktopCloudHttpClient {
  readonly provider: DesktopCloudProviderId;
  private readonly accessToken: string | DesktopCloudAccessTokenSource;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DesktopCloudHttpOptions) {
    if (
      typeof options.accessToken === "string"
      && !options.accessToken.trim()
    ) {
      throw new TypeError("cloud access token must not be empty");
    }
    this.provider = options.provider;
    this.accessToken = options.accessToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async authorizationHeaders(
    extra: ConstructorParameters<typeof Headers>[0] = {},
    signal?: AbortSignal,
  ): Promise<Headers> {
    const accessToken = typeof this.accessToken === "string"
      ? this.accessToken
      : await this.accessToken(signal);
    if (!accessToken.trim()) {
      throw new DesktopCloudError(
        this.provider,
        "unauthorized",
        "cloud access token source returned an empty token",
      );
    }
    const headers = new Headers(extra);
    headers.set("Authorization", `Bearer ${accessToken}`);
    return headers;
  }

  async request(
    url: string,
    init: RequestInit = {},
    options: {
      readonly allow?: readonly number[];
      readonly anonymous?: boolean;
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<Response> {
    if (options.signal?.aborted) {
      throw new DesktopCloudError(
        this.provider,
        "cancelled",
        "cloud request was cancelled before it started",
      );
    }
    const headers = options.anonymous
      ? new Headers(init.headers)
      : await this.authorizationHeaders(init.headers, options.signal);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        headers,
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal?.aborted) {
        throw new DesktopCloudError(
          this.provider,
          "cancelled",
          "cloud request was cancelled",
          { cause: error },
        );
      }
      throw new DesktopCloudError(
        this.provider,
        "network",
        "cloud provider request failed",
        { cause: error },
      );
    }
    if (response.ok || options.allow?.includes(response.status)) {
      return response;
    }
    const detail = await boundedText(response);
    throw new DesktopCloudError(
      this.provider,
      providerStatusCode(response.status),
      `cloud provider request failed (${response.status})${detail ? `: ${detail.slice(0, 512)}` : ""}`,
    );
  }
}

export function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function numberField(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
