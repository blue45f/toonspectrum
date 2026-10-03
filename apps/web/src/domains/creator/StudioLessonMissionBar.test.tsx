// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StudioLessonMissionBar } from "./StudioLessonMissionBar";
import { parseStudioLessonMission } from "./studio-lesson-mission";

const PRACTICE_KEY = "toonstudio:learning-practice:v1";
const MISSION_URL = "/studio/canvas?practice=lesson&lesson=story-board&mission=mission-story-board";

function renderBar(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <StudioLessonMissionBar />
    </MemoryRouter>,
  );
}

function readPracticeRecord() {
  const raw = window.localStorage.getItem(PRACTICE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as { missions: Record<string, { startedAt: string | null; completedAt: string | null }> };
  return parsed.missions["story-board"] ?? null;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("parseStudioLessonMission", () => {
  it("유효한 학습 실습 파라미터에서 미션을 찾는다", () => {
    const mission = parseStudioLessonMission(new URLSearchParams("practice=lesson&lesson=story-board&mission=mission-story-board"));
    expect(mission?.id).toBe("mission-story-board");
    expect(mission?.lessonId).toBe("story-board");
    expect(mission?.steps).toHaveLength(3);
  });

  it("mission id가 강좌와 맞지 않으면 거부한다", () => {
    expect(parseStudioLessonMission(new URLSearchParams("practice=lesson&lesson=story-board&mission=mission-inking"))).toBeNull();
    expect(parseStudioLessonMission(new URLSearchParams("practice=lesson&lesson=없는강좌&mission=mission-x"))).toBeNull();
  });

  it("lesson 실습이 아닌 진입은 거부한다", () => {
    expect(parseStudioLessonMission(new URLSearchParams("practice=trace"))).toBeNull();
    expect(parseStudioLessonMission(new URLSearchParams(""))).toBeNull();
    expect(parseStudioLessonMission(new URLSearchParams("practice=lesson&lesson=story-board"))).toBeNull();
  });
});

describe("StudioLessonMissionBar", () => {
  it("미션 안내를 띄우고 시작을 기록한 뒤 단계 체크와 완료까지 이어진다", async () => {
    renderBar(MISSION_URL);

    expect(await screen.findByText("한 문장에서 세 컷의 이야기로 — 스튜디오 실습")).toBeTruthy();
    expect(screen.getByText(/학습 실습 미션/)).toBeTruthy();

    // 진입만으로 실습 시작이 로컬 기록에 남는다(learn 버튼을 거치지 않은 직접 진입 포함).
    expect(readPracticeRecord()?.startedAt).toBeTruthy();
    expect(readPracticeRecord()?.completedAt).toBeNull();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /미션 완료로 기록/ })).toBeNull();

    for (const checkbox of checkboxes) fireEvent.click(checkbox);

    const completeButton = await screen.findByRole("button", { name: /미션 완료로 기록/ });
    fireEvent.click(completeButton);

    expect(readPracticeRecord()?.completedAt).toBeTruthy();
    expect(await screen.findByRole("button", { name: /다시 실습하기/ })).toBeTruthy();
  });

  it("파라미터가 없거나 어긋나면 아무것도 렌더하지 않는다", () => {
    const plain = renderBar("/studio/canvas");
    expect(plain.container.firstChild).toBeNull();
    cleanup();

    const mismatched = renderBar("/studio/canvas?practice=lesson&lesson=story-board&mission=mission-inking");
    expect(mismatched.container.firstChild).toBeNull();
    expect(readPracticeRecord()).toBeNull();
  });
});
