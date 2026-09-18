import type { Title } from "./types";

import type { RecommendationDiversity } from "./catalog-discovery-state";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <T,>(ko: T, en: T): T =>
  translateBilingualValueForActiveLocale("recommendation-feedback", ko, en);

const STORAGE_KEY = "toonspectrum:recommendation-feedback:v1";
const MAX_IDS = 200;

export const RECOMMENDATION_FEEDBACK_EVENT =
  "toonspectrum:recommendation-feedback" as const;

export interface RecommendationFeedbackState {
  readonly hiddenIds: readonly string[];
  readonly seenIds: readonly string[];
  readonly updatedAt: number;
}

const EMPTY_FEEDBACK: RecommendationFeedbackState = {
  hiddenIds: [],
  seenIds: [],
  updatedAt: 0,
};

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
function boundedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().slice(0, 160))
    .filter(Boolean))]
    .slice(-MAX_IDS);
}

export function readRecommendationFeedback(): RecommendationFeedbackState {
  const source = storage();
  if (!source) return EMPTY_FEEDBACK;
  try {
    const parsed: unknown = JSON.parse(source.getItem(STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return EMPTY_FEEDBACK;
    const record = parsed as Partial<RecommendationFeedbackState>;
    return {
      hiddenIds: boundedIds(record.hiddenIds),
      seenIds: boundedIds(record.seenIds),
      updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : 0,
    };
  } catch {
    return EMPTY_FEEDBACK;
  }
}

function persistRecommendationFeedback(
  next: RecommendationFeedbackState,
): RecommendationFeedbackState {
  const source = storage();
  if (!source) return next;
  try {
    source.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(RECOMMENDATION_FEEDBACK_EVENT));
  } catch {
    // Recommendation feedback must never block discovery.
  }
  return next;
}

export function hideRecommendation(titleId: string): RecommendationFeedbackState {
  const previous = readRecommendationFeedback();
  return persistRecommendationFeedback({
    hiddenIds: boundedIds([...previous.hiddenIds, titleId]),
    seenIds: previous.seenIds,
    updatedAt: Date.now(),
  });
}

export function markRecommendationSeen(titleId: string): RecommendationFeedbackState {
  const previous = readRecommendationFeedback();
  return persistRecommendationFeedback({
    hiddenIds: boundedIds([...previous.hiddenIds, titleId]),
    seenIds: boundedIds([...previous.seenIds, titleId]),
    updatedAt: Date.now(),
  });
}

export function clearRecommendationFeedback(): RecommendationFeedbackState {
  const source = storage();
  try {
    source?.removeItem(STORAGE_KEY);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(RECOMMENDATION_FEEDBACK_EVENT));
    }
  } catch {
    // Ignore private-mode and quota failures.
  }
  return EMPTY_FEEDBACK;
}

export function filterRecommendationFeedback<T extends { readonly id: string }>(
  values: readonly T[],
  feedback: RecommendationFeedbackState,
): T[] {
  const hidden = new Set(feedback.hiddenIds);
  return values.filter((value) => !hidden.has(value.id));
}

export function diversifyRecommendations(
  values: readonly Title[],
  mode: RecommendationDiversity,
): Title[] {
  if (mode !== "wide" || values.length < 3) return [...values];
  const buckets = new Map<string, Title[]>();
  for (const title of values) {
    const key = title.genres[0] ?? "other";
    const bucket = buckets.get(key) ?? [];
    bucket.push(title);
    buckets.set(key, bucket);
  }

  const diversified: Title[] = [];
  const queue = [...buckets.values()].sort((left, right) => right.length - left.length);
  while (queue.some((bucket) => bucket.length > 0)) {
    for (const bucket of queue) {
      const next = bucket.shift();
      if (next) diversified.push(next);
    }
  }
  return diversified;
}

export function recommendationReason(
  title: Title,
  tasteGenres: readonly string[],
  _locale,
): string {
  const matched = tasteGenres.find((genre) => title.genres.includes(genre));
  if (matched) {
    return formatI18nTemplate(String(bi("{value0} 취향과 닮은 작품", "Matches your {value0} preference")), { value0: matched });
  }
  const genre = title.genres[0];
  if (genre) {
    return formatI18nTemplate(String(bi("{value0}에서 새로운 결을 제안", "A different angle on {value0}")), { value0: genre });
  }
  return bi("취향 범위를 넓히는 추천", "Broadens your discovery mix");
}
