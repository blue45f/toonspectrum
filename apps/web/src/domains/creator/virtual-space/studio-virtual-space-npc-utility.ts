import type { StudioWorldNpcActivityAnchor } from "./studio-virtual-space-npc-activity";
import type { StudioNpcSchedulePeriod } from "./studio-virtual-space-npc-schedule";

export type StudioNpcUtilityIntent = "work" | "review" | "meeting" | "guide" | "break" | "event" | "shelter" | "inspect";

export interface StudioNpcUtilityContext {
  readonly role: string;
  readonly period: StudioNpcSchedulePeriod;
  readonly nearbyPeople: number;
  readonly scheduledIndex: number;
  readonly eventActive?: boolean;
  readonly precipitation?: boolean;
  readonly focused?: boolean;
  readonly timeBucket?: number;
}

export interface StudioNpcUtilityChoice {
  readonly index: number;
  readonly anchor: StudioWorldNpcActivityAnchor;
  readonly intent: StudioNpcUtilityIntent;
  readonly score: number;
}

function stableNoise(value: string): number {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return ((hash >>> 0) % 1000) / 1000;
}

function intentFor(anchor: StudioWorldNpcActivityAnchor, role: string): StudioNpcUtilityIntent {
  if (anchor.roomId === "meeting") return "meeting";
  if (anchor.roomId === "live" || anchor.roomId === "release") return role === "host" ? "event" : "inspect";
  if (anchor.roomId === "lobby" && role === "guide") return "guide";
  if (anchor.animation === "review" || anchor.roomId === "review" || anchor.roomId === "quality") return "review";
  if (anchor.activity === "rest" || anchor.animation === "sit") return "break";
  if (anchor.activity === "inspect") return "inspect";
  return "work";
}

function periodScore(intent: StudioNpcUtilityIntent, period: StudioNpcSchedulePeriod): number {
  if (period === "arrival") return intent === "guide" || intent === "work" ? 24 : 2;
  if (period === "work") return intent === "work" || intent === "review" ? 34 : intent === "inspect" ? 16 : 0;
  if (period === "meeting") return intent === "meeting" || intent === "event" ? 46 : intent === "review" ? 18 : -4;
  if (period === "break") return intent === "break" ? 44 : intent === "guide" ? 10 : -8;
  if (period === "review") return intent === "review" ? 48 : intent === "work" || intent === "inspect" ? 12 : 0;
  return intent === "work" || intent === "guide" ? 16 : intent === "event" ? 12 : 2;
}

export function scoreStudioNpcUtilityChoice(
  actorId: string,
  choice: { readonly index: number; readonly anchor: StudioWorldNpcActivityAnchor },
  context: StudioNpcUtilityContext,
): StudioNpcUtilityChoice {
  const intent = intentFor(choice.anchor, context.role);
  let score = periodScore(intent, context.period);
  if (choice.index === context.scheduledIndex) score += 26;
  if (context.focused && intent !== "work" && intent !== "review") score -= 35;
  if (context.eventActive && intent === "event") score += 45;
  if (context.precipitation && ["lounge", "meeting", "production", "review"].includes(choice.anchor.roomId)) score += 14;
  if (context.nearbyPeople > 0 && intent === "guide") score += Math.min(24, context.nearbyPeople * 7);
  if (context.nearbyPeople > 2 && intent === "meeting") score += 12;
  if (context.role === "editor" && intent === "review") score += 28;
  if ((context.role === "artist" || context.role === "writer") && intent === "work") score += 24;
  if (context.role === "producer" && (intent === "meeting" || intent === "review")) score += 22;
  if (context.role === "cafe" && intent === "break") score += 20;
  if (context.role === "security" && (intent === "meeting" || intent === "inspect")) score += 18;
  score += stableNoise(`${actorId}:${choice.anchor.id}:${context.timeBucket ?? 0}`) * 5;
  return Object.freeze({ ...choice, intent, score });
}

export function selectStudioNpcUtilityChoice(
  actorId: string,
  choices: readonly { readonly index: number; readonly anchor: StudioWorldNpcActivityAnchor }[],
  context: StudioNpcUtilityContext,
): StudioNpcUtilityChoice | null {
  let selected: StudioNpcUtilityChoice | null = null;
  for (const choice of choices) {
    const scored = scoreStudioNpcUtilityChoice(actorId, choice, context);
    if (!selected || scored.score > selected.score) selected = scored;
  }
  return selected;
}
