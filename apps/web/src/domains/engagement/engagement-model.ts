import type { Availability, PlatformId, Pricing, Title } from "@/shared/lib/types";

export type EngagementNotificationCategory =
  | "release"
  | "availability"
  | "production"
  | "market"
  | "community"
  | "system";

export interface EngagementNotification {
  readonly id: string;
  readonly category: EngagementNotificationCategory;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly createdAt: string;
  readonly readAt: string | null;
  readonly archivedAt: string | null;
  readonly snoozedUntil: string | null;
  readonly sourceKey: string;
}

export type ReadingMood =
  | "excited"
  | "moved"
  | "comforted"
  | "curious"
  | "tense"
  | "mixed";

export interface ReadingDiaryEntry {
  readonly id: string;
  readonly titleId: string;
  readonly episode: number | null;
  readonly totalEpisodes: number | null;
  readonly readAt: string;
  readonly mood: ReadingMood;
  readonly note: string;
  readonly spoiler: boolean;
  readonly reread: boolean;
  readonly platformId: PlatformId | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type TasteFormat = "all" | "webtoon" | "webnovel";
export type TasteStatus = "all" | "ongoing" | "completed";
export type ContentIntensity = "gentle" | "balanced" | "unrestricted";

export interface TastePreferences {
  readonly genres: readonly string[];
  readonly selectedTitleIds: readonly string[];
  readonly format: TasteFormat;
  readonly status: TasteStatus;
  readonly avoidTags: readonly string[];
  readonly contentIntensity: ContentIntensity;
  readonly completedAt: string;
}

export interface AvailabilitySnapshotItem {
  readonly platformId: PlatformId;
  readonly pricing: Pricing;
  readonly isOriginal: boolean;
}

export interface AvailabilitySnapshot {
  readonly titleId: string;
  readonly title: string;
  readonly slug: string;
  readonly status: Title["status"];
  readonly totalEpisodes: number | null;
  readonly updateDays: readonly string[];
  readonly availability: readonly AvailabilitySnapshotItem[];
}

export type AvailabilityChangeKind =
  | "platform-added"
  | "platform-removed"
  | "pricing-changed"
  | "platform-origin-changed"
  | "serialization-changed"
  | "episode-count-changed"
  | "schedule-changed";

export interface AvailabilityChange {
  readonly kind: AvailabilityChangeKind;
  readonly label: string;
  readonly before: string | null;
  readonly after: string | null;
}

export interface AvailabilityHistoryEvent {
  readonly id: string;
  readonly observedAt: string;
  readonly changes: readonly AvailabilityChange[];
  readonly snapshot: AvailabilitySnapshot;
}

export interface AvailabilityHistoryRecord {
  readonly titleId: string;
  readonly firstObservedAt: string;
  readonly lastChangedAt: string;
  readonly current: AvailabilitySnapshot;
  readonly events: readonly AvailabilityHistoryEvent[];
}

export interface GrowthVariantMetrics {
  readonly impressions: number;
  readonly opens: number;
  readonly starts: number;
  readonly completes: number;
  readonly subscribes: number;
}

export interface GrowthVariant {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly metrics: GrowthVariantMetrics;
}

export type GrowthExperimentStatus = "draft" | "running" | "paused" | "completed";

export interface GrowthExperiment {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly hypothesis: string;
  readonly minimumSample: number;
  readonly primaryMetric: "open-rate" | "start-rate" | "completion-rate" | "subscribe-rate";
  readonly status: GrowthExperimentStatus;
  readonly variants: readonly GrowthVariant[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type GrowthMetricEvent = keyof GrowthVariantMetrics;

export interface GrowthVariantResult {
  readonly variantId: string;
  readonly label: string;
  readonly sample: number;
  readonly opens: number;
  readonly starts: number;
  readonly completes: number;
  readonly subscribes: number;
  readonly openRate: number;
  readonly startRate: number;
  readonly completionRate: number;
  readonly subscribeRate: number;
  readonly primaryRate: number;
}

export interface GrowthExperimentAssessment {
  readonly state: "collecting" | "inconclusive" | "directional";
  readonly leaderId: string | null;
  readonly confidence: number | null;
  readonly reason: string;
  readonly results: readonly GrowthVariantResult[];
}

const PRICING_LABEL: Record<Pricing, string> = {
  free: "무료",
  "wait-free": "기다리면 무료",
  paid: "유료",
  subscription: "구독",
};

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "ko-KR"));
}

function availabilityItem(value: Availability): AvailabilitySnapshotItem {
  return {
    platformId: value.platformId,
    pricing: value.pricing,
    isOriginal: value.isOriginal === true,
  };
}

export function availabilitySnapshotOf(title: Title): AvailabilitySnapshot {
  return {
    titleId: title.id,
    title: title.title,
    slug: title.slug,
    status: title.status,
    totalEpisodes: Number.isSafeInteger(title.totalEpisodes) && (title.totalEpisodes ?? 0) >= 0
      ? title.totalEpisodes ?? null
      : null,
    updateDays: sortedUnique(title.updateDays ?? []),
    availability: title.availability
      .map(availabilityItem)
      .sort((left, right) => left.platformId.localeCompare(right.platformId)
        || left.pricing.localeCompare(right.pricing)),
  };
}

export function availabilitySnapshotFingerprint(snapshot: AvailabilitySnapshot): string {
  return JSON.stringify(snapshot);
}

function platformMap(items: readonly AvailabilitySnapshotItem[]): Map<PlatformId, AvailabilitySnapshotItem> {
  return new Map(items.map((item) => [item.platformId, item]));
}

export function diffAvailabilitySnapshots(
  before: AvailabilitySnapshot,
  after: AvailabilitySnapshot,
): AvailabilityChange[] {
  const changes: AvailabilityChange[] = [];
  const beforePlatforms = platformMap(before.availability);
  const afterPlatforms = platformMap(after.availability);
  const platformIds = [...new Set([...beforePlatforms.keys(), ...afterPlatforms.keys()])]
    .sort((left, right) => left.localeCompare(right));

  for (const platformId of platformIds) {
    const previous = beforePlatforms.get(platformId);
    const next = afterPlatforms.get(platformId);
    if (!previous && next) {
      changes.push({
        kind: "platform-added",
        label: `${platformId} 제공처 추가`,
        before: null,
        after: PRICING_LABEL[next.pricing],
      });
    } else if (previous && !next) {
      changes.push({
        kind: "platform-removed",
        label: `${platformId} 제공처 종료`,
        before: PRICING_LABEL[previous.pricing],
        after: null,
      });
    } else if (previous && next) {
      if (previous.pricing !== next.pricing) {
        changes.push({
          kind: "pricing-changed",
          label: `${platformId} 이용 방식 변경`,
          before: PRICING_LABEL[previous.pricing],
          after: PRICING_LABEL[next.pricing],
        });
      }
      if (previous.isOriginal !== next.isOriginal) {
        changes.push({
          kind: "platform-origin-changed",
          label: `${platformId} 원작 표시 변경`,
          before: previous.isOriginal ? "공식 원작" : "일반 제공",
          after: next.isOriginal ? "공식 원작" : "일반 제공",
        });
      }
    }
  }

  if (before.status !== after.status) {
    changes.push({
      kind: "serialization-changed",
      label: "연재 상태 변경",
      before: before.status,
      after: after.status,
    });
  }
  if (before.totalEpisodes !== after.totalEpisodes) {
    changes.push({
      kind: "episode-count-changed",
      label: "확인된 회차 수 변경",
      before: before.totalEpisodes === null ? null : String(before.totalEpisodes),
      after: after.totalEpisodes === null ? null : String(after.totalEpisodes),
    });
  }
  if (before.updateDays.join("|") !== after.updateDays.join("|")) {
    changes.push({
      kind: "schedule-changed",
      label: "연재 요일 변경",
      before: before.updateDays.length > 0 ? before.updateDays.join("·") : null,
      after: after.updateDays.length > 0 ? after.updateDays.join("·") : null,
    });
  }
  return changes;
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function releaseNotificationForTitle(
  title: Title,
  now = new Date(),
): EngagementNotification | null {
  if (title.status !== "ongoing") return null;
  const weekday = WEEKDAY_LABELS[now.getDay()];
  if (!title.updateDays?.includes(weekday)) return null;
  const dateKey = localDateKey(now);
  return {
    id: `release:${dateKey}:${title.id}`,
    category: "release",
    title: `${title.title} 연재일이에요`,
    body: `${weekday}요일 연재 작품입니다. 새 회차 공개 여부는 제공 플랫폼에서 확인해 주세요.`,
    href: `/title/${encodeURIComponent(title.slug)}`,
    createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8).toISOString(),
    readAt: null,
    archivedAt: null,
    snoozedUntil: null,
    sourceKey: `catalog-release:${title.id}:${dateKey}`,
  };
}

function safeCount(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function normalizedGrowthMetrics(value?: Partial<GrowthVariantMetrics>): GrowthVariantMetrics {
  const impressions = safeCount(value?.impressions ?? 0);
  const opens = Math.min(impressions, safeCount(value?.opens ?? 0));
  const starts = Math.min(opens, safeCount(value?.starts ?? 0));
  const completes = Math.min(starts, safeCount(value?.completes ?? 0));
  const subscribes = Math.min(completes, safeCount(value?.subscribes ?? 0));
  return { impressions, opens, starts, completes, subscribes };
}

export function incrementGrowthMetric(
  value: GrowthVariantMetrics,
  metric: GrowthMetricEvent,
): GrowthVariantMetrics {
  const next = { ...normalizedGrowthMetrics(value) };
  next[metric] += 1;
  if (metric === "opens" || metric === "starts" || metric === "completes" || metric === "subscribes") {
    next.impressions = Math.max(next.impressions, next[metric]);
  }
  if (metric === "starts" || metric === "completes" || metric === "subscribes") {
    next.opens = Math.max(next.opens, next[metric]);
  }
  if (metric === "completes" || metric === "subscribes") {
    next.starts = Math.max(next.starts, next[metric]);
  }
  if (metric === "subscribes") next.completes = Math.max(next.completes, next.subscribes);
  return normalizedGrowthMetrics(next);
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function primaryRate(
  result: Omit<GrowthVariantResult, "primaryRate">,
  metric: GrowthExperiment["primaryMetric"],
): number {
  if (metric === "open-rate") return result.openRate;
  if (metric === "start-rate") return result.startRate;
  if (metric === "completion-rate") return result.completionRate;
  return result.subscribeRate;
}

function normalCdfApprox(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function twoProportionConfidence(
  firstSuccesses: number,
  firstSample: number,
  secondSuccesses: number,
  secondSample: number,
): number | null {
  if (firstSample <= 0 || secondSample <= 0) return null;
  const pooled = (firstSuccesses + secondSuccesses) / (firstSample + secondSample);
  const standardError = Math.sqrt(pooled * (1 - pooled) * ((1 / firstSample) + (1 / secondSample)));
  if (standardError === 0) return null;
  const z = Math.abs((firstSuccesses / firstSample) - (secondSuccesses / secondSample)) / standardError;
  return Math.max(0, Math.min(1, 2 * normalCdfApprox(z) - 1));
}

function primarySuccesses(
  metrics: GrowthVariantMetrics,
  metric: GrowthExperiment["primaryMetric"],
): number {
  if (metric === "open-rate") return metrics.opens;
  if (metric === "start-rate") return metrics.starts;
  if (metric === "completion-rate") return metrics.completes;
  return metrics.subscribes;
}

function primaryDenominator(
  metrics: GrowthVariantMetrics,
  metric: GrowthExperiment["primaryMetric"],
): number {
  return metric === "completion-rate" ? metrics.starts : metrics.impressions;
}

export function assessGrowthExperiment(
  experiment: GrowthExperiment,
): GrowthExperimentAssessment {
  const results = experiment.variants.map((variant): GrowthVariantResult => {
    const metrics = normalizedGrowthMetrics(variant.metrics);
    const base = {
      variantId: variant.id,
      label: variant.label,
      sample: metrics.impressions,
      opens: metrics.opens,
      starts: metrics.starts,
      completes: metrics.completes,
      subscribes: metrics.subscribes,
      openRate: rate(metrics.opens, metrics.impressions),
      startRate: rate(metrics.starts, metrics.impressions),
      completionRate: rate(metrics.completes, metrics.starts),
      subscribeRate: rate(metrics.subscribes, metrics.impressions),
    };
    return { ...base, primaryRate: primaryRate(base, experiment.primaryMetric) };
  }).sort((left, right) => right.primaryRate - left.primaryRate || right.sample - left.sample);

  if (results.length < 2 || results.some((result) => result.sample < experiment.minimumSample)) {
    return {
      state: "collecting",
      leaderId: null,
      confidence: null,
      reason: `각 변형에 최소 ${experiment.minimumSample.toLocaleString("ko-KR")}회 노출이 필요합니다.`,
      results,
    };
  }

  const leader = results[0]!;
  const runnerUp = results[1]!;
  const variantById = new Map(experiment.variants.map((variant) => [variant.id, variant]));
  const leaderMetrics = normalizedGrowthMetrics(variantById.get(leader.variantId)?.metrics);
  const runnerMetrics = normalizedGrowthMetrics(variantById.get(runnerUp.variantId)?.metrics);
  const confidence = twoProportionConfidence(
    primarySuccesses(leaderMetrics, experiment.primaryMetric),
    primaryDenominator(leaderMetrics, experiment.primaryMetric),
    primarySuccesses(runnerMetrics, experiment.primaryMetric),
    primaryDenominator(runnerMetrics, experiment.primaryMetric),
  );

  if (leader.primaryRate <= runnerUp.primaryRate || confidence === null || confidence < 0.95) {
    return {
      state: "inconclusive",
      leaderId: null,
      confidence,
      reason: "표본은 채웠지만 95% 신뢰 수준에서 차이를 확인하지 못했습니다.",
      results,
    };
  }

  return {
    state: "directional",
    leaderId: leader.variantId,
    confidence,
    reason: "현재 표본에서 방향성 있는 차이가 확인됐습니다. 최종안은 사람이 맥락과 품질을 함께 검토해 선택해야 합니다.",
    results,
  };
}

export function zeroGrowthMetrics(): GrowthVariantMetrics {
  return { impressions: 0, opens: 0, starts: 0, completes: 0, subscribes: 0 };
}
