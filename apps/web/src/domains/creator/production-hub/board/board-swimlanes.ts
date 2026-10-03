/**
 * 스윔레인: 칸반 열 위에 "회차별" 또는 "담당별" 가로 줄을 겹쳐 보여 준다.
 *
 * 줄은 보기 방식일 뿐이다. 카드를 다른 줄로 끌어도 회차나 담당이 바뀌지 않으므로,
 * 끌어 옮기기는 같은 줄 안에서만 허용한다.
 */
import type { ProductionProjectAggregate, ProductionTask } from "@toonstudio/core/production";

import type { BilingualLabel } from "../production-labels";
import { roleTypeLabel } from "../production-labels";
import { productionTaskEpisodeId, type ProductionBoardGroup } from "../production-workboard-model";

export interface ProductionBoardLane {
  readonly id: string;
  readonly title: BilingualLabel;
  /** 줄 머리글의 보조 설명(회차 번호·역할 등). */
  readonly hint: BilingualLabel | null;
  readonly tasks: readonly ProductionTask[];
}

export const LANE_NONE = "lane:none";
const UNASSIGNED_LANE = "lane:unassigned";

function episodeLanes(
  aggregate: Pick<ProductionProjectAggregate, "episodes" | "episodePlans">,
  tasks: readonly ProductionTask[],
): readonly ProductionBoardLane[] {
  const byEpisode = new Map<string, ProductionTask[]>();
  const common: ProductionTask[] = [];
  for (const task of tasks) {
    const episodeId = productionTaskEpisodeId(task);
    if (!episodeId) {
      common.push(task);
      continue;
    }
    byEpisode.set(episodeId, [...(byEpisode.get(episodeId) ?? []), task]);
  }
  const numberOf = (episodeId: string) =>
    aggregate.episodePlans.find((plan) => plan.episodeId === episodeId)?.episodeNumber ?? Number.MAX_SAFE_INTEGER;
  const lanes = [...byEpisode.entries()]
    .sort(([left], [right]) => numberOf(left) - numberOf(right) || left.localeCompare(right, "ko-KR"))
    .map(([episodeId, laneTasks]): ProductionBoardLane => {
      const plan = aggregate.episodePlans.find((entry) => entry.episodeId === episodeId);
      const title = plan?.title ?? episodeId;
      return {
        id: `episode:${episodeId}`,
        title: { ko: title, en: title },
        hint: plan ? { ko: `${plan.episodeNumber}화`, en: `Episode ${plan.episodeNumber}` } : null,
        tasks: laneTasks,
      };
    });
  return common.length
    ? [...lanes, { id: "episode:none", title: { ko: "프로젝트 공통", en: "Project-wide" }, hint: null, tasks: common }]
    : lanes;
}

function assigneeLanes(
  aggregate: Pick<ProductionProjectAggregate, "assignments" | "parties">,
  tasks: readonly ProductionTask[],
): readonly ProductionBoardLane[] {
  const localize = (ko: string) => ko;
  const byAssignment = new Map<string, ProductionTask[]>();
  const unassigned: ProductionTask[] = [];
  for (const task of tasks) {
    // 담당이 여럿이어도 첫 담당자의 줄에만 둔다. 같은 카드가 두 줄에 나타나면 선택·끌기가 모호해진다.
    const first = task.assignmentIds[0];
    if (!first) {
      unassigned.push(task);
      continue;
    }
    byAssignment.set(first, [...(byAssignment.get(first) ?? []), task]);
  }
  const lanes = [...byAssignment.entries()]
    .map(([assignmentId, laneTasks]): ProductionBoardLane => {
      const assignment = aggregate.assignments.find((entry) => entry.id === assignmentId);
      const party = assignment ? aggregate.parties.find((entry) => entry.id === assignment.partyId) : undefined;
      const name = party?.publicDisplayName ?? assignmentId;
      return {
        id: `assignee:${assignmentId}`,
        title: { ko: name, en: name },
        hint: assignment
          ? { ko: roleTypeLabel(assignment.roleType, localize), en: roleTypeLabel(assignment.roleType, (_ko, en) => en) }
          : null,
        tasks: laneTasks,
      };
    })
    .sort((left, right) => left.title.ko.localeCompare(right.title.ko, "ko-KR"));
  return unassigned.length
    ? [...lanes, { id: UNASSIGNED_LANE, title: { ko: "담당 미배정", en: "Unassigned" }, hint: null, tasks: unassigned }]
    : lanes;
}

/** 줄 묶음. 카드가 없는 줄은 만들지 않는다. 묶지 않으면 빈 배열이다. */
export function groupBoardLanes(
  aggregate: Pick<ProductionProjectAggregate, "episodes" | "episodePlans" | "assignments" | "parties">,
  tasks: readonly ProductionTask[],
  group: ProductionBoardGroup,
): readonly ProductionBoardLane[] {
  if (group === "episode") return episodeLanes(aggregate, tasks);
  if (group === "assignee") return assigneeLanes(aggregate, tasks);
  return [];
}

/** 카드가 속한 줄 id. 줄 묶음이 꺼져 있으면 항상 같은 값이다. */
export function laneIdForTask(task: ProductionTask, group: ProductionBoardGroup): string {
  if (group === "episode") return `episode:${productionTaskEpisodeId(task) ?? "none"}`;
  if (group === "assignee") return task.assignmentIds[0] ? `assignee:${task.assignmentIds[0]}` : UNASSIGNED_LANE;
  return LANE_NONE;
}
