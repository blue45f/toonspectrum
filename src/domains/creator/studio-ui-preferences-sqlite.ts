import {
  normalizeStudioAdvancedFillSettings,
  type StudioAdvancedFillSettings,
} from "./studio-advanced-fill-settings";
import {
  normalizeStudioAppSettings,
  type StudioAppSettings,
} from "./studio-app-settings";
import {
  normalizeStudioAssetFavoriteState,
  studioAssetFavoriteStorageKey,
  type StudioAssetFavoriteState,
} from "./studio-asset-favorites";
import {
  normalizeStudioBackgroundRecentState,
  type StudioBackgroundRecentState,
} from "./studio-background-recent";
import { normalizeRecentColors } from "./studio-color-utils";
import {
  normalizeStudioEffectFavoriteState,
  type StudioEffectFavoriteState,
} from "./studio-effect-favorites";
import {
  normalizeStudioElementsRecentState,
  type StudioElementsRecentState,
} from "./studio-elements-recent";

import type { StudioAsyncKeyValueStore } from "./studio-local-database";
import type { StudioServerAiProviderPreference } from "./studio-server-ai-client";

async function acquireStudioUiPreferencesDatabase() {
  const { acquireStudioLocalDatabase } = await import("./studio-local-database-runtime");
  return acquireStudioLocalDatabase();
}


export const STUDIO_UI_PREFERENCES_SQLITE_NAMESPACE = "studio-ui-preferences-v1";
export const STUDIO_PAGE_PREVIEW_SIZE_VALUES = [
  "compact",
  "comfortable",
  "large",
] as const;
export type StudioPagePreviewSize = (typeof STUDIO_PAGE_PREVIEW_SIZE_VALUES)[number];

const BACKGROUND_RECENT_KEY = "background-recent";
const APP_SETTINGS_KEY = "app-settings";
const ADVANCED_FILL_SETTINGS_KEY = "advanced-fill-settings";
const EFFECT_FAVORITES_KEY = "effect-favorites";
const ELEMENTS_RECENT_KEY = "elements-recent";
const PAGE_PREVIEW_SIZE_KEY = "page-preview-size";
const RECENT_COLORS_KEY = "recent-colors";
const SERVER_AI_PROVIDER_KEY = "server-ai-provider";

export const STUDIO_UI_BOOLEAN_PREFERENCE_KEYS = [
  "ai-notice-acknowledged",
  "quick-start-dismissed",
  "mobile-hint-dismissed",
  "comment-pins-hidden",
] as const;
export type StudioUiBooleanPreferenceKey =
  (typeof STUDIO_UI_BOOLEAN_PREFERENCE_KEYS)[number];

export interface StudioUiPreferencesRepository {
  readonly authority: "sqlite-opfs";
  loadAppSettings(): Promise<StudioAppSettings>;
  saveAppSettings(settings: StudioAppSettings): Promise<void>;
  loadAdvancedFillSettings(): Promise<StudioAdvancedFillSettings>;
  saveAdvancedFillSettings(settings: StudioAdvancedFillSettings): Promise<void>;
  loadAssetFavorites(userId: string | null): Promise<StudioAssetFavoriteState>;
  saveAssetFavorites(userId: string | null, state: StudioAssetFavoriteState): Promise<void>;
  loadBooleanPreference(key: StudioUiBooleanPreferenceKey): Promise<boolean>;
  saveBooleanPreference(key: StudioUiBooleanPreferenceKey, value: boolean): Promise<void>;
  loadBackgroundRecent(): Promise<StudioBackgroundRecentState>;
  saveBackgroundRecent(state: StudioBackgroundRecentState): Promise<void>;
  loadEffectFavorites(): Promise<StudioEffectFavoriteState>;
  saveEffectFavorites(state: StudioEffectFavoriteState): Promise<void>;
  loadElementsRecent(): Promise<StudioElementsRecentState>;
  saveElementsRecent(state: StudioElementsRecentState): Promise<void>;
  loadPagePreviewSize(): Promise<StudioPagePreviewSize>;
  savePagePreviewSize(value: StudioPagePreviewSize): Promise<void>;
  loadRecentColors(): Promise<string[]>;
  saveRecentColors(colors: readonly string[]): Promise<void>;
  loadServerAiProvider(): Promise<StudioServerAiProviderPreference>;
  saveServerAiProvider(provider: StudioServerAiProviderPreference): Promise<void>;
}

function parseJson(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function normalizeServerAiProvider(value: unknown): StudioServerAiProviderPreference {
  return value === "zai" || value === "deepseek" ? value : "auto";
}

function assetFavoritesKey(userId: string | null): string {
  return `asset-favorites:${studioAssetFavoriteStorageKey(userId)}`;
}

export function normalizeStudioPagePreviewSize(value: unknown): StudioPagePreviewSize {
  return STUDIO_PAGE_PREVIEW_SIZE_VALUES.includes(value as StudioPagePreviewSize)
    ? value as StudioPagePreviewSize
    : "comfortable";
}

/**
 * Builds the preferences repository over the same SQLite/OPFS KV table used by
 * the rest of Studio. Writes are serialized so rapid UI gestures cannot let an
 * older async write overtake the newest preference.
 */
export function createStudioUiPreferencesRepository(
  store: StudioAsyncKeyValueStore,
): StudioUiPreferencesRepository {
  let writeTail: Promise<void> = Promise.resolve();
  const enqueue = (key: string, value: string): Promise<void> => {
    const operation = writeTail.then(() => store.set(key, value));
    writeTail = operation.catch(() => undefined);
    return operation;
  };

  return Object.freeze({
    authority: "sqlite-opfs" as const,
    async loadAppSettings() {
      return normalizeStudioAppSettings(parseJson(await store.get(APP_SETTINGS_KEY)));
    },
    saveAppSettings(settings: StudioAppSettings) {
      return enqueue(
        APP_SETTINGS_KEY,
        JSON.stringify(normalizeStudioAppSettings(settings)),
      );
    },
    async loadAdvancedFillSettings() {
      return normalizeStudioAdvancedFillSettings(
        parseJson(await store.get(ADVANCED_FILL_SETTINGS_KEY)),
      );
    },
    saveAdvancedFillSettings(settings: StudioAdvancedFillSettings) {
      return enqueue(
        ADVANCED_FILL_SETTINGS_KEY,
        JSON.stringify(normalizeStudioAdvancedFillSettings(settings)),
      );
    },
    async loadAssetFavorites(userId: string | null) {
      return normalizeStudioAssetFavoriteState(
        parseJson(await store.get(assetFavoritesKey(userId))),
      );
    },
    saveAssetFavorites(userId: string | null, state: StudioAssetFavoriteState) {
      return enqueue(
        assetFavoritesKey(userId),
        JSON.stringify(normalizeStudioAssetFavoriteState(state)),
      );
    },
    async loadBooleanPreference(key: StudioUiBooleanPreferenceKey) {
      return await store.get(`boolean:${key}`) === "1";
    },
    saveBooleanPreference(key: StudioUiBooleanPreferenceKey, value: boolean) {
      return enqueue(`boolean:${key}`, value ? "1" : "0");
    },
    async loadBackgroundRecent() {
      return normalizeStudioBackgroundRecentState(parseJson(await store.get(BACKGROUND_RECENT_KEY)));
    },
    saveBackgroundRecent(state: StudioBackgroundRecentState) {
      return enqueue(
        BACKGROUND_RECENT_KEY,
        JSON.stringify(normalizeStudioBackgroundRecentState(state)),
      );
    },
    async loadEffectFavorites() {
      return normalizeStudioEffectFavoriteState(parseJson(await store.get(EFFECT_FAVORITES_KEY)));
    },
    saveEffectFavorites(state: StudioEffectFavoriteState) {
      return enqueue(
        EFFECT_FAVORITES_KEY,
        JSON.stringify(normalizeStudioEffectFavoriteState(state)),
      );
    },
    async loadElementsRecent() {
      return normalizeStudioElementsRecentState(parseJson(await store.get(ELEMENTS_RECENT_KEY)));
    },
    saveElementsRecent(state: StudioElementsRecentState) {
      return enqueue(
        ELEMENTS_RECENT_KEY,
        JSON.stringify(normalizeStudioElementsRecentState(state)),
      );
    },
    async loadPagePreviewSize() {
      return normalizeStudioPagePreviewSize(await store.get(PAGE_PREVIEW_SIZE_KEY));
    },
    savePagePreviewSize(value: StudioPagePreviewSize) {
      return enqueue(PAGE_PREVIEW_SIZE_KEY, normalizeStudioPagePreviewSize(value));
    },
    async loadRecentColors() {
      return normalizeRecentColors(parseJson(await store.get(RECENT_COLORS_KEY)));
    },
    saveRecentColors(colors: readonly string[]) {
      return enqueue(RECENT_COLORS_KEY, JSON.stringify(normalizeRecentColors(colors)));
    },
    async loadServerAiProvider() {
      return normalizeServerAiProvider(await store.get(SERVER_AI_PROVIDER_KEY));
    },
    saveServerAiProvider(provider: StudioServerAiProviderPreference) {
      return enqueue(SERVER_AI_PROVIDER_KEY, normalizeServerAiProvider(provider));
    },
  });
}

let sharedRepository: Promise<StudioUiPreferencesRepository> | null = null;

export function acquireProductStudioUiPreferencesRepository(): Promise<StudioUiPreferencesRepository> {
  sharedRepository ??= acquireStudioUiPreferencesDatabase().then((database) =>
    createStudioUiPreferencesRepository(
      database.asAsyncKeyValueStore(STUDIO_UI_PREFERENCES_SQLITE_NAMESPACE),
    ));
  return sharedRepository;
}

/** Test/session seam; does not close the shared database owned by the app runtime. */
export function resetStudioUiPreferencesRepositoryForTests(): void {
  sharedRepository = null;
}
