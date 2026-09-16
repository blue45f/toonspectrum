import { describe, expect, it } from "vitest";

import {
  resolveWorkflowTrustPresentation,
  type WorkflowTrustState,
} from "./workflow-trust";

const STATES: readonly WorkflowTrustState[] = [
  "resume-ready",
  "device-saved",
  "syncing",
  "synced",
  "offline-pending",
  "retry-needed",
  "conflict",
  "review-submitted",
  "approved",
  "published",
];

describe("workflow trust language", () => {
  it("provides understandable Korean and English copy for every state", () => {
    for (const state of STATES) {
      for (const locale of ["ko", "en"] as const) {
        const presentation = resolveWorkflowTrustPresentation(state, locale);
        expect(presentation.label.length).toBeGreaterThan(3);
        expect(presentation.description.length).toBeGreaterThan(12);
      }
    }
  });

  it("uses assertive announcements only when the user must act", () => {
    expect(resolveWorkflowTrustPresentation("retry-needed", "ko").live).toBe("assertive");
    expect(resolveWorkflowTrustPresentation("conflict", "ko").live).toBe("assertive");
    expect(resolveWorkflowTrustPresentation("synced", "ko").live).toBe("polite");
  });

  it("does not collapse review, approval and publishing into a generic saved state", () => {
    const labels = ["review-submitted", "approved", "published"].map((state) =>
      resolveWorkflowTrustPresentation(state as WorkflowTrustState, "ko").label,
    );
    expect(new Set(labels).size).toBe(3);
  });
});
