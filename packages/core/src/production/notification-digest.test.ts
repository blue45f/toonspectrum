import { describe, expect, it } from "vitest";

import { createProductionProjectAggregate } from "./aggregate";
import { groupProductionNotifications, productionQuietHours, safeProductionNotificationHref } from "./notification-digest";

import type { ProductionNotification, ProductionNotificationPolicy } from "./types";

const base = () => createProductionProjectAggregate({ projectId: "p", workId: "w", title: "Test", collaborationModel: "studio-production", ownerPartyId: "owner", ownerUserId: "u", ownerDisplayName: "Owner", at: "2026-09-21T00:00:00.000Z" });
const policy: ProductionNotificationPolicy = { id: "policy", projectId: "p", assignmentId: "owner", channels: ["in-app"], digest: "daily", quietHoursStart: "22:00", quietHoursEnd: "08:00", enabled: true, dueSoonHours: 48, escalationHours: 24, updatedAt: "2026-09-21T00:00:00.000Z" };
describe("notification grouping and quiet hours", () => {
  it.each([["2026-09-21T12:59:00Z", "active"], ["2026-09-21T13:00:00Z", "quiet"], ["2026-09-21T22:59:00Z", "quiet"], ["2026-09-21T23:00:00Z", "active"]] as const)("handles timezone and overnight boundary %s", (date, result) => {
    expect(productionQuietHours(policy, "Asia/Seoul", new Date(date))).toBe(result);
  });
  it("does not invent a timezone and keeps disabled/equal quiet periods explicit", () => {
    const now = new Date("2026-09-21T00:00:00Z");
    expect(productionQuietHours(policy, "Invalid", now)).toBe("unknown");
    expect(productionQuietHours(policy, null, now)).toBe("unknown");
    expect(productionQuietHours({ ...policy, enabled: false }, null, now)).toBe("off");
    expect(productionQuietHours({ ...policy, quietHoursEnd: "22:00" }, "UTC", now)).toBe("active");
  });
  it.each(["//evil.test", "https://evil.test", "/production/projects/other", "/production/projects/p/../../other", "/production/projects/prefix", "javascript:alert(1)"])("rejects foreign or unsafe target %s", (href) => {
    expect(safeProductionNotificationHref("p", href)).toBeNull();
  });
  it("keeps an exact project deep link and its selected task", () => {
    expect(safeProductionNotificationHref("p", "/production/projects/p/production?task=t#note")).toBe("/production/projects/p/production?task=t#note");
  });
  it("groups only this project/assignee's unread data and excludes revoked assignments", () => {
    const a = base(), assignmentId = a.assignments[0]!.id;
    const note: ProductionNotification = { id: "n", projectId: "p", assignmentId, type: "review", title: "Review", body: "Read", href: "/production/projects/p", urgency: "info", sourceType: "review", sourceId: "r", status: "unread", createdAt: "2026-09-21T00:00:00Z", readAt: null };
    const aggregate = { ...a, notifications: [note, { ...note, id: "n2" }, { ...note, id: "foreign", projectId: "other" }, { ...note, id: "someone", assignmentId: "other" }, { ...note, id: "read", status: "read" as const }] };
    expect(groupProductionNotifications(aggregate, assignmentId, new Date()).groups.map((g) => g.entries.map((n) => n.id))).toEqual([["n", "n2"]]);
    expect(groupProductionNotifications({ ...aggregate, assignments: [] }, assignmentId, new Date()).groups).toEqual([]);
  });
});
