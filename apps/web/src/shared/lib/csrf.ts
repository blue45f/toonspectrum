import {
  TOONSPECTRUM_CSRF_HEADER,
  TOONSPECTRUM_CSRF_HEADER_VALUE,
  isCsrfProtectedMethod,
} from "@toonspectrum/contracts/security/csrf";

export {
  TOONSPECTRUM_CSRF_HEADER,
  TOONSPECTRUM_CSRF_HEADER_VALUE,
  isCsrfProtectedMethod,
};

/**
 * Browser CSRF helpers for ToonSpectrum API clients.
 *
 * Public constants and unsafe-method classification live in the contracts package
 * so the API never imports browser application source.
 */
export function withCsrfHeader(headers?: HeadersInit): Headers {
  const next = new Headers(headers);
  next.set(TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE);
  return next;
}

/** Protect a known ToonSpectrum API mutation while preserving the full fetch init. */
export function withCsrfProtection(init: RequestInit): RequestInit {
  if (!isCsrfProtectedMethod(init.method)) return init;
  return { ...init, headers: withCsrfHeader(init.headers) };
}