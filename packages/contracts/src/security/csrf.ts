/**
 * Runtime-neutral CSRF contract shared by browser clients and the API boundary.
 *
 * Browser-specific helpers that construct Headers/RequestInit remain in apps/web.
 */
export const TOONSPECTRUM_CSRF_HEADER = "x-toonspectrum-csrf";
export const TOONSPECTRUM_CSRF_HEADER_VALUE = "1";

const CSRF_PROTECTED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isCsrfProtectedMethod(method: string | undefined): boolean {
  return CSRF_PROTECTED_METHODS.has((method ?? "GET").toUpperCase());
}