import { describe, expect, it } from "vitest";

import { createProductionDemoProject } from "../production-demo";

import { boardProcessOptions, buildQuickAddTasks } from "./board-new-task";
import { smallBoardFixture } from "./board-fixtures";

const ids = () => {
  let count = 0;
  return () => `new-${(count += 1)}`;
};
const KO = (ko: string) => ko;

describe("새 카드 만들기", () => {
  it("새 카드는 항상 초안이고 줄마다 한 장씩 만든다", () => {
    const aggregate = createProductionDemoProject();
    const tasks = buildQuickAddTasks(aggregate, ["첫 카드", "둘째 카드"], { processKey: "line-art", episodeId: null, assignmentId: null, priority: "" }, ids());
    expect(tasks.map((task) => [task.id, task.title, task.status, task.processKey, task.priority])).toEqual([
      ["new-1", "첫 카드", "draft", "line-art", "normal"],
      ["new-2", "둘째 카드", "draft", "line-art", "normal"],
    ]);
    expect(tasks[0]?.scope.kind).toBe("project");
  });

  it("보고 있는 회차·담당·우선순위를 미리 채운다", () => {
    const aggregate = createProductionDemoProject();
    const [task] = buildQuickAddTasks(aggregate, ["채우기"], { processKey: "color", episodeId: "episode-12", assignmentId: "assignment-color", priority: "high" }, ids());
    expect(task?.scope).toMatchObject({ kind: "episode", id: "episode-12" });
    expect(task?.assignmentIds).toEqual(["assignment-color"]);
    expect(task?.priority).toBe("high");
  });

  it("담당할 수 없는 회차 범위의 배정이나 없는 회차는 채우지 않는다", () => {
    const aggregate = createProductionDemoProject();
    const [vendor] = buildQuickAddTasks(aggregate, ["외주"], { processKey: "background", episodeId: "episode-13", assignmentId: "assignment-background-vendor", priority: "" }, ids());
    expect(vendor?.assignmentIds).toEqual([]);
    const [unknown] = buildQuickAddTasks(aggregate, ["회차 없음"], { processKey: "color", episodeId: "episode-99", assignmentId: null, priority: "" }, ids());
    expect(unknown?.scope.kind).toBe("project");
  });

  it("팀 공정 설정이 있으면 설정에 없는 공정은 첫 공정으로 바꾼다", () => {
    const aggregate = smallBoardFixture();
    const [task] = buildQuickAddTasks(aggregate, ["공정 보정"], { processKey: "color", episodeId: null, assignmentId: null, priority: "" }, ids());
    expect(task?.processKey).toBe("story-lock");
  });

  it("공정 선택지는 팀 설정 순서를, 없으면 웹툰 기본 공정을 쓴다", () => {
    expect(boardProcessOptions(smallBoardFixture(), KO).map((option) => option.key)).toEqual(["story-lock", "storyboard", "line-art", "joint-proof"]);
    expect(boardProcessOptions(createProductionDemoProject(), KO).map((option) => option.key)[0]).toBe("story-lock");
  });
});
