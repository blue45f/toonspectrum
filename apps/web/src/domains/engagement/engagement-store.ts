import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  availabilitySnapshotFingerprint,
  availabilitySnapshotOf,
  diffAvailabilitySnapshots,
  incrementGrowthMetric,
  releaseNotificationForTitle,
  zeroGrowthMetrics,
  type AvailabilityHistoryRecord,
  type EngagementNotification,
  type GrowthExperiment,
  type GrowthExperimentStatus,
  type GrowthMetricEvent,
  type ReadingDiaryEntry,
  type TastePreferences,
} from "./engagement-model";

import type { Title } from "@/shared/lib/types";

const MAX_NOTIFICATIONS = 500;
const MAX_DIARY_ENTRIES = 1_000;
const MAX_AVAILABILITY_EVENTS = 24;
const MAX_EXPERIMENTS = 100;

function newId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}:${random}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function trimNotifications(values: readonly EngagementNotification[]): EngagementNotification[] {
  return [...values]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, MAX_NOTIFICATIONS);
}

function upsertNotificationList(
  current: readonly EngagementNotification[],
  incoming: readonly EngagementNotification[],
): EngagementNotification[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    const previous = byId.get(item.id);
    byId.set(item.id, previous
      ? {
          ...item,
          readAt: previous.readAt,
          archivedAt: previous.archivedAt,
          snoozedUntil: previous.snoozedUntil,
        }
      : item);
  }
  return trimNotifications([...byId.values()]);
}

export interface ReadingDiaryInput {
  readonly id?: string;
  readonly titleId: string;
  readonly episode: number | null;
  readonly totalEpisodes: number | null;
  readonly readAt: string;
  readonly mood: ReadingDiaryEntry["mood"];
  readonly note: string;
  readonly spoiler: boolean;
  readonly reread: boolean;
  readonly platformId: ReadingDiaryEntry["platformId"];
}

export interface GrowthExperimentInput {
  readonly projectId: string;
  readonly name: string;
  readonly hypothesis: string;
  readonly minimumSample: number;
  readonly primaryMetric: GrowthExperiment["primaryMetric"];
  readonly variantLabels: readonly string[];
}

export interface EngagementState {
  readonly notifications: readonly EngagementNotification[];
  readonly diaryEntries: readonly ReadingDiaryEntry[];
  readonly tastePreferences: TastePreferences | null;
  readonly availabilityHistory: Readonly<Record<string, AvailabilityHistoryRecord>>;
  readonly growthExperiments: readonly GrowthExperiment[];

  readonly upsertNotifications: (items: readonly EngagementNotification[]) => void;
  readonly replaceNotificationsBySourcePrefix: (prefix: string, items: readonly EngagementNotification[]) => void;
  readonly markNotificationRead: (id: string, read?: boolean) => void;
  readonly markAllNotificationsRead: () => void;
  readonly archiveNotification: (id: string) => void;
  readonly snoozeNotification: (id: string, until: string | null) => void;
  readonly deleteArchivedNotifications: () => void;
  readonly syncReleaseNotifications: (titles: readonly Title[], now?: Date) => void;

  readonly saveDiaryEntry: (input: ReadingDiaryInput) => string;
  readonly deleteDiaryEntry: (id: string) => void;
  readonly setTastePreferences: (preferences: TastePreferences) => void;
  readonly clearTastePreferences: () => void;
  readonly observeAvailability: (title: Title, observedAt?: string) => void;

  readonly createGrowthExperiment: (input: GrowthExperimentInput) => string;
  readonly updateGrowthExperimentStatus: (id: string, status: GrowthExperimentStatus) => void;
  readonly recordGrowthMetric: (experimentId: string, variantId: string, metric: GrowthMetricEvent) => void;
  readonly deleteGrowthExperiment: (id: string) => void;
  readonly resetEngagementData: () => void;
}

const EMPTY_STATE = {
  notifications: [] as EngagementNotification[],
  diaryEntries: [] as ReadingDiaryEntry[],
  tastePreferences: null as TastePreferences | null,
  availabilityHistory: {} as Record<string, AvailabilityHistoryRecord>,
  growthExperiments: [] as GrowthExperiment[],
};

export const useEngagement = create<EngagementState>()(
  persist(
    (set, get) => ({
      ...EMPTY_STATE,

      upsertNotifications: (items) => {
        if (items.length === 0) return;
        set((state) => ({
          notifications: upsertNotificationList(state.notifications, items),
        }));
      },
      replaceNotificationsBySourcePrefix: (prefix, items) => {
        if (!prefix) return;
        const incomingIds = new Set(items.map((item) => item.id));
        set((state) => ({
          notifications: upsertNotificationList(
            state.notifications.filter((item) => (
              !item.sourceKey.startsWith(prefix) || incomingIds.has(item.id)
            )),
            items,
          ),
        }));
      },
      markNotificationRead: (id, read = true) => set((state) => ({
        notifications: state.notifications.map((item) => item.id === id
          ? { ...item, readAt: read ? nowIso() : null }
          : item),
      })),
      markAllNotificationsRead: () => {
        const at = nowIso();
        set((state) => ({
          notifications: state.notifications.map((item) => item.archivedAt || item.readAt
            ? item
            : { ...item, readAt: at }),
        }));
      },
      archiveNotification: (id) => {
        const at = nowIso();
        set((state) => ({
          notifications: state.notifications.map((item) => item.id === id
            ? { ...item, archivedAt: at, readAt: item.readAt ?? at }
            : item),
        }));
      },
      snoozeNotification: (id, until) => set((state) => ({
        notifications: state.notifications.map((item) => item.id === id
          ? { ...item, snoozedUntil: until }
          : item),
      })),
      deleteArchivedNotifications: () => set((state) => ({
        notifications: state.notifications.filter((item) => !item.archivedAt),
      })),
      syncReleaseNotifications: (titles, date = new Date()) => {
        const notifications = titles.flatMap((title) => {
          const item = releaseNotificationForTitle(title, date);
          return item ? [item] : [];
        });
        if (notifications.length === 0) return;
        set((state) => ({
          notifications: upsertNotificationList(state.notifications, notifications),
        }));
      },

      saveDiaryEntry: (input) => {
        const timestamp = nowIso();
        const id = input.id?.trim() || newId("diary");
        const previous = get().diaryEntries.find((entry) => entry.id === id);
        const episode = Number.isSafeInteger(input.episode) && (input.episode ?? 0) > 0
          ? input.episode
          : null;
        const totalEpisodes = Number.isSafeInteger(input.totalEpisodes) && (input.totalEpisodes ?? 0) > 0
          ? input.totalEpisodes
          : null;
        const entry: ReadingDiaryEntry = {
          id,
          titleId: input.titleId.trim(),
          episode,
          totalEpisodes,
          readAt: Number.isFinite(Date.parse(input.readAt)) ? input.readAt : timestamp,
          mood: input.mood,
          note: input.note.trim().slice(0, 2_000),
          spoiler: input.spoiler,
          reread: input.reread,
          platformId: input.platformId,
          createdAt: previous?.createdAt ?? timestamp,
          updatedAt: timestamp,
        };
        if (!entry.titleId) return "";
        set((state) => ({
          diaryEntries: [
            entry,
            ...state.diaryEntries.filter((candidate) => candidate.id !== id),
          ].slice(0, MAX_DIARY_ENTRIES),
        }));
        return id;
      },
      deleteDiaryEntry: (id) => set((state) => ({
        diaryEntries: state.diaryEntries.filter((entry) => entry.id !== id),
      })),
      setTastePreferences: (tastePreferences) => set({ tastePreferences }),
      clearTastePreferences: () => set({ tastePreferences: null }),
      observeAvailability: (title, suppliedObservedAt) => {
        const observedAt = suppliedObservedAt && Number.isFinite(Date.parse(suppliedObservedAt))
          ? suppliedObservedAt
          : nowIso();
        const snapshot = availabilitySnapshotOf(title);
        const previous = get().availabilityHistory[title.id];
        if (!previous) {
          set((state) => ({
            availabilityHistory: {
              ...state.availabilityHistory,
              [title.id]: {
                titleId: title.id,
                firstObservedAt: observedAt,
                lastChangedAt: observedAt,
                current: snapshot,
                events: [{
                  id: `availability-baseline:${title.id}:${observedAt}`,
                  observedAt,
                  changes: [],
                  snapshot,
                }],
              },
            },
          }));
          return;
        }
        if (
          availabilitySnapshotFingerprint(previous.current)
          === availabilitySnapshotFingerprint(snapshot)
        ) return;
        const changes = diffAvailabilitySnapshots(previous.current, snapshot);
        if (changes.length === 0) return;
        const eventId = newId(`availability:${title.id}`);
        const event = { id: eventId, observedAt, changes, snapshot };
        const notification: EngagementNotification = {
          id: `availability-notification:${eventId}`,
          category: "availability",
          title: `${title.title} 정보가 바뀌었어요`,
          body: changes.slice(0, 3).map((change) => change.label).join(" · "),
          href: `/title/${encodeURIComponent(title.slug)}`,
          createdAt: observedAt,
          readAt: null,
          archivedAt: null,
          snoozedUntil: null,
          sourceKey: `availability:${title.id}`,
        };
        set((state) => ({
          availabilityHistory: {
            ...state.availabilityHistory,
            [title.id]: {
              ...previous,
              lastChangedAt: observedAt,
              current: snapshot,
              events: [event, ...previous.events].slice(0, MAX_AVAILABILITY_EVENTS),
            },
          },
          notifications: upsertNotificationList(state.notifications, [notification]),
        }));
      },

      createGrowthExperiment: (input) => {
        const timestamp = nowIso();
        const id = newId("growth-experiment");
        const labels = [...new Set(input.variantLabels.map((value) => value.trim()).filter(Boolean))]
          .slice(0, 6);
        const experiment: GrowthExperiment = {
          id,
          projectId: input.projectId.trim() || "local-project",
          name: input.name.trim().slice(0, 120) || "새 성장 실험",
          hypothesis: input.hypothesis.trim().slice(0, 500),
          minimumSample: Math.max(20, Math.min(1_000_000, Math.round(input.minimumSample) || 100)),
          primaryMetric: input.primaryMetric,
          status: "draft",
          variants: (labels.length >= 2 ? labels : ["A안", "B안"]).map((label, index) => ({
            id: newId(`variant-${index + 1}`),
            label: label.slice(0, 80),
            note: "",
            metrics: zeroGrowthMetrics(),
          })),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        set((state) => ({
          growthExperiments: [experiment, ...state.growthExperiments].slice(0, MAX_EXPERIMENTS),
        }));
        return id;
      },
      updateGrowthExperimentStatus: (id, status) => set((state) => ({
        growthExperiments: state.growthExperiments.map((experiment) => experiment.id === id
          ? { ...experiment, status, updatedAt: nowIso() }
          : experiment),
      })),
      recordGrowthMetric: (experimentId, variantId, metric) => set((state) => ({
        growthExperiments: state.growthExperiments.map((experiment) => {
          if (experiment.id !== experimentId) return experiment;
          return {
            ...experiment,
            updatedAt: nowIso(),
            variants: experiment.variants.map((variant) => {
              if (variant.id !== variantId) return variant;
              return {
                ...variant,
                metrics: incrementGrowthMetric(variant.metrics, metric),
              };
            }),
          };
        }),
      })),
      deleteGrowthExperiment: (id) => set((state) => ({
        growthExperiments: state.growthExperiments.filter((experiment) => experiment.id !== id),
      })),
      resetEngagementData: () => set({ ...EMPTY_STATE }),
    }),
    {
      name: "toonspectrum-engagement-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        notifications: state.notifications,
        diaryEntries: state.diaryEntries,
        tastePreferences: state.tastePreferences,
        availabilityHistory: state.availabilityHistory,
        growthExperiments: state.growthExperiments,
      }),
    },
  ),
);

export function activeEngagementNotifications(
  notifications: readonly EngagementNotification[],
  now = Date.now(),
): EngagementNotification[] {
  return notifications.filter((item) => {
    if (item.archivedAt) return false;
    if (!item.snoozedUntil) return true;
    const wakeAt = Date.parse(item.snoozedUntil);
    return !Number.isFinite(wakeAt) || wakeAt <= now;
  });
}
