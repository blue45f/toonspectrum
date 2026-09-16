import {
  isFeedbackKind,
  type FeedbackKind,
} from "@toonspectrum/core/feedback";

import type { FeedbackFilters } from "./use-feedback-feed";

export interface FeedbackRouteState {
  readonly kind: FeedbackKind;
  readonly filters: FeedbackFilters;
  readonly composerOpen: boolean;
}

export function feedbackRouteState(search: string, desktop: boolean): FeedbackRouteState {
  const params = new URLSearchParams(search);
  const requestedKind = params.get("type");
  const kind = isFeedbackKind(requestedKind) ? requestedKind : "bug";
  const tag = (params.get("tag") ?? "")
    .trim()
    .replace(/^#/u, "")
    .replace(/\s+/gu, " ")
    .slice(0, 20);
  return {
    kind,
    filters: { category: "all", progress: "all", query: "", mine: false, tag },
    composerOpen: desktop || isFeedbackKind(requestedKind),
  };
}
