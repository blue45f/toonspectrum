import ky, {
  HTTPError,
  type KyResponse,
  type Options,
} from "ky";

import {
  AppApiError,
  observeApiResponse,
  toAppApiError,
} from "@/platform/api-error";
import { getRuntimeApiBase } from "@/platform/runtime-api-base";
import {
  TOONSPECTRUM_CSRF_HEADER,
  TOONSPECTRUM_CSRF_HEADER_VALUE,
  isCsrfProtectedMethod,
} from "@/shared/lib/csrf";
import { handleUnauthorizedSession } from "@/domains/auth/public/session/auth-session-state";

function apiBase() {
  const env = import.meta.env.VITE_API_BASE?.trim().replace(/\/+$/, "");
  return env || getRuntimeApiBase();
}

export function apiPath(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const rooted = clean.startsWith("/api/") || clean === "/api"
    ? clean
    : `/api${clean}`;
  return `${apiBase()}${rooted}`;
}

function resolveBaseUrl(): string {
  if (typeof window !== "undefined" && globalThis.location?.origin) {
    return globalThis.location.origin;
  }
  return "http://localhost";
}

function isCredentialAttemptPath(pathname: string): boolean {
  return pathname.endsWith("/api/auth/login")
    || pathname.endsWith("/api/auth/oauth/google/id-token")
    || pathname.endsWith("/api/auth/oauth/exchange")
    || /\/api\/auth\/oauth\/[^/]+\/demo$/u.test(pathname);
}

const client = ky.create({
  baseUrl: resolveBaseUrl(),
  cache: "no-store",
  credentials: "include",
  timeout: 15_000,
  retry: {
    limit: 2,
    methods: ["get", "head", "options"],
    statusCodes: [408, 425, 429, 500, 502, 503, 504],
    afterStatusCodes: [413, 429, 503],
    backoffLimit: 3_000,
  },
  hooks: {
    beforeRequest: [
      ({ request }) => {
        if (isCsrfProtectedMethod(request.method)) {
          request.headers.set(
            TOONSPECTRUM_CSRF_HEADER,
            TOONSPECTRUM_CSRF_HEADER_VALUE,
          );
        }
      },
    ],
    afterResponse: [
      async ({ request, response }) => {
        const pathname = new URL(request.url).pathname;
        if (response.status === 401 && !isCredentialAttemptPath(pathname)) {
          handleUnauthorizedSession();
        }
        if (!response.ok) {
          await observeApiResponse(response.clone()).catch(() => null);
        }
      },
    ],
  },
});

export type ApiOptions = Omit<Options, "method" | "json" | "body"> & {
  params?: Record<string, string | number | boolean | null | undefined>;
};

function toOptions(options?: ApiOptions): Options {
  if (!options) return {};
  const { params, ...rest } = options;
  if (!params) return rest;
  const searchParams = Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) =>
        value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  return { ...rest, searchParams };
}

async function toJson<T>(response: KyResponse): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      "서버 응답을 해석하지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
  }
}

export const api = {
  raw: client,
  get: <T>(path: string, options?: ApiOptions): Promise<T> =>
    client.get(apiPath(path), toOptions(options)).then(toJson<T>),
  post: <T>(
    path: string,
    body?: unknown,
    options?: ApiOptions,
  ): Promise<T> =>
    client
      .post(apiPath(path), { json: body, ...toOptions(options) })
      .then(toJson<T>),
  patch: <T>(
    path: string,
    body?: unknown,
    options?: ApiOptions,
  ): Promise<T> =>
    client
      .patch(apiPath(path), { json: body, ...toOptions(options) })
      .then(toJson<T>),
  put: <T>(
    path: string,
    body?: unknown,
    options?: ApiOptions,
  ): Promise<T> =>
    client
      .put(apiPath(path), { json: body, ...toOptions(options) })
      .then(toJson<T>),
  delete: <T = void>(path: string, options?: ApiOptions): Promise<T> =>
    client.delete(apiPath(path), toOptions(options)).then(toJson<T>),
};

function fetchUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input !== "string") return input;
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(input)) return input;
  return apiPath(input);
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const method = (
    init.method
    ?? (typeof Request !== "undefined" && input instanceof Request
      ? input.method
      : "GET")
  ).toUpperCase();
  const headers = new Headers(
    typeof Request !== "undefined" && input instanceof Request
      ? input.headers
      : undefined,
  );
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  if (isCsrfProtectedMethod(method)) {
    headers.set(TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE);
  }
  const response = await fetch(fetchUrl(input), {
    ...init,
    method,
    headers,
    cache: init.cache ?? "no-store",
    credentials: init.credentials ?? "include",
  });
  const pathname = new URL(response.url || String(fetchUrl(input)), resolveBaseUrl()).pathname;
  if (response.status === 401 && !isCredentialAttemptPath(pathname)) {
    handleUnauthorizedSession();
  }
  if (!response.ok) {
    await observeApiResponse(response.clone()).catch(() => null);
  }
  return response;
}

export { AppApiError, HTTPError };

export function isHttpError(error: unknown): error is HTTPError {
  return error instanceof HTTPError;
}

export function httpStatus(error: unknown): number | null {
  if (error instanceof HTTPError) return error.response.status;
  if (error instanceof AppApiError) return error.status;
  return null;
}

export async function getApiErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  return toAppApiError(error, fallback).message;
}

export async function toApiError(
  error: unknown,
  fallback: string,
): Promise<Error> {
  return toAppApiError(error, fallback);
}
