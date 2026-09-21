import type { ProductionNotification, ProductionNotificationPolicy, ProductionProjectAggregate } from "./types";

export function productionQuietHours(policy: ProductionNotificationPolicy | undefined, timezone: string | null, now: Date): "off" | "quiet" | "active" | "unknown" {
  if (!policy?.enabled) return "off";
  if (policy.quietHoursStart === null && policy.quietHoursEnd === null) return "active";
  if (!timezone || !policy.quietHoursStart || !policy.quietHoursEnd || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(policy.quietHoursStart)
    || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(policy.quietHoursEnd) || !Number.isFinite(now.getTime())) return "unknown";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const current = `${parts.find((part) => part.type === "hour")!.value}:${parts.find((part) => part.type === "minute")!.value}`;
    const start = policy.quietHoursStart, end = policy.quietHoursEnd;
    if (start === end) return "active";
    return (start < end ? current >= start && current < end : current >= start || current < end) ? "quiet" : "active";
  } catch { return "unknown"; }
}
export function safeProductionNotificationHref(projectId: string, href: string): string | null {
  const prefix = `/production/projects/${encodeURIComponent(projectId)}`;
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) return null;
  try { const url = new URL(href, "https://production.invalid");
    return url.origin === "https://production.invalid" && (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)) ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch { return null; }
}
export function groupProductionNotifications(aggregate: ProductionProjectAggregate, assignmentId: string, now: Date) {
  const policy = (aggregate.notificationPolicies ?? []).find((entry) => entry.assignmentId === assignmentId);
  const timezone = policy?.timezone ?? (aggregate.resourceCalendars ?? []).find((entry) => entry.assignmentId === assignmentId)?.timezone ?? null;
  const groups = new Map<string, ProductionNotification[]>();
  if (!aggregate.assignments.some((entry) => entry.id === assignmentId && entry.status === "active")) return { groups: [], quiet: "unknown" as const, policy, timezone };
  for (const notification of aggregate.notifications ?? []) {
    if (notification.projectId !== aggregate.projectId || notification.status !== "unread" || (notification.assignmentId !== null && notification.assignmentId !== assignmentId)) continue;
    const key = JSON.stringify([notification.sourceType, notification.sourceId, notification.assignmentId]);
    const entries = groups.get(key) ?? []; entries.push(notification); groups.set(key, entries);
  }
  return { groups: [...groups.entries()].map(([key, entries]) => ({ key,
    entries: [...entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
  })).sort((a, b) => Date.parse(b.entries[0]!.createdAt) - Date.parse(a.entries[0]!.createdAt)),
  quiet: productionQuietHours(policy, timezone, now), policy, timezone };
}
