#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def write(relative: str, content: str) -> None:
    (ROOT / relative).write_text(content, encoding="utf-8")


def replace_once(relative: str, old: str, new: str) -> None:
    source = read(relative)
    count = source.count(old)
    if count != 1:
        raise RuntimeError(
            f"{relative}: expected exactly one match, found {count}: {old[:140]!r}"
        )
    write(relative, source.replace(old, new, 1))


hook = "src/domains/market/hooks/use-market-social.ts"
replace_once(
    hook,
    '''  request: Promise<void> | null;
  controller: AbortController | null;
  viewerKey: string | null;
  browserCleanup: (() => void) | null;
}''',
    '''  request: Promise<void> | null;
  controller: AbortController | null;
  mutationController: AbortController | null;
  viewerKey: string | null;
  browserCleanup: (() => void) | null;
  lastTouchedAt: number;
}''',
)
replace_once(
    hook,
    '''const stores = new Map<string, MarketSocialStore>();
const CHANNEL_NAME = "toonspectrum:market-social:v1";''',
    '''const stores = new Map<string, MarketSocialStore>();
const MAX_MARKET_SOCIAL_STORES = 64;
const CHANNEL_NAME = "toonspectrum:market-social:v1";''',
)
replace_once(
    hook,
    '''    request: null,
    controller: null,
    viewerKey: null,
    browserCleanup: null,
  };
}

function getStore(resourceId: string): MarketSocialStore {
  const existing = stores.get(resourceId);
  if (existing) return existing;
  const created = createStore(resourceId);
  stores.set(resourceId, created);
  return created;
}''',
    '''    request: null,
    controller: null,
    mutationController: null,
    viewerKey: null,
    browserCleanup: null,
    lastTouchedAt: Date.now(),
  };
}

function touchStore(store: MarketSocialStore): void {
  store.lastTouchedAt = Date.now();
}

function disposeStore(store: MarketSocialStore): void {
  store.controller?.abort();
  store.mutationController?.abort();
  store.browserCleanup?.();
  stores.delete(store.resourceId);
}

function pruneInactiveStores(preserve?: MarketSocialStore): void {
  if (stores.size <= MAX_MARKET_SOCIAL_STORES) return;
  const candidates = [...stores.values()]
    .filter((store) =>
      store !== preserve
      && store.listeners.size === 0
      && !store.request
      && !store.snapshot.pendingAction
      && !store.mutationController
    )
    .sort((left, right) => left.lastTouchedAt - right.lastTouchedAt);
  while (stores.size > MAX_MARKET_SOCIAL_STORES) {
    const candidate = candidates.shift();
    if (!candidate) break;
    disposeStore(candidate);
  }
}

function setStoreViewerKey(
  store: MarketSocialStore,
  viewerKey: string,
): boolean {
  const changed = store.viewerKey !== viewerKey;
  store.viewerKey = viewerKey;
  touchStore(store);
  return changed;
}

function getStore(resourceId: string): MarketSocialStore {
  const existing = stores.get(resourceId);
  if (existing) {
    touchStore(existing);
    return existing;
  }
  const created = createStore(resourceId);
  stores.set(resourceId, created);
  pruneInactiveStores(created);
  return created;
}''',
)
replace_once(
    hook,
    '''function publish(
  store: MarketSocialStore,
  patch: Partial<MarketSocialSnapshot>,
): void {
  store.snapshot = { ...store.snapshot, ...patch };
  for (const listener of store.listeners) listener();
}''',
    '''function publish(
  store: MarketSocialStore,
  patch: Partial<MarketSocialSnapshot>,
): void {
  store.snapshot = { ...store.snapshot, ...patch };
  touchStore(store);
  for (const listener of store.listeners) listener();
}''',
)
replace_once(
    hook,
    '''function subscribe(store: MarketSocialStore, listener: () => void): () => void {
  if (store.listeners.size === 0) attachBrowserRefresh(store);
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
    if (store.listeners.size === 0) store.browserCleanup?.();
  };
}''',
    '''function subscribe(store: MarketSocialStore, listener: () => void): () => void {
  if (store.listeners.size === 0) attachBrowserRefresh(store);
  store.listeners.add(listener);
  touchStore(store);
  return () => {
    store.listeners.delete(listener);
    if (store.listeners.size === 0) store.browserCleanup?.();
    touchStore(store);
    pruneInactiveStores();
  };
}''',
)
replace_once(
    hook,
    '''  const controller = new AbortController();
  publish(store, { pendingAction: action, error: null });
  try {
    const data = await mutation(controller.signal);''',
    '''  const controller = new AbortController();
  store.mutationController = controller;
  publish(store, { pendingAction: action, error: null });
  try {
    const data = await mutation(controller.signal);''',
)
replace_once(
    hook,
    '''  } finally {
    if (store.snapshot.pendingAction === action) {
      publish(store, { pendingAction: null });
    }
  }
}''',
    '''  } finally {
    if (store.mutationController === controller) {
      store.mutationController = null;
    }
    if (store.snapshot.pendingAction === action) {
      publish(store, { pendingAction: null });
    }
    pruneInactiveStores();
  }
}''',
)
replace_once(
    hook,
    '''  useEffect(() => {
    const viewerChanged = store.viewerKey !== normalizedViewerKey;
    store.viewerKey = normalizedViewerKey;
    void loadStore(store, viewerChanged);
  }, [normalizedViewerKey, store]);''',
    '''  useEffect(() => {
    const viewerChanged = setStoreViewerKey(store, normalizedViewerKey);
    void loadStore(store, viewerChanged);
  }, [normalizedViewerKey, store]);''',
)
replace_once(
    hook,
    '''export function resetMarketSocialStoresForTests(): void {
  for (const store of stores.values()) {
    store.controller?.abort();
    store.browserCleanup?.();
  }
  stores.clear();
  broadcastChannel?.close();
  broadcastChannel = undefined;
}''',
    '''export function getMarketSocialStoreCountForTests(): number {
  return stores.size;
}

export function resetMarketSocialStoresForTests(): void {
  for (const store of [...stores.values()]) disposeStore(store);
  stores.clear();
  broadcastChannel?.close();
  broadcastChannel = undefined;
}''',
)

service = "apps/api/src/modules/creator-marketplace/creator-marketplace-social.service.ts"
replace_once(
    service,
    '''    return {
      id: row.userId,
      name: "삭제됨",
      avatar: null,
      badge: "member",
    };''',
    '''    return {
      id: "deleted",
      name: "삭제됨",
      avatar: null,
      badge: "member",
    };''',
)
replace_once(
    service,
    '''    const rootLimit = CREATOR_MARKETPLACE_SOCIAL_COMMENT_PAGE_SIZE;
    const reviewLimit = CREATOR_MARKETPLACE_SOCIAL_REVIEW_PAGE_SIZE;''',
    '''    const rootLimit = CREATOR_MARKETPLACE_SOCIAL_COMMENT_PAGE_SIZE;
    const replyLimit = rootLimit * 5;
    const reviewLimit = CREATOR_MARKETPLACE_SOCIAL_REVIEW_PAGE_SIZE;''',
)
replace_once(
    service,
    '''          .orderBy(asc(reviewReplies.createdAt), asc(reviewReplies.id))
          .limit(rootLimit + 1)
      : [];
    const replyPage = replyRows.slice(0, rootLimit);''',
    '''          .orderBy(asc(reviewReplies.createdAt), asc(reviewReplies.id))
          .limit(replyLimit + 1)
      : [];
    const replyPage = replyRows.slice(0, replyLimit);''',
)
replace_once(
    service,
    '''        comments: rootRows.length > rootLimit
          || replyRows.length > rootLimit
          || totalCommentCount > commentRows.length,''',
    '''        comments: rootRows.length > rootLimit
          || replyRows.length > replyLimit
          || totalCommentCount > commentRows.length,''',
)

hook_test = "src/domains/market/hooks/use-market-social.test.tsx"
replace_once(
    hook_test,
    '''import {
  resetMarketSocialStoresForTests,
  useMarketSocial,
} from "./use-market-social";''',
    '''import {
  getMarketSocialStoreCountForTests,
  resetMarketSocialStoresForTests,
  useMarketSocial,
} from "./use-market-social";''',
)
replace_once(
    hook_test,
    '''  it("revalidates after returning focus from Studio", async () => {
    const hook = renderHook(() => useMarketSocial(RESOURCE_ID, "viewer-1"));
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));

    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(mocks.getPage).toHaveBeenCalledTimes(2));
    hook.unmount();
  });
});''',
    '''  it("revalidates after returning focus from Studio", async () => {
    const hook = renderHook(() => useMarketSocial(RESOURCE_ID, "viewer-1"));
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));

    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(mocks.getPage).toHaveBeenCalledTimes(2));
    hook.unmount();
  });

  it("revalidates viewer changes through the external-store boundary", async () => {
    const hook = renderHook(
      ({ viewerKey }) => useMarketSocial(RESOURCE_ID, viewerKey),
      { initialProps: { viewerKey: "viewer-1" } },
    );
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));

    hook.rerender({ viewerKey: "viewer-2" });
    await waitFor(() => expect(mocks.getPage).toHaveBeenCalledTimes(2));
    hook.unmount();
  });

  it("bounds inactive resource stores without evicting subscribed stores", async () => {
    const active = renderHook(() => useMarketSocial(RESOURCE_ID, "viewer-1"));
    await waitFor(() => expect(active.result.current.status).toBe("ready"));

    for (let index = 0; index < 72; index += 1) {
      const resourceId = `resource-${String(index).padStart(3, "0")}`;
      const transient = renderHook(() => useMarketSocial(resourceId, "viewer-1"));
      await waitFor(() => expect(transient.result.current.status).toBe("ready"));
      transient.unmount();
    }

    expect(getMarketSocialStoreCountForTests()).toBeLessThanOrEqual(64);
    expect(active.result.current.status).toBe("ready");
    active.unmount();
  });
});''',
)

boundary_test = "apps/api/src/modules/creator-marketplace/creator-marketplace-social-boundary.test.ts"
replace_once(
    boundary_test,
    '''    expect(hook).toContain('window.addEventListener("pageshow", refresh)');
  });''',
    '''    expect(hook).toContain('window.addEventListener("pageshow", refresh)');
    expect(hook).toContain("function setStoreViewerKey(");
    expect(hook).toContain("MAX_MARKET_SOCIAL_STORES = 64");
    expect(hook).toContain("store.mutationController?.abort()");
    const effect = hook.slice(hook.indexOf("useEffect(() => {"), hook.indexOf("const refresh = useCallback"));
    expect(effect).not.toContain("store.viewerKey =");
  });''',
)
replace_once(
    boundary_test,
    '''  it("registers the social runtime and blocks self-helpful inflation", () => {
    expect(moduleSource).toContain("CreatorMarketplaceSocialController");''',
    '''  it("registers the social runtime, anonymizes deleted authors, and bounds replies", () => {
    expect(moduleSource).toContain("CreatorMarketplaceSocialController");
    expect(service).toContain('id: "deleted"');
    expect(service).toContain("const replyLimit = rootLimit * 5");
    expect(service).toContain(".limit(replyLimit + 1)");''',
)

for relative, forbidden in (
    (hook, "store.viewerKey = normalizedViewerKey;"),
    (service, "id: row.userId,\n      name: \"삭제됨\""),
):
    if forbidden in read(relative):
        raise RuntimeError(f"{relative}: stale unsafe marker remains: {forbidden}")

print("Applied marketplace social quality finalization")
