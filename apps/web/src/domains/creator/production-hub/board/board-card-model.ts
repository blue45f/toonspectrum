/**
 * 칸반 카드가 보여 주는 "한눈에 읽는 정보"의 읽기 모델.
 *
 * 카드에는 라벨(공정·우선순위·회차), 마감 배지, 체크리스트 진행, 막힘 신호만 올린다.
 * 모두 작업 데이터에서 계산하며 새 상태를 만들지 않는다.
 */
import type { ProductionProjectAggregate, ProductionTask, ProductionTaskStatus } from "@toonstudio/core/production";

import type { BilingualLabel } from "../production-labels";
import type { ProductionTone } from "../production-ui";
import { productionTaskDueInfo } from "../production-workboard-model";

export interface BoardChecklistProgress {
  readonly done: number;
  readonly total: number;
  readonly percent: number;
}

/** 작업 설명의 체크 항목 진행. 체크 항목이 없으면 null. */
export function boardChecklistProgress(task: Pick<ProductionTask, "briefBlocks">): BoardChecklistProgress | null {
  const items = (task.briefBlocks ?? []).filter((block) => block.kind === "checklist");
  if (items.length === 0) return null;
  const done = items.filter((block) => block.checked === true).length;
  return { done, total: items.length, percent: Math.round((done / items.length) * 100) };
}

export interface BoardDueBadge {
  readonly tone: ProductionTone;
  readonly label: BilingualLabel;
  /** 색만으로 상태를 전하지 않도록 함께 쓰는 한 줄 설명(마감 날짜). */
  readonly title: BilingualLabel;
}

/** 마감 배지(Trello처럼 지남·오늘·내일을 색과 글자로 함께 보여 준다). 마감이 없으면 null. */
export function boardDueBadge(task: ProductionTask, now: number): BoardDueBadge | null {
  const info = productionTaskDueInfo(task, now);
  if (info.state === "none" || !task.dueAt) return null;
  const date = new Date(task.dueAt);
  const short: BilingualLabel = {
    ko: date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" }),
    en: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  };
  const title: BilingualLabel = {
    ko: date.toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    en: date.toLocaleString("en-US", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }),
  };
  switch (info.state) {
    case "overdue": {
      const days = Math.max(0, -info.days);
      return {
        tone: "danger",
        title,
        label: days === 0 ? { ko: "오늘 지남", en: "Overdue today" } : { ko: `${days}일 지남`, en: `${days}d overdue` },
      };
    }
    case "today":
      return { tone: "warning", title, label: { ko: "오늘", en: "Today" } };
    case "tomorrow":
      return { tone: "warning", title, label: { ko: "내일", en: "Tomorrow" } };
    case "week":
      return { tone: "neutral", title, label: { ko: `D-${info.days}`, en: `In ${info.days}d` } };
    default:
      return { tone: "neutral", title, label: short };
  }
}

export type BoardSignalId = "blocked" | "needs-input" | "input-pin" | "dependency" | "unassigned";

export interface BoardCardSignal {
  readonly id: BoardSignalId;
  readonly tone: ProductionTone;
  readonly label: BilingualLabel;
}

const BEFORE_START: ReadonlySet<ProductionTaskStatus> = new Set(["draft", "needs-input", "ready", "blocked", "paused"]);
const FINISHED: ReadonlySet<ProductionTaskStatus> = new Set(["approved", "done"]);
const CLOSED: ReadonlySet<ProductionTaskStatus> = new Set(["approved", "done", "cancelled", "out-of-scope"]);

/**
 * 카드가 "지금 막힌 이유"를 짧게 알리는 신호. 카드마다 최대 두 개만 올려 시선이 흩어지지 않게 한다.
 * `statusById`는 선행 작업이 끝났는지 확인하는 데 쓴다.
 */
export function boardCardSignals(
  task: ProductionTask,
  statusById: ReadonlyMap<string, ProductionTaskStatus>,
): readonly BoardCardSignal[] {
  if (CLOSED.has(task.status)) return [];
  const signals: BoardCardSignal[] = [];
  if (task.status === "blocked") signals.push({ id: "blocked", tone: "danger", label: { ko: "막힘", en: "Blocked" } });
  if (task.status === "needs-input")
    signals.push({ id: "needs-input", tone: "warning", label: { ko: "입력 필요", en: "Needs input" } });
  if (BEFORE_START.has(task.status)) {
    const waiting = task.dependencyTaskIds.filter((id) => {
      const status = statusById.get(id);
      return status !== undefined && !FINISHED.has(status);
    }).length;
    if (waiting > 0)
      signals.push({ id: "dependency", tone: "warning", label: { ko: `선행 ${waiting}개 대기`, en: `Waiting on ${waiting}` } });
    if (task.inputRevisionRefs.length === 0)
      signals.push({ id: "input-pin", tone: "warning", label: { ko: "입력 버전 고정 필요", en: "Pin input version" } });
  }
  if (task.assignmentIds.length === 0)
    signals.push({ id: "unassigned", tone: "warning", label: { ko: "담당 없음", en: "No owner" } });
  return signals.slice(0, 2);
}

/** 카드 신호 계산에 쓰는 작업 id → 상태 표. 한 번 만들어 모든 카드가 나눠 쓴다. */
export function boardStatusById(aggregate: Pick<ProductionProjectAggregate, "tasks">): ReadonlyMap<string, ProductionTaskStatus> {
  return new Map(aggregate.tasks.map((task) => [task.id, task.status]));
}

export interface HighlightSegment {
  readonly text: string;
  readonly match: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** 검색어와 겹치는 글자 구간. 검색어가 없으면 한 덩어리다. 카드 제목에서 찾은 이유를 보여 주는 용도다. */
export function highlightSegments(text: string, query: string): readonly HighlightSegment[] {
  const terms = [...new Set(query.normalize("NFKC").trim().split(/\s+/u).filter(Boolean))].slice(0, 8);
  if (terms.length === 0 || text.length === 0) return [{ text, match: false }];
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "giu");
  const segments: HighlightSegment[] = [];
  let last = 0;
  for (const found of text.matchAll(pattern)) {
    const start = found.index;
    if (found[0].length === 0) continue;
    if (start > last) segments.push({ text: text.slice(last, start), match: false });
    segments.push({ text: found[0], match: true });
    last = start + found[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), match: false });
  return segments.length ? segments : [{ text, match: false }];
}
