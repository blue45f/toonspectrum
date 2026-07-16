const STUDIO_LIVE_SOCKET_NAMESPACE = "/studio-live";

export interface StudioLiveSocketEndpointInput {
  explicitOrigin?: string | null;
  viteApiBase?: string | null;
  runtimeApiBase?: string | null;
  locationOrigin?: string | null;
  allowInsecureLoopback?: boolean;
}

function firstNonBlank(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/u.test(hostname)
  );
}

/**
 * Socket.IO's first argument combines the server origin and namespace. A dedicated long-running
 * realtime origin wins over HTTP API bases. Remote origins require HTTPS; development may opt into
 * HTTP only on loopback. Credentials, paths, query strings, and fragments never enter the endpoint.
 */
export function resolveStudioLiveSocketEndpoint({
  explicitOrigin,
  viteApiBase,
  runtimeApiBase,
  locationOrigin,
  allowInsecureLoopback = false,
}: StudioLiveSocketEndpointInput): string {
  const configuredBase = firstNonBlank(explicitOrigin, viteApiBase, runtimeApiBase);
  if (!configuredBase) return STUDIO_LIVE_SOCKET_NAMESPACE;

  const safeLocationOrigin = firstNonBlank(locationOrigin);
  let url: URL;
  try {
    url = safeLocationOrigin
      ? new URL(configuredBase, safeLocationOrigin)
      : new URL(configuredBase);
  } catch {
    return STUDIO_LIVE_SOCKET_NAMESPACE;
  }
  const secureOrigin = url.protocol === "https:";
  const localDevelopmentOrigin =
    allowInsecureLoopback && url.protocol === "http:" && isLoopbackHostname(url.hostname);
  if (
    (!secureOrigin && !localDevelopmentOrigin) ||
    url.username ||
    url.password ||
    url.origin === "null"
  ) {
    return STUDIO_LIVE_SOCKET_NAMESPACE;
  }
  return `${url.origin}${STUDIO_LIVE_SOCKET_NAMESPACE}`;
}
