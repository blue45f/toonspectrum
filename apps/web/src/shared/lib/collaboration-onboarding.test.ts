import { describe, expect, it } from "vitest";

import {
  clearCollaborationOnboarding,
  collaborationOnboardingEmail,
  normalizeCollaborationOnboardingCandidate,
  readCollaborationOnboarding,
  readCollaborationOnboardingCandidate,
  saveCollaborationOnboarding,
} from "./collaboration-onboarding";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

const input = {
  postId: "post-a",
  applicationId: "application-a",
  candidateUserId: "candidate-a",
  candidateName: "지원자",
  candidateContact: "candidate@example.com",
} as const;

describe("collaboration onboarding", () => {
  it("stores and restores a recent selected applicant", () => {
    const target = storage();
    saveCollaborationOnboarding(target, input, 1_000);
    expect(readCollaborationOnboarding(target, 2_000)).toEqual({ ...input, createdAt: 1_000 });
  });

  it("expires stale or malformed onboarding state", () => {
    const target = storage();
    saveCollaborationOnboarding(target, input, 1_000);
    expect(readCollaborationOnboarding(target, 8 * 24 * 60 * 60 * 1_000)).toBeNull();
    expect(target.getItem("toonspectrum-collaboration-onboarding:v1")).toBeNull();
  });

  it("recognizes only direct email contacts and supports explicit clearing", () => {
    expect(collaborationOnboardingEmail("candidate@example.com")).toBe("candidate@example.com");
    expect(collaborationOnboardingEmail("https://example.com/contact")).toBeNull();
    const target = storage();
    saveCollaborationOnboarding(target, input, 1_000);
    clearCollaborationOnboarding(target);
    expect(readCollaborationOnboarding(target, 2_000)).toBeNull();
  });

  it("projects the selected applicant into the team onboarding contract", () => {
    const target = storage();
    saveCollaborationOnboarding(target, input, 1_000);
    expect(readCollaborationOnboardingCandidate(target, "application-a", 2_000)).toEqual({
      applicationId: "application-a",
      postId: "post-a",
      userId: "candidate-a",
      name: "지원자",
      email: "candidate@example.com",
    });
    expect(readCollaborationOnboardingCandidate(target, "another-application", 2_000)).toBeNull();
  });

  it("normalizes router state without trusting malformed identities", () => {
    expect(normalizeCollaborationOnboardingCandidate({
      applicationId: " application-a ",
      postId: " post-a ",
      userId: " candidate-a ",
      name: "  새 팀원  ",
      email: " Candidate@Example.com ",
    })).toEqual({
      applicationId: "application-a",
      postId: "post-a",
      userId: "candidate-a",
      name: "새 팀원",
      email: "candidate@example.com",
    });
    expect(normalizeCollaborationOnboardingCandidate({ applicationId: "application-a" })).toBeNull();
  });
});
