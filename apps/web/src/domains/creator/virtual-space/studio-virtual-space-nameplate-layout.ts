import type { StudioVirtualNameplateMode } from "./studio-virtual-space-experience-preference";

export type StudioVirtualNameplateLod = "full" | "compact" | "dot" | "hidden";

/** 이름표 옆 상태. NPC 휴식은 사람의 "자리 비움"과 구분해 "휴식 중"으로 표기한다. */
export type StudioVirtualNameplateStatus = "focused" | "reviewing" | "away" | "break";
export type StudioVirtualNameplateActivity = "available" | StudioVirtualNameplateStatus;

type Translate = (ko: string, en: string) => string;

const STATUS_LABELS: Readonly<Record<StudioVirtualNameplateStatus, readonly [string, string]>> = Object.freeze({
  focused: ["집중 중", "Focusing"],
  reviewing: ["검토 중", "Reviewing"],
  away: ["자리 비움", "Away"],
  break: ["휴식 중", "On a break"],
});

/** 상태 라벨(한국어 기본, 영어 병기는 호출 측 bt가 고른다). 색 점과 함께 쓰며 색만으로 상태를 전달하지 않는다. */
export function studioVirtualNameplateStatusLabel(status: StudioVirtualNameplateStatus, translate?: Translate): string {
  const [ko, en] = STATUS_LABELS[status];
  return translate ? translate(ko, en) : ko;
}

export interface StudioVirtualNameplatePresentation {
  readonly lod: StudioVirtualNameplateLod;
  readonly visible: boolean;
  readonly text: string;
  readonly alpha: number;
  readonly scale: number;
  /** 전체 이름표(full)일 때만 상태를 붙인다. 캔버스는 이 값으로 색 점을 그린다. */
  readonly status: StudioVirtualNameplateStatus | null;
}

export function studioVirtualDisambiguatedName(
  name: string,
  sessionId: string,
  duplicateCount: number,
): string {
  if (duplicateCount <= 1) return name;
  const suffix = sessionId.replace(/[^a-z0-9]/giu, "").slice(-4).toUpperCase() || "0000";
  return `${name} · ${suffix}`;
}

export function studioVirtualNameplatePresentation(input: {
  readonly name: string;
  readonly sessionId: string;
  readonly duplicateCount: number;
  readonly distance: number;
  readonly mode: StudioVirtualNameplateMode;
  readonly important?: boolean;
  readonly activity?: StudioVirtualNameplateActivity;
  /** bt("한국어", "English"). 없으면 한국어 라벨. */
  readonly translate?: Translate;
}): StudioVirtualNameplatePresentation {
  const distance = Number.isFinite(input.distance) ? Math.max(0, input.distance) : Number.POSITIVE_INFINITY;
  let lod: StudioVirtualNameplateLod;
  if (input.mode !== "auto") lod = input.mode;
  else if (input.important || distance <= 170) lod = "full";
  else if (distance <= 340) lod = "compact";
  else if (distance <= 560) lod = "dot";
  else lod = "hidden";
  const status = lod === "full" && input.activity && input.activity !== "available" ? input.activity : null;
  const fullName = studioVirtualDisambiguatedName(input.name, input.sessionId, input.duplicateCount);
  const statusText = status ? ` · ${studioVirtualNameplateStatusLabel(status, input.translate)}` : "";
  const text = lod === "full" ? `${fullName}${statusText}` : lod === "compact" ? fullName : lod === "dot" ? "●" : "";
  return Object.freeze({
    lod,
    visible: lod !== "hidden",
    text,
    alpha: lod === "full" ? 1 : lod === "compact" ? .86 : lod === "dot" ? .68 : 0,
    scale: lod === "full" ? 1 : lod === "compact" ? .88 : .72,
    status,
  });
}

export interface StudioVirtualNameplateCandidate {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly priority: number;
}

export interface StudioVirtualNameplateOffset {
  readonly x: number;
  readonly y: number;
}

function overlaps(a: StudioVirtualNameplateCandidate, b: StudioVirtualNameplateCandidate): boolean {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 4
    && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 3;
}

/** Greedy screen-space decluttering; higher-priority labels stay closest to their actor. */
export function layoutStudioVirtualNameplates(
  candidates: readonly StudioVirtualNameplateCandidate[],
): ReadonlyMap<string, StudioVirtualNameplateOffset> {
  const placed: StudioVirtualNameplateCandidate[] = [];
  const result = new Map<string, StudioVirtualNameplateOffset>();
  const ordered = [...candidates].sort((left, right) => right.priority - left.priority || right.y - left.y || left.id.localeCompare(right.id));
  for (const candidate of ordered) {
    let shifted = candidate;
    let offsetY = 0;
    for (let attempt = 0; attempt < 6 && placed.some((entry) => overlaps(shifted, entry)); attempt += 1) {
      offsetY -= candidate.height + 3;
      shifted = { ...candidate, y: candidate.y + offsetY };
    }
    placed.push(shifted);
    result.set(candidate.id, Object.freeze({ x: 0, y: offsetY }));
  }
  return result;
}
