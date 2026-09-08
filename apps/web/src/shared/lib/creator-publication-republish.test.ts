import { describe, expect, it } from "vitest";

import {
  isCreatorPublicationDue,
  normalizeCreatorPublicationDirective,
} from "./creator-publication-contract";

describe("scheduled republishing", () => {
  it("invalidates an older publishedAt when a later schedule is authored", () => {
    const directive = normalizeCreatorPublicationDirective({
      mode: "scheduled",
      visibility: "public",
      scheduledAt: "2026-09-12T09:00:00.000Z",
      publishedAt: "2026-09-01T09:00:00.000Z",
    });

    expect(directive.publishedAt).toBeNull();
    expect(isCreatorPublicationDue(directive, new Date("2026-09-12T09:00:00.000Z"))).toBe(true);
  });

  it("keeps the completed timestamp for an already promoted schedule", () => {
    const directive = normalizeCreatorPublicationDirective({
      mode: "scheduled",
      visibility: "unlisted",
      scheduledAt: "2026-09-10T09:00:00.000Z",
      publishedAt: "2026-09-10T09:00:02.000Z",
    });

    expect(directive.publishedAt).toBe("2026-09-10T09:00:02.000Z");
  });
});
