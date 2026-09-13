import { createHash } from "node:crypto";

import type { HealthReadinessReport } from "./health.service";

const CHECKS = [
  "database", "schema", "realtime", "objectStorage", "coordination", "durableQueueExecutor",
] as const;
const LOG_INTERVAL_MS = 60_000;

/** Compare configured database targets without logging credentials, URLs, or query options. */
export function databaseTargetFingerprint(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return null;
    // Ambiguous connection overrides must not produce a misleading target identity.
    if ([...url.searchParams.keys()].some((key) => !["sslmode", "channel_binding", "uselibpqcompat"].includes(key))) return null;
    const host = url.hostname.toLowerCase().replace(/-pooler(?=\.)/, "");
    if (!host || url.pathname.length < 2 || !url.username) return null;
    return createHash("sha256").update(JSON.stringify([
      host, url.port || "5432", decodeURIComponent(url.pathname.slice(1)), decodeURIComponent(url.username),
    ])).digest("hex");
  } catch {
    return null;
  }
}

/** Internal-only and bounded; no diagnostic changes the public readiness contract. */
export function createReadinessFailureReporter(
  write: (message: string) => void,
  now: () => number = Date.now,
): (report: HealthReadinessReport, databaseUrl?: string) => void {
  let lastSignature = "";
  let lastLoggedAt = -Infinity;
  return (report, databaseUrl) => {
    if (report.ready) {
      lastSignature = "";
      return;
    }
    const message = JSON.stringify({
      event: "service_readiness_failed",
      failedChecks: CHECKS.filter((key) => report[key] !== true),
      databaseTargetFingerprint: databaseTargetFingerprint(databaseUrl),
    });
    const timestamp = now();
    const elapsed = timestamp - lastLoggedAt;
    if (message === lastSignature && elapsed >= 0 && elapsed < LOG_INTERVAL_MS) return;
    lastSignature = message;
    lastLoggedAt = timestamp;
    try { write(message); } catch { /* Telemetry must not replace the existing 503 response. */ }
  };
}
