import { create } from "zustand";

import { readBrowserPreference, writeBrowserPreference } from "./browser-preferences";

export const CREATOR_EXPERIENCE_STORAGE_KEY = "toonspectrum-creator-experience-mode-v1";
export type CreatorExperienceMode = "classic" | "virtual-studio";

function normalizeMode(value: unknown): CreatorExperienceMode {
  return value === "virtual-studio" ? "virtual-studio" : "classic";
}

function storage(): Pick<Storage, "getItem" | "setItem"> | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

function readMode(): CreatorExperienceMode {
  const raw = readBrowserPreference(storage, CREATOR_EXPERIENCE_STORAGE_KEY);
  if (!raw) return "classic";
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "mode" in parsed) {
      return normalizeMode((parsed as { mode?: unknown }).mode);
    }
    return normalizeMode(parsed);
  } catch {
    return normalizeMode(raw);
  }
}

function applyMode(mode: CreatorExperienceMode): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.creatorExperience = mode;
  }
}

interface CreatorExperienceState {
  mode: CreatorExperienceMode;
  storageAvailable: boolean;
  setMode: (mode: CreatorExperienceMode) => void;
  toggle: () => void;
}

const initialMode = readMode();
applyMode(initialMode);

export const useCreatorExperienceMode = create<CreatorExperienceState>((set, get) => ({
  mode: initialMode,
  storageAvailable: true,
  setMode: (mode) => {
    const normalized = normalizeMode(mode);
    const storageAvailable = writeBrowserPreference(
      storage,
      CREATOR_EXPERIENCE_STORAGE_KEY,
      JSON.stringify({ mode: normalized }),
    );
    applyMode(normalized);
    set({ mode: normalized, storageAvailable });
  },
  toggle: () => get().setMode(get().mode === "classic" ? "virtual-studio" : "classic"),
}));
