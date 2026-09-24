export const STUDIO_NPC_DAY_MS = 12 * 60 * 1000;

const ROLE_OFFSETS: Readonly<Record<string, number>> = Object.freeze({
  "studio-guide": 0,
  "studio-producer": 1,
  "studio-editor": 2,
  "studio-artist": 3,
  "studio-librarian": 4,
  "studio-cafe": 5,
  "studio-security": 6,
  "studio-host": 7,
});

/** Selects a stable schedule slot while allowing each role to start at a different point. */
export function studioNpcScheduleIndex(
  npcId: string,
  elapsedMs: number,
  anchorCount: number,
  cycleMs = STUDIO_NPC_DAY_MS,
): number {
  if (!Number.isFinite(elapsedMs) || anchorCount <= 0 || cycleMs <= 0) return 0;
  const hour = Math.floor((((elapsedMs % cycleMs) + cycleMs) % cycleMs) / cycleMs * 8);
  const offset = ROLE_OFFSETS[npcId] ?? [...npcId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (hour + offset) % anchorCount;
}

export type StudioNpcSchedulePeriod = "arrival" | "work" | "meeting" | "break" | "review" | "closing";

export function studioNpcSchedulePeriod(elapsedMs: number, cycleMs = STUDIO_NPC_DAY_MS): StudioNpcSchedulePeriod {
  const ratio = (((elapsedMs % cycleMs) + cycleMs) % cycleMs) / cycleMs;
  if (ratio < 0.1) return "arrival";
  if (ratio < 0.42) return "work";
  if (ratio < 0.55) return "meeting";
  if (ratio < 0.66) return "break";
  if (ratio < 0.88) return "review";
  return "closing";
}
