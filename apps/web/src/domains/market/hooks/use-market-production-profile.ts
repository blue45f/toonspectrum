import { useCallback, useEffect, useRef, useState } from "react";

import {
  DEFAULT_MARKET_PRODUCTION_PROFILE,
  MARKET_PRODUCTION_PROFILE_STORAGE_KEY,
  mergeMarketProductionProfile,
  parseMarketProductionProfile,
  serializeMarketProductionProfile,
} from "../models/market-production-fit";

import type { MarketProductionProfile } from "../models/market-production-fit";

const MARKET_PRODUCTION_PROFILE_CHANGE_EVENT =
  "toonspectrum:market-production-profile-change";

interface MarketProductionProfileStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

interface MarketProductionProfileSnapshot {
  readonly profile: MarketProductionProfile;
  readonly persistenceAvailable: boolean;
}

type MarketProductionProfileChangeDetail = MarketProductionProfileSnapshot;

export interface MarketProductionProfileState {
  readonly profile: MarketProductionProfile;
  readonly hydrated: boolean;
  readonly persistenceAvailable: boolean;
  readonly updateProfile: (
    patch: Partial<Omit<MarketProductionProfile, "version">>,
  ) => void;
  readonly replaceProfile: (profile: MarketProductionProfile) => void;
  readonly resetProfile: () => void;
}

function browserStorage(): MarketProductionProfileStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readMarketProductionProfileSnapshot(
  storage: MarketProductionProfileStorage | null,
): MarketProductionProfileSnapshot {
  if (!storage) {
    return {
      profile: DEFAULT_MARKET_PRODUCTION_PROFILE,
      persistenceAvailable: false,
    };
  }
  let serialized: string | null;
  try {
    serialized = storage.getItem(MARKET_PRODUCTION_PROFILE_STORAGE_KEY);
  } catch {
    return {
      profile: DEFAULT_MARKET_PRODUCTION_PROFILE,
      persistenceAvailable: false,
    };
  }
  if (!serialized) {
    return {
      profile: DEFAULT_MARKET_PRODUCTION_PROFILE,
      persistenceAvailable: true,
    };
  }
  try {
    return {
      profile: parseMarketProductionProfile(JSON.parse(serialized)),
      persistenceAvailable: true,
    };
  } catch {
    // A damaged preference is not evidence that storage itself is unavailable. Fail closed to the
    // default profile while keeping the editor writable so the next change can repair the value.
    return {
      profile: DEFAULT_MARKET_PRODUCTION_PROFILE,
      persistenceAvailable: true,
    };
  }
}

export function readMarketProductionProfile(
  storage: MarketProductionProfileStorage | null = browserStorage(),
): MarketProductionProfile {
  return readMarketProductionProfileSnapshot(storage).profile;
}

export function persistMarketProductionProfile(
  profile: MarketProductionProfile,
  storage: MarketProductionProfileStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      MARKET_PRODUCTION_PROFILE_STORAGE_KEY,
      serializeMarketProductionProfile(profile),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearMarketProductionProfile(
  storage: MarketProductionProfileStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(MARKET_PRODUCTION_PROFILE_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function announceProfileChange(detail: MarketProductionProfileChangeDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<MarketProductionProfileChangeDetail>(
    MARKET_PRODUCTION_PROFILE_CHANGE_EVENT,
    { detail },
  ));
}

/**
 * Local production preferences intentionally stay outside the marketplace authority model. They
 * never claim an acquisition, purchase, install or project mutation. A typed local event keeps
 * cards and detail preflights in the current tab aligned, while the browser storage event keeps
 * separate tabs aligned. When storage is blocked, the current tab still retains every edit.
 */
export function useMarketProductionProfile(): MarketProductionProfileState {
  const [profile, setProfile] = useState<MarketProductionProfile>(
    DEFAULT_MARKET_PRODUCTION_PROFILE,
  );
  const profileRef = useRef(profile);
  const [hydrated, setHydrated] = useState(false);
  const [persistenceAvailable, setPersistenceAvailable] = useState(true);

  const assignSnapshot = useCallback((snapshot: MarketProductionProfileSnapshot) => {
    profileRef.current = snapshot.profile;
    setProfile(snapshot.profile);
    setPersistenceAvailable(snapshot.persistenceAvailable);
    setHydrated(true);
  }, []);

  useEffect(() => {
    const syncFromStorage = () => {
      assignSnapshot(readMarketProductionProfileSnapshot(browserStorage()));
    };
    const onStorage = (event: StorageEvent) => {
      if (
        event.key !== null
        && event.key !== MARKET_PRODUCTION_PROFILE_STORAGE_KEY
      ) {
        return;
      }
      const storage = browserStorage();
      if (storage && event.storageArea && event.storageArea !== storage) return;
      syncFromStorage();
    };
    const onLocalChange = (event: Event) => {
      const customEvent = event as CustomEvent<Partial<MarketProductionProfileChangeDetail>>;
      assignSnapshot({
        profile: parseMarketProductionProfile(customEvent.detail?.profile),
        persistenceAvailable: customEvent.detail?.persistenceAvailable === true,
      });
    };

    syncFromStorage();
    window.addEventListener("storage", onStorage);
    window.addEventListener(MARKET_PRODUCTION_PROFILE_CHANGE_EVENT, onLocalChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(MARKET_PRODUCTION_PROFILE_CHANGE_EVENT, onLocalChange);
    };
  }, [assignSnapshot]);

  const replaceProfile = useCallback((nextProfile: MarketProductionProfile) => {
    const parsed = parseMarketProductionProfile(nextProfile);
    const snapshot = {
      profile: parsed,
      persistenceAvailable: persistMarketProductionProfile(parsed),
    };
    assignSnapshot(snapshot);
    announceProfileChange(snapshot);
  }, [assignSnapshot]);

  const updateProfile = useCallback((
    patch: Partial<Omit<MarketProductionProfile, "version">>,
  ) => {
    replaceProfile(mergeMarketProductionProfile(profileRef.current, patch));
  }, [replaceProfile]);

  const resetProfile = useCallback(() => {
    const snapshot = {
      profile: DEFAULT_MARKET_PRODUCTION_PROFILE,
      persistenceAvailable: clearMarketProductionProfile(),
    };
    assignSnapshot(snapshot);
    announceProfileChange(snapshot);
  }, [assignSnapshot]);

  return {
    profile,
    hydrated,
    persistenceAvailable,
    updateProfile,
    replaceProfile,
    resetProfile,
  };
}
