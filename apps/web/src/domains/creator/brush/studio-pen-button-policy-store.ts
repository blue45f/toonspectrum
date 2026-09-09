/** Browser-local UI preference store for standards-based pen button routing. */

import {
  DEFAULT_STUDIO_PEN_BUTTON_POLICY,
  normalizeStudioPenButtonPolicy,
  type StudioPenButtonPolicy,
} from "./studio-pen-button-policy";

export const STUDIO_PEN_BUTTON_POLICY_STORAGE_KEY =
  "toonstudio:pen-button-policy:v1";

let activePolicy: StudioPenButtonPolicy = DEFAULT_STUDIO_PEN_BUTTON_POLICY;
let storageHydrated = false;
let storageListenerInstalled = false;
const listeners = new Set<() => void>();

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function hydrateFromStorage(): void {
  if (storageHydrated) return;
  storageHydrated = true;
  const storage = browserStorage();
  if (!storage) return;
  try {
    const serialized = storage.getItem(STUDIO_PEN_BUTTON_POLICY_STORAGE_KEY);
    if (serialized) activePolicy = normalizeStudioPenButtonPolicy(JSON.parse(serialized));
  } catch {
    activePolicy = DEFAULT_STUDIO_PEN_BUTTON_POLICY;
  }
}

function publish(policy: StudioPenButtonPolicy): void {
  activePolicy = policy;
  for (const listener of listeners) listener();
}

export function getStudioPenButtonPolicySnapshot(): StudioPenButtonPolicy {
  hydrateFromStorage();
  return activePolicy;
}

export function setStudioPenButtonPolicy(
  value: unknown,
  options: Readonly<{ persist?: boolean }> = {},
): StudioPenButtonPolicy {
  const policy = normalizeStudioPenButtonPolicy(value);
  if (options.persist !== false) {
    const storage = browserStorage();
    if (storage) {
      try {
        storage.setItem(STUDIO_PEN_BUTTON_POLICY_STORAGE_KEY, JSON.stringify(policy));
      } catch {
        // Keep the in-memory policy functional when storage is unavailable.
      }
    }
  }
  storageHydrated = true;
  publish(policy);
  return policy;
}

export function resetStudioPenButtonPolicy(
  options: Readonly<{ persist?: boolean }> = {},
): StudioPenButtonPolicy {
  if (options.persist !== false) {
    const storage = browserStorage();
    if (storage) {
      try {
        storage.removeItem(STUDIO_PEN_BUTTON_POLICY_STORAGE_KEY);
      } catch {
        // Ignore private/full storage; the in-memory reset still applies.
      }
    }
  }
  storageHydrated = true;
  publish(DEFAULT_STUDIO_PEN_BUTTON_POLICY);
  return activePolicy;
}

export function subscribeStudioPenButtonPolicy(listener: () => void): () => void {
  listeners.add(listener);
  if (!storageListenerInstalled && typeof window !== "undefined") {
    storageListenerInstalled = true;
    window.addEventListener("storage", (event) => {
      if (event.key !== STUDIO_PEN_BUTTON_POLICY_STORAGE_KEY) return;
      try {
        publish(event.newValue
          ? normalizeStudioPenButtonPolicy(JSON.parse(event.newValue))
          : DEFAULT_STUDIO_PEN_BUTTON_POLICY);
      } catch {
        publish(DEFAULT_STUDIO_PEN_BUTTON_POLICY);
      }
    });
  }
  return () => listeners.delete(listener);
}
