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

/**
 * The legacy runtime loader treats any registered `studio.*` entry as proof that a
 * route-owned Studio loader is managing the catalog. Registering this internal marker
 * synchronously prevents its old sequential full-catalog loop from racing the priority
 * loader while the first core network requests are still pending.
 */
export const STUDIO_I18N_MANAGED_SENTINEL_KEY =
  "studio.__priorityLoader.managed";
const STUDIO_I18N_MANAGED_SENTINEL_VALUE = "managed";

export const STUDIO_I18N_CORE_RETRY_DELAYS_MS = [
  500,
  2_000,
] as const;

export const STUDIO_I18N_DEFERRED_RETRY_DELAYS_MS = [
  1_000,
  4_000,
] as const;

export interface StudioI18nPriorityLoaderOptions {
  readonly locale?: string;
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
  readonly signal?: AbortSignal;
  /** Test/host override. An empty array disables retry after the first attempt. */
  readonly deferredRetryDelaysMs?: readonly number[];
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

function registerManagedStudioI18nLocale(
  requestedLocale: string,
  assetLocale: string,
): void {
  const marker = { [STUDIO_I18N_MANAGED_SENTINEL_KEY]: STUDIO_I18N_MANAGED_SENTINEL_VALUE };
  registerI18nLocaleEntries(assetLocale, marker);
  const normalizedRequestedLocale = normalizeLocaleCode(requestedLocale);
  if (
    normalizedRequestedLocale
    && normalizedRequestedLocale !== assetLocale
  ) {
    registerI18nLocaleEntries(normalizedRequestedLocale, marker);
  }
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

  // This happens before the first await. Route fallbacks that mount while the core
  // request is pending therefore cannot start the legacy sequential catalog loader.
  registerManagedStudioI18nLocale(requestedLocale, assetLocale);

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

function waitForStudioI18nRetry(
  delayMs: number,
  signal: AbortSignal | undefined,
): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(handle);
      resolve(false);
    };
    const handle = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Retries only namespaces that failed in a previous priority-load report. */
export async function retryFailedStudioI18nNamespaces(
  initialReport: StudioI18nLoadReport,
  options: StudioI18nPriorityLoaderOptions = {},
  retryDelays: readonly number[] = STUDIO_I18N_CORE_RETRY_DELAYS_MS,
): Promise<StudioI18nLoadReport> {
  let report = initialReport;
  for (const delayMs of retryDelays) {
    if (report.failedNamespaces.length === 0 || options.signal?.aborted) break;
    if (!await waitForStudioI18nRetry(delayMs, options.signal)) break;
    report = await loadStudioI18nNamespaces(report.failedNamespaces, options);
  }
  return report;
}

export function scheduleStudioI18nDeferredLoad(
  options: StudioI18nPriorityLoaderOptions = {},
): () => void {
  let active = true;
  let idleHandle: number | null = null;
  let delayHandle: ReturnType<typeof setTimeout> | null = null;
  const retryDelays = options.deferredRetryDelaysMs
    ?? STUDIO_I18N_DEFERRED_RETRY_DELAYS_MS;

  const clearDelay = () => {
    if (delayHandle === null) return;
    clearTimeout(delayHandle);
    delayHandle = null;
  };

  const runAttempt = async (
    namespaces: readonly StudioI18nNamespace[],
    attempt: number,
  ): Promise<void> => {
    if (!active || options.signal?.aborted || namespaces.length === 0) return;
    const report = await loadStudioI18nNamespaces(namespaces, options);
    if (
      !active
      || options.signal?.aborted
      || report.failedNamespaces.length === 0
      || attempt >= retryDelays.length
    ) {
      return;
    }

    const retryDelay = retryDelays[attempt];
    if (retryDelay === undefined) return;
    delayHandle = setTimeout(() => {
      delayHandle = null;
      void runAttempt(report.failedNamespaces, attempt + 1);
    }, retryDelay);
  };

  const run = () => {
    idleHandle = null;
    void runAttempt(STUDIO_I18N_DEFERRED_NAMESPACES, 0);
  };

  const scheduler = globalThis as typeof globalThis & IdleScheduler;
  if (typeof scheduler.requestIdleCallback === "function") {
    idleHandle = scheduler.requestIdleCallback(run, { timeout: 2_000 });
  } else {
    delayHandle = setTimeout(run, 250);
  }

  return () => {
    active = false;
    if (idleHandle !== null) scheduler.cancelIdleCallback?.(idleHandle);
    clearDelay();
  };
}
