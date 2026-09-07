import { STUDIO_I18N_NAMESPACES } from "@/shared/lib/i18n-asset-manifest";
import {
  getLang,
  registerI18nLocaleEntries,
  triggerTranslationBundleUpdate,
} from "@/shared/lib/i18n-core";
import {
  getLocaleCandidates,
  normalizeLocaleCode,
} from "@/shared/lib/i18n-intl-utils";

import {
  parseStudioI18nDictionary,
  STUDIO_I18N_ASSET_LOCALES,
  studioI18nAssetUrl,
  type StudioI18nDictionary,
} from "./studio-i18n-loader";

export type StudioI18nNamespace = (typeof STUDIO_I18N_NAMESPACES)[number];

export const STUDIO_I18N_CORE_NAMESPACES = [
  "mainMenu",
  "canvas",
] as const satisfies readonly StudioI18nNamespace[];

const CORE_NAMESPACE_SET = new Set<StudioI18nNamespace>(
  STUDIO_I18N_CORE_NAMESPACES,
);

export const STUDIO_I18N_DEFERRED_NAMESPACES = STUDIO_I18N_NAMESPACES.filter(
  (namespace) => !CORE_NAMESPACE_SET.has(namespace),
);

export interface StudioI18nPriorityLoaderOptions {
  readonly locale?: string;
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
  readonly signal?: AbortSignal;
}

export interface StudioI18nLoadReport {
  readonly requestedLocale: string;
  readonly assetLocale: string;
  readonly loadedNamespaces: readonly StudioI18nNamespace[];
  readonly failedNamespaces: readonly StudioI18nNamespace[];
}

type NamespaceLoadResult =
  | { readonly status: "loaded"; readonly dictionary: StudioI18nDictionary }
  | { readonly status: "cached" }
  | { readonly status: "failed" };

interface IdleScheduler {
  requestIdleCallback?: (
    callback: () => void,
    options?: { readonly timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
}

const pendingNamespaceLoads = new Map<string, Promise<NamespaceLoadResult>>();
const resolvedNamespaceLoads = new Set<string>();

function resolveStudioAssetLocale(locale: string): string {
  const supported = STUDIO_I18N_ASSET_LOCALES as readonly string[];
  return getLocaleCandidates(locale).find((candidate) => supported.includes(candidate))
    ?? "en";
}

function namespaceLoadKey(
  assetLocale: string,
  namespace: StudioI18nNamespace,
  baseUrl: string | undefined,
): string {
  return `${baseUrl ?? import.meta.env.BASE_URL}|${assetLocale}|${namespace}`;
}

async function fetchStudioNamespace(
  assetLocale: string,
  namespace: StudioI18nNamespace,
  options: StudioI18nPriorityLoaderOptions,
): Promise<NamespaceLoadResult> {
  const key = namespaceLoadKey(assetLocale, namespace, options.baseUrl);
  if (resolvedNamespaceLoads.has(key)) return { status: "cached" };

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function" || options.signal?.aborted) {
    return { status: "failed" };
  }

  const execute = async (): Promise<NamespaceLoadResult> => {
    try {
      const response = await fetchImpl(
        studioI18nAssetUrl(assetLocale, options.baseUrl, namespace),
        {
          cache: "force-cache",
          credentials: "same-origin",
          signal: options.signal,
        },
      );
      if (!response.ok) return { status: "failed" };

      const dictionary = parseStudioI18nDictionary(await response.text());
      if (!dictionary) return { status: "failed" };

      resolvedNamespaceLoads.add(key);
      return { status: "loaded", dictionary };
    } catch {
      return { status: "failed" };
    }
  };

  // Abortable requests belong to one boot run and must not be shared with a later run.
  if (options.signal) return execute();

  const pending = pendingNamespaceLoads.get(key);
  if (pending) return pending;

  const job = execute();
  pendingNamespaceLoads.set(key, job);
  try {
    return await job;
  } finally {
    pendingNamespaceLoads.delete(key);
  }
}

export async function loadStudioI18nNamespaces(
  namespaces: readonly StudioI18nNamespace[],
  options: StudioI18nPriorityLoaderOptions = {},
): Promise<StudioI18nLoadReport> {
  const requestedLocale = options.locale ?? getLang();
  const assetLocale = resolveStudioAssetLocale(requestedLocale);
  const uniqueNamespaces = [...new Set(namespaces)];
  const results = await Promise.all(
    uniqueNamespaces.map(async (namespace) => ({
      namespace,
      result: await fetchStudioNamespace(assetLocale, namespace, options),
    })),
  );

  const merged: Record<string, string> = {};
  const loadedNamespaces: StudioI18nNamespace[] = [];
  const failedNamespaces: StudioI18nNamespace[] = [];

  for (const { namespace, result } of results) {
    if (result.status === "failed") {
      failedNamespaces.push(namespace);
      continue;
    }
    loadedNamespaces.push(namespace);
    if (result.status === "loaded") {
      Object.assign(merged, result.dictionary);
    }
  }

  if (Object.keys(merged).length > 0) {
    registerI18nLocaleEntries(assetLocale, merged);
    const normalizedRequestedLocale = normalizeLocaleCode(requestedLocale);
    if (
      normalizedRequestedLocale
      && normalizedRequestedLocale !== assetLocale
    ) {
      registerI18nLocaleEntries(normalizedRequestedLocale, merged);
    }
    triggerTranslationBundleUpdate();
  }

  return Object.freeze({
    requestedLocale,
    assetLocale,
    loadedNamespaces: Object.freeze(loadedNamespaces),
    failedNamespaces: Object.freeze(failedNamespaces),
  });
}

/** Starts only the strings needed by the first Studio shell and Canvas frame. */
export function preloadStudioI18nCore(
  options: StudioI18nPriorityLoaderOptions = {},
): Promise<StudioI18nLoadReport> {
  return loadStudioI18nNamespaces(STUDIO_I18N_CORE_NAMESPACES, options);
}

/** Loads panel and feature strings after the first Studio route has committed. */
export function loadStudioI18nDeferred(
  options: StudioI18nPriorityLoaderOptions = {},
): Promise<StudioI18nLoadReport> {
  return loadStudioI18nNamespaces(STUDIO_I18N_DEFERRED_NAMESPACES, options);
}

export function scheduleStudioI18nDeferredLoad(
  options: StudioI18nPriorityLoaderOptions = {},
): () => void {
  let active = true;
  const run = () => {
    if (!active || options.signal?.aborted) return;
    void loadStudioI18nDeferred(options);
  };

  const scheduler = globalThis as typeof globalThis & IdleScheduler;
  if (typeof scheduler.requestIdleCallback === "function") {
    const handle = scheduler.requestIdleCallback(run, { timeout: 2_000 });
    return () => {
      active = false;
      scheduler.cancelIdleCallback?.(handle);
    };
  }

  const handle: ReturnType<typeof setTimeout> = setTimeout(run, 250);
  return () => {
    active = false;
    clearTimeout(handle);
  };
}
