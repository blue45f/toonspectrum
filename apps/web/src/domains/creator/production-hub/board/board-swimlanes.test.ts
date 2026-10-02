import { describe, expect, it } from "vitest";

import { createProductionDemoProject } from "../production-demo";

import { groupBoardLanes, laneIdForTask } from "./board-swimlanes";

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("테스트 자료가 없습니다.");
  return value;
}

describe("스윔레인 묶기", () => {
  const aggregate = createProductionDemoProject();
  const first = must(aggregate.tasks[0]);

  it("묶지 않으면 줄이 없다", () => {
    expect(groupBoardLanes(aggregate, aggregate.tasks, "none")).toEqual([]);
  });

  it("회차별로 회차 번호 순서대로 묶고 모든 카드를 정확히 한 번 담는다", () => {
    const lanes = groupBoardLanes(aggregate, aggregate.tasks, "episode");
    expect(lanes.map((lane) => lane.id)).toEqual(["episode:episode-12", "episode:episode-13"]);
    expect(lanes.flatMap((lane) => lane.tasks).map((task) => task.id).sort()).toEqual(aggregate.tasks.map((task) => task.id).sort());
    expect(lanes[0]?.hint).toEqual({ ko: "12화", en: "Episode 12" });
  });

  it("담당별로 묶을 때 여러 담당자가 있어도 첫 담당자의 줄에만 두고 담당 없는 카드는 마지막 줄에 모은다", () => {
    const shared = { ...first, id: "shared", assignmentIds: ["assignment-story", "assignment-art"] };
    const none = { ...first, id: "none", assignmentIds: [] };
    const lanes = groupBoardLanes(aggregate, [shared, none], "assignee");
    expect(lanes.map((lane) => lane.id)).toEqual(["assignee:assignment-story", "lane:unassigned"]);
    expect(laneIdForTask(shared, "assignee")).toBe("assignee:assignment-story");
    expect(laneIdForTask(none, "assignee")).toBe("lane:unassigned");
  });

  it("카드가 없는 줄은 만들지 않는다", () => {
    expect(groupBoardLanes(aggregate, [], "episode")).toEqual([]);
  });

  it("카드가 어느 줄에 속하는지 묶음 방식에 따라 같은 기준으로 알려 준다", () => {
    const task = must(aggregate.tasks.find((entry) => entry.id === "task-episode-13-story"));
    expect(laneIdForTask(task, "episode")).toBe("episode:episode-13");
    expect(laneIdForTask(task, "none")).toBe("lane:none");
  });
});
