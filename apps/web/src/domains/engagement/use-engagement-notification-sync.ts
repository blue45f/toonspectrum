import { useEffect, useMemo } from "react";

import type { EngagementNotification } from "./engagement-model";
import { useEngagement } from "./engagement-store";

import type { Title } from "@/shared/lib/types";
import type { CreatorMarketplaceCloudLibraryItem } from "@/shared/lib/creator-marketplace-cloud-library-contract";

import { useSession } from "@/compat/auth-session-store";
import { getProductionPersonalInbox } from "@/domains/creator/production-hub/production-api";
import { useApp } from "@/shared/lib/store";
import { listCreatorMarketplaceCloudLibrary } from "@/platform/creator-marketplace-client";

const TITLE_CHUNK_SIZE = 80;

async function fetchTitles(ids: readonly string[], signal: AbortSignal): Promise<Title[]> {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += TITLE_CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + TITLE_CHUNK_SIZE));
  }
  const responses = await Promise.all(chunks.map(async (chunk) => {
    const response = await fetch(`/api/titles?ids=${encodeURIComponent(chunk.join(","))}`, {
      cache: "no-store",
      signal,
    });
    if (!response.ok) return [] as Title[];
    const payload = await response.json() as { items?: Title[] };
    return Array.isArray(payload.items) ? payload.items : [];
  }));
  return responses.flat();
}

function productionNotification(
  item: Awaited<ReturnType<typeof getProductionPersonalInbox>>["items"][number],
): EngagementNotification {
  const href = item.episodeId
    ? `/production/projects/${encodeURIComponent(item.projectId)}/episodes/${encodeURIComponent(item.episodeId)}`
    : `/production/projects/${encodeURIComponent(item.projectId)}/overview`;
  const due = item.dueAt && Number.isFinite(Date.parse(item.dueAt))
    ? new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      .format(new Date(item.dueAt))
    : "기한 미정";
  return {
    id: `production:${item.projectId}:${item.taskId}:${item.bucket}`,
    category: "production",
    title: item.taskTitle,
    body: `${item.projectTitle} · ${due} · ${item.status}`,
    href,
    createdAt: item.dueAt && Number.isFinite(Date.parse(item.dueAt))
      ? item.dueAt
      : new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
    readAt: null,
    archivedAt: null,
    snoozedUntil: null,
    sourceKey: `production-inbox:${item.projectId}:${item.taskId}:${item.bucket}`,
  };
}


async function listMarketUpdates(signal: AbortSignal): Promise<readonly CreatorMarketplaceCloudLibraryItem[]> {
  const updates: CreatorMarketplaceCloudLibraryItem[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  while (!signal.aborted) {
    const page = await listCreatorMarketplaceCloudLibrary({
      view: "active",
      limit: 50,
      cursor,
    }, signal);
    updates.push(...page.items.filter((item) => item.updateState === "account-confirmed-update-available"));
    if (!page.hasMore || !page.nextCursor || seen.has(page.nextCursor)) return updates;
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  return updates;
}

function marketNotification(item: CreatorMarketplaceCloudLibraryItem): EngagementNotification | null {
  if (item.catalog.state !== "available" || item.updateState !== "account-confirmed-update-available") return null;
  const installed = item.confirmation.state === "confirmed"
    ? item.confirmation.resourceVersion
    : item.addedFrom.resourceVersion;
  const createdAt = item.confirmation.state === "confirmed"
    ? item.confirmation.lastConfirmedAt
    : item.addedAt;
  return {
    id: `market-update:${item.logicalPackId}:${item.catalog.head.id}`,
    category: "market",
    title: `${item.name} 업데이트 가능`,
    body: `설치 확인 v${installed} → 최신 v${item.catalog.head.resourceVersion}`,
    href: `/market/resource/${encodeURIComponent(item.catalog.head.id)}`,
    createdAt,
    readAt: null,
    archivedAt: null,
    snoozedUntil: null,
    sourceKey: `market-library-update:${item.logicalPackId}`,
  };
}

/** Synchronize durable reader signals and the authenticated production inbox into one presentation inbox. */
export function useEngagementNotificationSync(): void {
  const subscriptions = useApp((state) => state.subscriptions);
  const { ready, status } = useSession();
  const syncReleaseNotifications = useEngagement((state) => state.syncReleaseNotifications);
  const replaceNotificationsBySourcePrefix = useEngagement(
    (state) => state.replaceNotificationsBySourcePrefix,
  );

  const subscriptionIds = useMemo(
    () => Object.entries(subscriptions)
      .filter(([, enabled]) => enabled)
      .map(([titleId]) => titleId)
      .sort((left, right) => left.localeCompare(right)),
    [subscriptions],
  );
  const subscriptionKey = subscriptionIds.join(",");

  useEffect(() => {
    if (!subscriptionKey) return;
    const controller = new AbortController();
    void fetchTitles(subscriptionIds, controller.signal)
      .then((titles) => syncReleaseNotifications(titles))
      .catch(() => undefined);
    return () => controller.abort();
  }, [subscriptionIds, subscriptionKey, syncReleaseNotifications]);

  useEffect(() => {
    if (!ready || status !== "authenticated") {
      replaceNotificationsBySourcePrefix("production-inbox:", []);
      return;
    }
    let active = true;
    void getProductionPersonalInbox()
      .then((response) => {
        if (!active) return;
        replaceNotificationsBySourcePrefix(
          "production-inbox:",
          response.items.map(productionNotification),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [ready, replaceNotificationsBySourcePrefix, status]);

  useEffect(() => {
    if (!ready || status !== "authenticated") {
      replaceNotificationsBySourcePrefix("market-library-update:", []);
      return;
    }
    const controller = new AbortController();
    void listMarketUpdates(controller.signal)
      .then((items) => replaceNotificationsBySourcePrefix(
        "market-library-update:",
        items.flatMap((item) => {
          const notification = marketNotification(item);
          return notification ? [notification] : [];
        }),
      ))
      .catch(() => undefined);
    return () => controller.abort();
  }, [ready, replaceNotificationsBySourcePrefix, status]);
}
