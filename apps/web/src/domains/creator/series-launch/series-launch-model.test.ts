import { describe, expect, it } from "vitest";

import {
  canNavigateToStep,
  createEmptyLaunchDraft,
  getLaunchProgress,
  getNextIncompleteStep,
  isLaunchStepComplete,
  parseLaunchGenre,
  parseLaunchTags,
  toSeriesInput,
  validateLaunchDraft,
  type SeriesLaunchDraft,
} from "./series-launch-model";

function completeDraft(): SeriesLaunchDraft {
  return {
    ...createEmptyLaunchDraft(),
    genre: "romance",
    logline: "옥상에서 만난 두 사람의 비밀 방과후",
    synopsis: "시작과 갈등과 결말",
    title: "옥상 방과후",
    description: "설렘 가득한 학원 로맨스",
    tags: ["학원물"],
    episodeTitle: "1화 옥상에서 만나요",
    episodePagesReady: true,
    specCheckPassed: true,
    scheduleDecided: true,
  };
}

describe("series-launch-model", () => {
  it("빈 초안은 어떤 단계도 완료되지 않는다", () => {
    const draft = createEmptyLaunchDraft();
    expect(isLaunchStepComplete(draft, "plan")).toBe(false);
    expect(isLaunchStepComplete(draft, "series")).toBe(false);
    expect(isLaunchStepComplete(draft, "episode")).toBe(false);
    expect(isLaunchStepComplete(draft, "review")).toBe(false);
    expect(isLaunchStepComplete(draft, "launch")).toBe(false);
  });

  it("기획 단계는 장르+로그라인+시놉시스가 필요한다", () => {
    const base = createEmptyLaunchDraft();
    expect(isLaunchStepComplete({ ...base, genre: "romance" }, "plan")).toBe(false);
    expect(
      isLaunchStepComplete(
        { ...base, genre: "romance", logline: "한 줄", synopsis: "시놉" },
        "plan"
      )
    ).toBe(true);
    // 공백만 있으면 미완료
    expect(
      isLaunchStepComplete(
        { ...base, genre: "romance", logline: "   ", synopsis: "시놉" },
        "plan"
      )
    ).toBe(false);
  });

  it("시리즈 단계는 제목 2자 이상이 필요한다", () => {
    const base = createEmptyLaunchDraft();
    expect(isLaunchStepComplete({ ...base, title: "가" }, "series")).toBe(false);
    expect(isLaunchStepComplete({ ...base, title: "가나" }, "series")).toBe(true);
  });

  it("회차 단계는 제목과 원고 준비가 필요한다", () => {
    const base = createEmptyLaunchDraft();
    expect(
      isLaunchStepComplete({ ...base, episodeTitle: "1화" }, "episode")
    ).toBe(false);
    expect(
      isLaunchStepComplete(
        { ...base, episodeTitle: "1화", episodePagesReady: true },
        "episode"
      )
    ).toBe(true);
  });

  it("launch 단계는 앞의 모든 단계가 완료되어야 한다", () => {
    const draft = completeDraft();
    expect(isLaunchStepComplete(draft, "launch")).toBe(true);
    expect(
      isLaunchStepComplete({ ...draft, scheduleDecided: false }, "launch")
    ).toBe(false);
  });

  it("진행률을 계산한다", () => {
    expect(getLaunchProgress(createEmptyLaunchDraft())).toEqual({
      completed: 0,
      total: 4,
      percent: 0,
    });
    const draft = completeDraft();
    expect(getLaunchProgress(draft)).toEqual({
      completed: 4,
      total: 4,
      percent: 100,
    });
    const partial = { ...createEmptyLaunchDraft(), genre: "sf" as const, logline: "a", synopsis: "b" };
    expect(getLaunchProgress(partial).percent).toBe(25);
  });

  it("다음 할 일은 가장 앞의 미완료 단계다", () => {
    expect(getNextIncompleteStep(createEmptyLaunchDraft())).toBe("plan");
    expect(getNextIncompleteStep(completeDraft())).toBe(null);
    const draft = {
      ...createEmptyLaunchDraft(),
      genre: "sf" as const,
      logline: "a",
      synopsis: "b",
      title: "ab",
    };
    expect(getNextIncompleteStep(draft)).toBe("episode");
  });

  it("이전 단계가 완료되어야 다음 단계로 이동할 수 있다", () => {
    const draft = createEmptyLaunchDraft();
    expect(canNavigateToStep(draft, "plan")).toBe(true);
    expect(canNavigateToStep(draft, "series")).toBe(false);
    const planned = { ...draft, genre: "sf" as const, logline: "a", synopsis: "b" };
    expect(canNavigateToStep(planned, "series")).toBe(true);
    expect(canNavigateToStep(planned, "episode")).toBe(false);
  });

  it("미비 항목을 단계별로 반환한다", () => {
    const issues = validateLaunchDraft(createEmptyLaunchDraft());
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].stepId).toBe("plan");
    expect(validateLaunchDraft(completeDraft())).toEqual([]);
  });

  it("초안을 시리즈 생성 입력으로 변환한다", () => {
    const input = toSeriesInput({
      ...completeDraft(),
      logline: "로그라인",
      description: "소개",
      cover: "",
      tags: [],
    });
    expect(input.title).toBe("옥상 방과후");
    expect(input.description).toContain("로그라인");
    expect(input.description).toContain("소개");
    expect(input.status).toBe("ongoing");
    expect(input.cover).toBeUndefined();
  });

  it("태그를 파싱하고 최대 8개로 제한한다", () => {
    expect(parseLaunchTags("학원물, 설렘\n비밀연애")).toEqual([
      "학원물",
      "설렘",
      "비밀연애",
    ]);
    expect(parseLaunchTags("a,b,c,d,e,f,g,h,i,j")).toHaveLength(8);
    expect(parseLaunchTags("  ")).toEqual([]);
  });

  it("선택 상자의 값은 목록에 있는 장르로만 좁히고, 빈 선택·모르는 값은 null로 둔다", () => {
    expect(parseLaunchGenre("romance")).toBe("romance");
    expect(parseLaunchGenre("sf")).toBe("sf");
    expect(parseLaunchGenre("")).toBeNull();
    expect(parseLaunchGenre("opera")).toBeNull();
  });
});
