import type { CreatorRoleProfile } from "./creator-role-contract";
import type { CreatorRoleWorkspacePreference } from "./creator-role-workspace-contract";

const STORAGE_PREFIX = "toonspectrum:creator-adaptive-onboarding:v1:";
const acknowledgedUsers = new Set<string>();
const listeners = new Set<() => void>();

/** Only the unscoped project library is a safe automatic onboarding entry.
 * Query-bearing /studio URLs can restore an editor or a companion window.
 * New routes default to non-interrupting rather than needing an exclusion list.
 */
export function isCreatorOnboardingEntry(pathname: string, search = ""): boolean {
  return pathname.replace(/\/+$/u, "") === "/studio" && !search;
}

export function needsCreatorAdaptiveOnboarding(
  profile: CreatorRoleProfile,
  workspace: CreatorRoleWorkspacePreference,
): boolean {
  return !workspace.onboardingComplete
    && profile.onboarding.status !== "completed"
    && profile.onboarding.status !== "skipped";
}

/** This UI preference grants no access and contains no profile or artwork data. */
export function hasAcknowledgedCreatorOnboarding(userId: string | null): boolean {
  if (!userId) return false;
  if (acknowledgedUsers.has(userId)) return true;
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${encodeURIComponent(userId)}`) === "acknowledged";
  } catch {
    return false;
  }
}

export function acknowledgeCreatorOnboarding(userId: string): void {
  acknowledgedUsers.add(userId);
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${encodeURIComponent(userId)}`, "acknowledged");
  } catch {
    // Retain the choice in this tab when storage is blocked or full.
  }
  for (const listener of listeners) listener();
}

export function subscribeCreatorOnboardingAcknowledgement(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
