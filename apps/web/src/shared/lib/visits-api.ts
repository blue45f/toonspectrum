// Optional visit telemetry adapter.
//
// There is deliberately no hosted default. The application already has its own
// first-party traffic analytics bridge, so this legacy adapter remains dormant
// unless an operator explicitly supplies both a base URL and an enable flag.
const BASE = import.meta.env.VITE_DESK_PLATFORM_URL?.trim() ?? "";

export const APP_ID = "toonspectrum";
export const VISIT_PING_PRODUCTION_ORIGIN = "https://www.toonstudio.cloud";
const LAST_PING_KEY = "visits:last-ping";

export interface VisitStats {
  appId: string;
  day: string;
  todayVisits: number;
  todayUniques: number;
  totalVisits: number;
  totalUniques: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface VisitPingEnvironment {
  isProductionBuild: boolean;
  origin?: string;
}

export function shouldSendVisitPing({
  isProductionBuild,
  origin,
}: VisitPingEnvironment): boolean {
  if (
    !BASE ||
    import.meta.env.VITE_DESK_PLATFORM_VISITS !== "1" ||
    !isProductionBuild ||
    !origin
  ) {
    return false;
  }

  try {
    return new URL(origin).origin === VISIT_PING_PRODUCTION_ORIGIN;
  } catch {
    return false;
  }
}

export async function pingVisit(): Promise<void> {
  if (
    !shouldSendVisitPing({
      isProductionBuild: import.meta.env.PROD,
      origin: typeof location !== "undefined" ? location.origin : undefined,
    })
  ) {
    return;
  }

  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_PING_KEY);
  } catch {
    // Storage can be unavailable in private browsing; telemetry stays optional.
  }

  const day = today();
  if (last === day) return;

  try {
    const path = typeof location !== "undefined" ? location.pathname : "";
    const endpoint = new URL(`/api/v1/apps/${APP_ID}/visits/ping`, BASE);
    if (path) endpoint.searchParams.set("path", path);
    const response = await fetch(endpoint.toString(), {
      method: "POST",
      keepalive: true,
    });
    if (response.ok) {
      try {
        localStorage.setItem(LAST_PING_KEY, day);
      } catch {
        // Best-effort analytics must never affect the application.
      }
    }
  } catch {
    // Best-effort analytics must never affect the application.
  }
}

export async function fetchVisitStats(): Promise<VisitStats | null> {
  if (!BASE) return null;
  try {
    const endpoint = new URL(`/api/v1/apps/${APP_ID}/visits/stats`, BASE);
    const response = await fetch(endpoint.toString());
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<VisitStats>;
    const numberOrZero = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value) ? value : 0;
    return {
      appId: typeof data.appId === "string" ? data.appId : APP_ID,
      day: typeof data.day === "string" ? data.day : today(),
      todayVisits: numberOrZero(data.todayVisits),
      todayUniques: numberOrZero(data.todayUniques),
      totalVisits: numberOrZero(data.totalVisits),
      totalUniques: numberOrZero(data.totalUniques),
    };
  } catch {
    return null;
  }
}
