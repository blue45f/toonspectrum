import type { SeminarDuration } from "./engineering-seminar-curriculum";

export type DeckAudience = "investor" | "seminar" | "study";
export interface EngineeringDeckState {
  readonly audience: DeckAudience;
  readonly index: number;
  readonly duration: SeminarDuration;
}
export function isDeckAudience(value: unknown): value is DeckAudience {
  return value === "investor" || value === "seminar" || value === "study";
}
export function parseEngineeringDeckState(search: string, hash: string): EngineeringDeckState {
  const query = new URLSearchParams(search);
  const match = /^#deck=(investor|seminar|study):(\d{1,6})$/u.exec(hash);
  const audience = match?.[1] ?? query.get("audience");
  const minutes = Number(query.get("duration"));
  return {
    audience: isDeckAudience(audience) ? audience : "seminar",
    index: match ? Math.max(0, Number(match[2]) - 1) : 0,
    duration: minutes === 15 || minutes === 45 ? minutes : 30,
  };
}
export function clampDeckIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || length <= 0) return 0;
  return Math.min(length - 1, Math.max(0, Math.floor(index)));
}
export function engineeringDeckHref(state: EngineeringDeckState): string {
  return `/about/technology/deck?audience=${state.audience}&duration=${state.duration}#deck=${state.audience}:${state.index + 1}`;
}
