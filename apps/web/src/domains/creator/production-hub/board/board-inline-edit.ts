/**
 * 카드 인라인 편집(기한·담당자)의 순수 계산.
 *
 * 기한은 날짜 단위로 읽는 표면(배지의 D-day 계산이 로컬 날짜 기준)이라, 카드의 날짜 입력도
 * 로컬 날짜 하나로 주고받는다. 시각까지 다루는 정밀 편집은 작업 에디터가 맡는다.
 */
import type { ProductionProjectAggregate, ProductionTask } from "@toonstudio/core/production";

/** ISO 시각 → 날짜 입력(`type="date"`)에 넣을 로컬 `YYYY-MM-DD`. 없거나 잘못된 값이면 빈 문자열. */
export function localDateInputValue(iso: string | null): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "";
  const date = new Date(iso);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * 날짜 입력 값(`YYYY-MM-DD`) → 그 날의 끝(로컬 23:59:59.999) ISO.
 * 날짜만 고르면 "그날까지"로 읽히는 것이 자연스럽고, 자정으로 두면 당일 아침부터 '지남'으로 표시된다.
 * 형식이 잘못됐거나 존재하지 않는 날짜면 null.
 */
export function dueAtFromLocalDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 23, 59, 59, 999);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date.toISOString();
}

/** 지금 기한과 날짜 입력 값이 같은 로컬 날짜인지(시각만 다른 경우를 같은 기한으로 본다). */
export function isSameLocalDate(iso: string | null, value: string): boolean {
  return localDateInputValue(iso) === value && value !== "";
}

export interface BoardAssigneeOption {
  readonly id: string;
  readonly name: string;
  /** 활성 배정이 아닌데 이미 담당자로 걸려 있는 경우. 이름 뒤에 표시한다. */
  readonly inactive: boolean;
  readonly selected: boolean;
}

/**
 * 카드 담당자 선택지의 후보. 작업 에디터와 같은 규칙: 활성 배정 전부 + 비활성이어도 이미 담당자인 배정.
 * 비활성이면서 담당자가 아닌 배정은 고를 수 없으므로 후보에서 뺀다.
 */
export function boardAssigneeOptions(
  aggregate: Pick<ProductionProjectAggregate, "assignments" | "parties">,
  task: Pick<ProductionTask, "assignmentIds">,
): readonly BoardAssigneeOption[] {
  return aggregate.assignments
    .filter((entry) => entry.status === "active" || task.assignmentIds.includes(entry.id))
    .map((entry) => ({
      id: entry.id,
      name: aggregate.parties.find((party) => party.id === entry.partyId)?.publicDisplayName ?? entry.id,
      inactive: entry.status !== "active",
      selected: task.assignmentIds.includes(entry.id),
    }));
}
