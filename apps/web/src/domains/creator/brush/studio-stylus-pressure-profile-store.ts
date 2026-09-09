/** Browser-local UI preference store for the pure stylus pressure profile contract. */

import {
  DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE,
  normalizeStudioStylusPressureProfile,
  type StudioStylusPressureProfile,
} from "./studio-stylus-pressure-profile";

export const STUDIO_STYLUS_PRESSURE_PROFILE_STORAGE_KEY =
  "toonstudio:stylus-pressure-profile:v1";

let activeProfile: StudioStylusPressureProfile = DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE;
let storageHydrated = false;
let storageListenerInstalled = false;
const profileListeners = new Set<() => void>();

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function hydrateProfileFromStorage(): void {
  if (storageHydrated) return;
  storageHydrated = true;
  const storage = browserStorage();
  if (!storage) return;
  try {
    const serialized = storage.getItem(STUDIO_STYLUS_PRESSURE_PROFILE_STORAGE_KEY);
    if (serialized) activeProfile = normalizeStudioStylusPressureProfile(JSON.parse(serialized));
  } catch {
    // Corrupt/private-mode storage fails closed to the identity profile.
    activeProfile = DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE;
  }
}

function publishProfile(profile: StudioStylusPressureProfile): void {
  activeProfile = profile;
  for (const listener of profileListeners) listener();
}

/** Stable snapshot used by React and captured once by the pointer-down coordinator. */
export function getStudioStylusPressureProfileSnapshot(): StudioStylusPressureProfile {
  hydrateProfileFromStorage();
  return activeProfile;
}

/** Browser-local persistence: documents store calibrated samples, never this device preference. */
export function setStudioStylusPressureProfile(
  value: unknown,
  options: Readonly<{ persist?: boolean }> = {},
): StudioStylusPressureProfile {
  const profile = normalizeStudioStylusPressureProfile(value);
  if (options.persist !== false) {
    const storage = browserStorage();
    if (storage) {
      try {
        storage.setItem(STUDIO_STYLUS_PRESSURE_PROFILE_STORAGE_KEY, JSON.stringify(profile));
      } catch {
        // Drawing remains functional when storage is unavailable or full.
      }
    }
  }
  storageHydrated = true;
  publishProfile(profile);
  return profile;
}

export function resetStudioStylusPressureProfile(
  options: Readonly<{ persist?: boolean }> = {},
): StudioStylusPressureProfile {
  if (options.persist !== false) {
    const storage = browserStorage();
    if (storage) {
      try {
        storage.removeItem(STUDIO_STYLUS_PRESSURE_PROFILE_STORAGE_KEY);
      } catch {
        // Ignore unavailable storage; the in-memory identity reset still applies.
      }
    }
  }
  storageHydrated = true;
  publishProfile(DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE);
  return activeProfile;
}

export function subscribeStudioStylusPressureProfile(listener: () => void): () => void {
  profileListeners.add(listener);
  if (!storageListenerInstalled && typeof window !== "undefined") {
    storageListenerInstalled = true;
    window.addEventListener("storage", (event) => {
      if (event.key !== STUDIO_STYLUS_PRESSURE_PROFILE_STORAGE_KEY) return;
      try {
        publishProfile(event.newValue
          ? normalizeStudioStylusPressureProfile(JSON.parse(event.newValue))
          : DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE);
      } catch {
        publishProfile(DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE);
      }
    });
  }
  return () => profileListeners.delete(listener);
}
