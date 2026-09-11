export const STUDIO_ANALYTICS_EVENT_TYPES = [
  "episode-open",
  "scroll-depth",
  "episode-complete",
  "subscribe",
  "reaction",
  "revenue",
  "production-cost",
] as const;

export type StudioAnalyticsEventType =
  (typeof STUDIO_ANALYTICS_EVENT_TYPES)[number];

export interface StudioAnalyticsEvent {
  readonly id: string;
  readonly type: StudioAnalyticsEventType;
  readonly projectId: string;
  readonly episodeId: string;
  readonly locale: string;
  readonly anonymousSessionId: string;
  readonly occurredAt: string;
  readonly value: number | null;
  readonly amountMinor: number | null;
  readonly currency: string | null;
}

export interface StudioEpisodeAnalytics {
  readonly episodeId: string;
  readonly locale: string;
  readonly uniqueReaders: number;
  readonly opens: number;
  readonly completes: number;
  readonly completionRate: number;
  readonly averageMaxScrollDepth: number;
  readonly subscriptions: number;
  readonly reactions: number;
  readonly revenueMinor: number;
  readonly productionCostMinor: number;
  readonly netMinor: number;
  readonly currency: string | null;
}

export interface StudioAnalyticsReport {
  readonly projectId: string;
  readonly acceptedEventCount: number;
  readonly duplicateEventCount: number;
  readonly rejectedEventIds: readonly string[];
  readonly episodes: readonly StudioEpisodeAnalytics[];
}

function validEvent(event: StudioAnalyticsEvent): boolean {
  if (
    !event.id.trim()
    || !event.projectId.trim()
    || !event.episodeId.trim()
    || !event.locale.trim()
    || !event.anonymousSessionId.startsWith("anon:")
    || !Number.isFinite(Date.parse(event.occurredAt))
  ) {
    return false;
  }
  if (event.type === "scroll-depth") {
    return event.value !== null && Number.isFinite(event.value) && event.value >= 0 && event.value <= 1;
  }
  if (event.type === "revenue" || event.type === "production-cost") {
    return event.amountMinor !== null
      && Number.isSafeInteger(event.amountMinor)
      && event.amountMinor >= 0
      && typeof event.currency === "string"
      && event.currency.trim().length > 0;
  }
  return event.amountMinor === null;
}

interface MutableEpisodeAnalytics {
  episodeId: string;
  locale: string;
  readers: Set<string>;
  opens: number;
  completeSessions: Set<string>;
  scrollBySession: Map<string, number>;
  subscriptions: number;
  reactions: number;
  revenueMinor: number;
  productionCostMinor: number;
  currency: string | null;
}

function episodeKey(event: StudioAnalyticsEvent): string {
  return `${event.episodeId}\u0000${event.locale.toLowerCase()}`;
}

export function aggregateStudioAnalytics(
  events: readonly StudioAnalyticsEvent[],
): StudioAnalyticsReport {
  const projectIds = new Set(events.map((event) => event.projectId).filter(Boolean));
  if (projectIds.size > 1) throw new Error("Analytics aggregation requires one project.");
  const seenEventIds = new Set<string>();
  const rejectedEventIds: string[] = [];
  let duplicateEventCount = 0;
  let acceptedEventCount = 0;
  const episodeMap = new Map<string, MutableEpisodeAnalytics>();

  for (const event of events) {
    if (seenEventIds.has(event.id)) {
      duplicateEventCount += 1;
      continue;
    }
    seenEventIds.add(event.id);
    if (!validEvent(event)) {
      rejectedEventIds.push(event.id);
      continue;
    }
    acceptedEventCount += 1;
    const key = episodeKey(event);
    const current = episodeMap.get(key) ?? {
      episodeId: event.episodeId,
      locale: event.locale,
      readers: new Set<string>(),
      opens: 0,
      completeSessions: new Set<string>(),
      scrollBySession: new Map<string, number>(),
      subscriptions: 0,
      reactions: 0,
      revenueMinor: 0,
      productionCostMinor: 0,
      currency: null,
    };
    current.readers.add(event.anonymousSessionId);
    switch (event.type) {
      case "episode-open": current.opens += 1; break;
      case "scroll-depth": {
        const previous = current.scrollBySession.get(event.anonymousSessionId) ?? 0;
        current.scrollBySession.set(event.anonymousSessionId, Math.max(previous, event.value ?? 0));
        break;
      }
      case "episode-complete": current.completeSessions.add(event.anonymousSessionId); break;
      case "subscribe": current.subscriptions += 1; break;
      case "reaction": current.reactions += 1; break;
      case "revenue": {
        current.revenueMinor += event.amountMinor ?? 0;
        current.currency = event.currency;
        break;
      }
      case "production-cost": {
        current.productionCostMinor += event.amountMinor ?? 0;
        current.currency = event.currency;
        break;
      }
    }
    episodeMap.set(key, current);
  }

  const episodes = [...episodeMap.values()]
    .map((current): StudioEpisodeAnalytics => {
      const scrollValues = [...current.scrollBySession.values()];
      const uniqueReaders = current.readers.size;
      return Object.freeze({
        episodeId: current.episodeId,
        locale: current.locale,
        uniqueReaders,
        opens: current.opens,
        completes: current.completeSessions.size,
        completionRate: uniqueReaders === 0 ? 0 : current.completeSessions.size / uniqueReaders,
        averageMaxScrollDepth: scrollValues.length === 0
          ? 0
          : scrollValues.reduce((sum, value) => sum + value, 0) / scrollValues.length,
        subscriptions: current.subscriptions,
        reactions: current.reactions,
        revenueMinor: current.revenueMinor,
        productionCostMinor: current.productionCostMinor,
        netMinor: current.revenueMinor - current.productionCostMinor,
        currency: current.currency,
      });
    })
    .sort((left, right) => left.episodeId.localeCompare(right.episodeId)
      || left.locale.localeCompare(right.locale));

  return Object.freeze({
    projectId: [...projectIds][0] ?? "",
    acceptedEventCount,
    duplicateEventCount,
    rejectedEventIds: Object.freeze(rejectedEventIds),
    episodes: Object.freeze(episodes),
  });
}
