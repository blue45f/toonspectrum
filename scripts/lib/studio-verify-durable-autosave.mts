/**
 * scripts/lib/studio-verify-durable-autosave.mts
 *
 * Shared durable-autosave access for the `scripts/verify-studio-*` browser verifiers.
 *
 * Studio recovers the newest snapshot or tombstone from its OPFS recovery journal and
 * worker-owned SQLite store. A pointerup SQLite receipt can survive page teardown while the
 * Window-side journal write is interrupted, so observing only OPFS can report false data loss. The legacy
 * `toonspectrum-studio-autosave*` localStorage JSON slot is no longer written and is
 * tombstoned on every durable save — `verify:studio-lifecycle` asserts that zero browser
 * compatibility records survive a save — so a verifier that enumerates localStorage reads
 * an empty store forever.
 *
 * These helpers reach both stores through their shipped readers, located
 * among the bundle chunks the page already loaded (the same discovery
 * `scripts/verify-studio-native-raster-tools.mts` uses). Nothing here re-implements the
 * journal's on-disk format and nothing here needs a product-only test hook.
 *
 * Import with an explicit `.mjs` specifier — `./lib/studio-verify-durable-autosave.mjs`.
 * tsx needs an explicit extension to resolve an `.mts` module at runtime, and tsc/Vite map
 * the `.mjs` specifier back to this `.mts` source without `allowImportingTsExtensions`.
 */
import type { Page } from "playwright";

/** One persisted page record, exactly as the shipped autosave payload stores it. */
export interface StudioDurableAutosavePageRecord {
  id?: unknown;
  elements?: unknown[];
  groups?: unknown[];
}

/** The newest durable autosave document, normalized by the shipped session module. */
export interface StudioDurableAutosaveDocument {
  /** Autosave document key the payload was read under. */
  readonly key: string;
  /** Serialized payload — the durable equivalent of the old localStorage JSON slot. */
  readonly raw: string;
  readonly savedAt: string;
  readonly currentPageId: string | null;
  readonly pagesList: readonly StudioDurableAutosavePageRecord[];
}

const BRIDGE_GLOBAL = "__studioVerifyDurableAutosaveBridge";

export interface StudioDurableAutosaveCandidate {
  readonly authority: "opfs-journal" | "sqlite-fallback";
  readonly state: "snapshot" | "cleared";
  readonly savedAt: string;
  readonly payload?: Record<string, unknown>;
}

/** Same ordering as product recovery: newest timestamp, tombstone, then OPFS on an exact tie. */
export function selectDurableStudioAutosaveCandidate(
  candidates: readonly StudioDurableAutosaveCandidate[],
): StudioDurableAutosaveCandidate | null {
  return [...candidates].sort((left, right) =>
    Date.parse(right.savedAt) - Date.parse(left.savedAt)
    || Number(right.state === "cleared") - Number(left.state === "cleared")
    || Number(right.authority === "opfs-journal") - Number(left.authority === "opfs-journal")
  )[0] ?? null;
}

/**
 * Install the page-side bridge that locates the shipped autosave session chunk and hands
 * out document-scoped sessions. Idempotent: repeated calls reuse the resolved module and
 * the already opened sessions, so a polling verifier pays the discovery cost once.
 */
async function installBridge(
  page: Page,
  moduleUrl: string | null,
  sqliteModuleUrl: string | null = null,
): Promise<void> {
  await page.evaluate(
    ({ globalName, presetModuleUrl, presetSqliteModuleUrl }) => {
      interface AutosaveSession {
        readLatest: () => Promise<
          | { state: "snapshot"; savedAt: string; payload: Record<string, unknown> }
          | { state: "cleared"; savedAt: string }
          | null
        >;
        write: (payload: Record<string, unknown>) => Promise<unknown>;
        dispose: () => Promise<void>;
      }
      interface AutosaveSqliteStore {
        read: (key: string) => ReturnType<AutosaveSession["readLatest"]>;
      }
      type AutosaveSessionFactory = (
        key: string,
        scope?: unknown,
        options?: { readOnly?: boolean },
      ) => Promise<AutosaveSession | null>;
      interface AutosaveRuntime {
        createStudioAutosaveOpfsSession?: AutosaveSessionFactory;
      }
      interface AutosaveBridge {
        moduleUrl: string | null;
        sqliteModuleUrl: string | null;
        sqlite: Promise<AutosaveSqliteStore> | null;
        resolveSqliteModuleUrl: () => Promise<string | null>;
        openSqlite: () => Promise<AutosaveSqliteStore>;
        lastError: string | null;
        runtime: Promise<AutosaveRuntime> | null;
        factory: Promise<AutosaveSessionFactory> | null;
        sessions: Map<string, Promise<AutosaveSession | null>>;
        resolveModuleUrl: () => Promise<string | null>;
        resolveFactory: () => Promise<AutosaveSessionFactory>;
        open: (key: string, readOnly: boolean) => Promise<AutosaveSession | null>;
      }
      const holder = window as typeof window & Record<string, unknown>;
      const existing = holder[globalName] as AutosaveBridge | undefined;
      if (existing) {
        if (presetModuleUrl && !existing.moduleUrl) existing.moduleUrl = presetModuleUrl;
        if (presetSqliteModuleUrl && !existing.sqliteModuleUrl) {
          existing.sqliteModuleUrl = presetSqliteModuleUrl;
        }
        return;
      }

      const bridge: AutosaveBridge = {
        moduleUrl: presetModuleUrl,
        sqliteModuleUrl: presetSqliteModuleUrl,
        sqlite: null,
        async resolveSqliteModuleUrl() {
          if (bridge.sqliteModuleUrl) return bridge.sqliteModuleUrl;
          const urls = [
            ...performance.getEntriesByType("resource").map((entry) => entry.name),
            ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]'))
              .map((link) => link.href),
          ].filter((url) => url.startsWith(window.location.origin));
          let found = urls.find((url) =>
            /\/assets\/studio-autosave-sqlite-store-[A-Za-z0-9_-]+\.js(?:\?.*)?$/u.test(url)
          ) ?? null;
          if (!found && urls.some((url) => url.includes("/@vite/client"))) {
            found = new URL("/src/domains/creator/studio-autosave-sqlite-store.ts", window.location.origin).href;
          }
          if (!found) {
            const editorUrl = urls.find((url) =>
              /\/assets\/(?:StudioPage|studio-legacy-editor-adapter)-[A-Za-z0-9_-]+\.js(?:\?.*)?$/u.test(url)
            );
            if (editorUrl) {
              const source = await fetch(editorUrl).then((response) => response.text());
              const match = source.match(/\.\/studio-autosave-sqlite-store-[A-Za-z0-9_-]+\.js/u);
              if (match) found = new URL(match[0], editorUrl).href;
            }
          }
          bridge.sqliteModuleUrl = found;
          return found;
        },
        openSqlite() {
          bridge.sqlite ??= (async () => {
            const url = await bridge.resolveSqliteModuleUrl();
            if (!url) throw new Error("the shipped SQLite autosave store chunk was not found");
            const runtime = await import(url) as Record<string, unknown>;
            for (const exported of [runtime, ...Object.values(runtime)]) {
              const namespace = await Promise.resolve(exported) as {
                acquireStudioAutosaveSqliteStore?: () => Promise<AutosaveSqliteStore>;
              } | null;
              if (typeof namespace?.acquireStudioAutosaveSqliteStore === "function") {
                return namespace.acquireStudioAutosaveSqliteStore();
              }
            }
            throw new Error(`no SQLite autosave store export was found in ${url}`);
          })();
          bridge.sqlite.catch(() => { bridge.sqlite = null; });
          return bridge.sqlite;
        },
        lastError: null,
        runtime: null,
        factory: null,
        sessions: new Map(),
        async resolveModuleUrl() {
          if (bridge.moduleUrl) return bridge.moduleUrl;
          const resourceUrls = performance.getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter((url) => url.startsWith(window.location.origin));
          let found = resourceUrls.find((url) =>
            /\/assets\/studio-autosave-opfs-session-[A-Za-z0-9_-]+\.js(?:\?.*)?$/u.test(url)
          ) ?? resourceUrls.find((url) =>
            /\/src\/domains\/creator\/studio-autosave-opfs-session\.ts(?:\?.*)?$/u.test(url)
          ) ?? null;
          if (!found && resourceUrls.some((url) => url.includes("/@vite/client"))) {
            found = new URL(
              "/src/domains/creator/studio-autosave-opfs-session.ts",
              window.location.origin,
            ).href;
          }
          if (!found) {
            // The session chunk is loaded lazily with the durable autosave runtime; before
            // that lands, follow the StudioPage chunk's own import specifier.
            const studioPageUrl = resourceUrls.find((url) =>
              /\/assets\/StudioPage-[A-Za-z0-9_-]+\.js(?:\?.*)?$/u.test(url)
            );
            if (studioPageUrl) {
              const source = await fetch(studioPageUrl).then((response) => response.text());
              const match = source.match(
                /\.\/studio-autosave-opfs-session-[A-Za-z0-9_-]+\.js/u,
              );
              if (match) found = new URL(match[0], studioPageUrl).href;
            }
          }
          bridge.moduleUrl = found;
          return found;
        },
        resolveFactory() {
          bridge.factory ??= (async () => {
            const url = await bridge.resolveModuleUrl();
            if (!url) {
              throw new Error(
                "the shipped studio-autosave-opfs-session chunk was not found on this page",
              );
            }
            bridge.runtime ??= import(url) as Promise<AutosaveRuntime>;
            const runtime = await bridge.runtime;
            const named = runtime.createStudioAutosaveOpfsSession;
            if (typeof named === "function") return named;
            // A production chunk renames every top-level export
            // (`export{ee as i,S as n,x as r,L as t}`), so a name lookup only works on a dev
            // server. Studio itself reaches this module through
            // `import(chunk).then(module => module.n)` — one of those mangled exports is a
            // namespace object that still carries the authored property names, which is what
            // keeps the app's own destructuring readable. Take the same door.
            for (const exported of Object.values(runtime)) {
              const factory = await Promise.resolve(exported as AutosaveRuntime)
                .then((namespace) => namespace?.createStudioAutosaveOpfsSession)
                .catch(() => undefined);
              if (typeof factory === "function") return factory;
            }
            throw new Error(
              `no autosave session factory export was found in ${url}`,
            );
          })();
          return bridge.factory;
        },
        async open(key, readOnly) {
          const cacheKey = `${readOnly ? "reader" : "writer"}:${key}`;
          const cached = bridge.sessions.get(cacheKey);
          if (cached) return cached;
          const opened = (async () => {
            const factory = await bridge.resolveFactory();
            return factory(key, undefined, { readOnly });
          })();
          bridge.sessions.set(cacheKey, opened);
          // A rejected open must not be cached: a polling reader has to be able to retry
          // through a transient journal failure.
          opened.catch(() => bridge.sessions.delete(cacheKey));
          return opened;
        },
      };
      holder[globalName] = bridge;
    },
    { globalName: BRIDGE_GLOBAL, presetModuleUrl: moduleUrl, presetSqliteModuleUrl: sqliteModuleUrl },
  );
}

/**
 * Read the newest OPFS/SQLite durable autosave document for `autosaveKey`.
 *
 * Returns `null` when the document has never been written, when the shipped session
 * reports a `cleared` tombstone, and when a concurrent writer is publishing the next
 * immutable head — the last case stores its cause for {@link readDurableStudioAutosaveError}
 * so a polling caller can keep retrying and still report why it never settled.
 */
export async function readDurableStudioAutosaveDocument(
  page: Page,
  autosaveKey: string,
  options: { readonly moduleUrl?: string | null; readonly sqliteModuleUrl?: string | null } = {},
): Promise<StudioDurableAutosaveDocument | null> {
  await installBridge(page, options.moduleUrl ?? null, options.sqliteModuleUrl ?? null);
  const candidates = await page.evaluate(
    async ({ globalName, key }): Promise<StudioDurableAutosaveCandidate[]> => {
      type StoredAutosave = Omit<StudioDurableAutosaveCandidate, "authority"> | null;
      interface AutosaveBridge {
        lastError: string | null;
        open: (key: string, readOnly: boolean) => Promise<{
          readLatest: () => Promise<StoredAutosave>;
        } | null>;
        openSqlite: () => Promise<{ read: (key: string) => Promise<StoredAutosave> }>;
      }
      const bridge = (window as typeof window & Record<string, unknown>)[globalName] as AutosaveBridge;
      // The product may finish its worker-owned SQLite write while document teardown interrupts
      // Window's journal write. Read both shipped authorities; never reconcile/migrate while auditing.
      const outcomes = await Promise.allSettled([
        bridge.open(key, true).then(async (session) => {
          const latest = await session?.readLatest() ?? null;
          return latest ? { ...latest, authority: "opfs-journal" as const } : null;
        }),
        bridge.openSqlite().then(async (sqlite) => {
          const latest = await sqlite.read(key);
          return latest ? { ...latest, authority: "sqlite-fallback" as const } : null;
        }),
      ]);
      const candidates = outcomes.flatMap((outcome) =>
        outcome.status === "fulfilled" && outcome.value ? [outcome.value] : []
      );
      bridge.lastError = candidates.length > 0 ? null : outcomes
        .flatMap((outcome) => outcome.status === "rejected" ? [String(outcome.reason)] : [])
        .join("; ") || null;
      return candidates;
    },
    { globalName: BRIDGE_GLOBAL, key: autosaveKey },
  );
  const latest = selectDurableStudioAutosaveCandidate(candidates);
  if (latest?.state !== "snapshot" || !Array.isArray(latest.payload?.pagesList)) return null;
  const payload = latest.payload;
  return {
    key: autosaveKey,
    raw: JSON.stringify(payload),
    savedAt: typeof payload.savedAt === "string" ? payload.savedAt : latest.savedAt,
    currentPageId: typeof payload.currentPageId === "string" ? payload.currentPageId : null,
    pagesList: payload.pagesList as StudioDurableAutosavePageRecord[],
  };
}

/** Cause of the most recent failed durable read on this page, if there was one. */
export async function readDurableStudioAutosaveError(page: Page): Promise<string | null> {
  return page.evaluate((globalName) => {
    const bridge = (window as typeof window & Record<string, unknown>)[globalName] as
      | { lastError: string | null }
      | undefined;
    return bridge?.lastError ?? null;
  }, BRIDGE_GLOBAL);
}

/**
 * URL of the shipped autosave session chunk this page resolved, so a sibling page on the
 * same origin — one that never mounted Studio and therefore never loaded the chunk — can
 * be handed the same module.
 */
export async function resolveDurableStudioAutosaveModuleUrl(
  page: Page,
): Promise<string | null> {
  await installBridge(page, null);
  return page.evaluate(async (globalName) => {
    const bridge = (window as typeof window & Record<string, unknown>)[globalName] as {
      resolveModuleUrl: () => Promise<string | null>;
    };
    return bridge.resolveModuleUrl();
  }, BRIDGE_GLOBAL);
}

/** Preserve this URL before navigation, just as for the OPFS session module. */
export async function resolveDurableStudioAutosaveSqliteModuleUrl(page: Page): Promise<string | null> {
  await installBridge(page, null);
  return page.evaluate(async (globalName) => {
    const bridge = (window as typeof window & Record<string, unknown>)[globalName] as {
      resolveSqliteModuleUrl: () => Promise<string | null>;
    };
    return bridge.resolveSqliteModuleUrl();
  }, BRIDGE_GLOBAL);
}

/**
 * Write `raw` (a serialized autosave payload from
 * {@link readDurableStudioAutosaveDocument}) into this page's OPFS autosave journal.
 *
 * OPFS is BrowserContext-scoped and Playwright's `storageState` carries only cookies and
 * localStorage, so transplanting a fixture into a second context needs the document to be
 * re-persisted through the shipped writer. Run this on a page that has NOT mounted Studio:
 * the editor owns the document's writer lease while it is open.
 */
export async function seedDurableStudioAutosaveDocument(
  page: Page,
  autosaveKey: string,
  raw: string,
  moduleUrl: string | null,
): Promise<void> {
  await installBridge(page, moduleUrl);
  const failure = await page.evaluate(
    async ({ globalName, key, serialized }): Promise<string | null> => {
      interface AutosaveSession {
        write: (payload: Record<string, unknown>) => Promise<unknown>;
        dispose: () => Promise<void>;
      }
      interface AutosaveBridge {
        open: (key: string, readOnly: boolean) => Promise<AutosaveSession | null>;
      }
      const bridge = (window as typeof window & Record<string, unknown>)[
        globalName
      ] as AutosaveBridge;
      let session: AutosaveSession | null = null;
      try {
        session = await bridge.open(key, false);
        if (!session) return "the shipped autosave session refused to open for writing";
        await session.write(JSON.parse(serialized) as Record<string, unknown>);
        return null;
      } catch (error) {
        return String(error);
      } finally {
        // Hand the writer lease back before the editor opens the same document.
        await session?.dispose().catch(() => undefined);
      }
    },
    { globalName: BRIDGE_GLOBAL, key: autosaveKey, serialized: raw },
  );
  if (failure) throw new Error(`durable autosave seeding failed: ${failure}`);
}
