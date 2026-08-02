import type { Request } from "express";

function safeDecodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** Canonicalizes the Vercel-compatible `?path=` adapter shape before security boundaries run. */
export function rewriteQueryPathToUrl(request: Request): void {
  const pathValue =
    request.query && typeof request.query === "object"
      ? request.query.path
      : undefined;
  const extractedPath = Array.isArray(pathValue)
    ? pathValue
        .filter((value): value is string => typeof value === "string")
        .join("/")
    : typeof pathValue === "string"
      ? pathValue
      : undefined;
  if (typeof extractedPath !== "string") return;

  const nextPath = extractedPath.startsWith("/")
    ? extractedPath
    : `/${extractedPath}`;
  const safeNormalizedPath = safeDecodePath(nextPath);
  const normalizedPath = safeNormalizedPath.startsWith("/api")
    ? safeNormalizedPath
    : `/api${safeNormalizedPath}`;
  const rewriteUrl = new URL(request.url, "https://example.local");
  rewriteUrl.pathname = normalizedPath;
  rewriteUrl.searchParams.delete("path");
  request.url = `${rewriteUrl.pathname}${rewriteUrl.search}`;
  delete (request.query as Record<string, unknown>).path;
}
