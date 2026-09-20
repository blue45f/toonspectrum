// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acknowledgeCreatorOnboarding,
  hasAcknowledgedCreatorOnboarding,
  isCreatorOnboardingEntry,
  needsCreatorAdaptiveOnboarding,
  subscribeCreatorOnboardingAcknowledgement,
} from "./creator-adaptive-onboarding-policy";
import { EMPTY_CREATOR_ROLE_PROFILE, normalizeCreatorRoleProfile } from "./creator-role-contract";
import { normalizeCreatorRoleWorkspacePreference } from "./creator-role-workspace-contract";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("creator adaptive onboarding policy", () => {
  it("allows only the unscoped library, including its trailing-slash form", () => {
    expect(isCreatorOnboardingEntry("/studio")).toBe(true);
    expect(isCreatorOnboardingEntry("/studio/")).toBe(true);
    expect(isCreatorOnboardingEntry("/studio/new-tool")).toBe(false);
    expect(isCreatorOnboardingEntry("/studio", "?mode=")).toBe(false);
    expect(isCreatorOnboardingEntry("/studio", "?id=")).toBe(false);
    expect(isCreatorOnboardingEntry("/studio", "?remix=")).toBe(false);
  });

  it("honors either completion source and the explicit skip preference", () => {
    const document = normalizeCreatorRoleWorkspacePreference({});
    expect(needsCreatorAdaptiveOnboarding(EMPTY_CREATOR_ROLE_PROFILE, document)).toBe(true);
    expect(needsCreatorAdaptiveOnboarding(EMPTY_CREATOR_ROLE_PROFILE,
      normalizeCreatorRoleWorkspacePreference({ onboardingComplete: true }))).toBe(false);
    for (const status of ["completed", "skipped"]) {
      expect(needsCreatorAdaptiveOnboarding(normalizeCreatorRoleProfile({ onboarding: { status } }), document)).toBe(false);
    }
    // Legacy profiles with a role normalize to completed without requiring new metadata.
    expect(needsCreatorAdaptiveOnboarding(normalizeCreatorRoleProfile({ primaryRole: "story" }), document)).toBe(false);
  });

  it("reads a previous browser visit without writing profile data", () => {
    localStorage.setItem("toonspectrum:creator-adaptive-onboarding:v1:existing%2Fuser", "acknowledged");
    expect(hasAcknowledgedCreatorOnboarding("existing/user")).toBe(true);
    expect(hasAcknowledgedCreatorOnboarding("another-user")).toBe(false);
    expect(hasAcknowledgedCreatorOnboarding(null)).toBe(false);
  });

  it("retains dismissal in the current tab if browser storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage unavailable"); });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage unavailable"); });
    expect(hasAcknowledgedCreatorOnboarding("blocked-before")).toBe(false);
    acknowledgeCreatorOnboarding("blocked-storage-user");
    expect(hasAcknowledgedCreatorOnboarding("blocked-storage-user")).toBe(true);
  });

  it("notifies this tab and listens only to relevant cross-tab storage changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCreatorOnboardingAcknowledgement(listener);
    acknowledgeCreatorOnboarding("listener-user");
    expect(listener).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated" }));
    expect(listener).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent("storage", { key: "toonspectrum:creator-adaptive-onboarding:v1:remote-user" }));
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    acknowledgeCreatorOnboarding("unsubscribed-user");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
