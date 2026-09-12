export type ServerlessRouteGroup = "auth" | "studio" | "general" | "full";

/** A transport routing decision only. Every group still installs the same security boundary. */
export function serverlessRouteGroup(pathname = "/", partitioned = true): ServerlessRouteGroup {
  if (!partitioned || pathname === "/") return "full";
  // Match complete segments. Unknown namespaces keep the general API's 404 behavior.
  if (/^\/api\/auth(?:\/|$)/i.test(pathname)) return "auth";
  if (/^\/api\/(?:creator|creator-resources|studio-ai|studio-music|studio-realtime)(?:\/|$)/i.test(pathname)) return "studio";
  return "general";
}
