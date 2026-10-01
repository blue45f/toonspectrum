import { describe, expect, it } from "vitest";
import {
  stepStudioCatExpression,
  studioCharacterExpressionFrame,
  studioReactionExpression,
  type StudioCatExpressionState,
} from "./studio-virtual-space-expressions";

const catInput = { time: 0, distance: 400, playerSpeed: 0, reducedMotion: false, identity: "" };
const characterInput = {
  skinKey: "pink", time: 0, idleForMs: 5_000, moving: false,
  facing: "down" as const, reducedMotion: false, identity: "",
};

describe("제자리에 있는 고양이의 자연스러운 표정", () => {
  it("천천히 접근하면 반기고 다가오는 속도가 빠르면 살핀다", () => {
    const idle = stepStudioCatExpression(null, catInput);
    expect(idle).toMatchObject({ frame: 0, state: { expression: "idle", near: false } });
    expect(stepStudioCatExpression(idle.state, { ...catInput, time: 100, distance: 70 }))
      .toMatchObject({ frame: 4, state: { expression: "happy", near: true } });
    expect(stepStudioCatExpression(idle.state, { ...catInput, time: 100, distance: 70, playerSpeed: 160 }))
      .toMatchObject({ frame: 8, state: { expression: "curious", near: true } });
  });

  it("거리 경계에서 오가도 반가움 프레임을 처음부터 반복하지 않는다", () => {
    const greeting = stepStudioCatExpression(null, { ...catInput, distance: 109 });
    const insideMargin = stepStudioCatExpression(greeting.state, { ...catInput, time: 300, distance: 120 });
    expect(insideMargin).toMatchObject({ frame: 5, state: { expression: "happy", startedAt: 0, near: true } });
    const leave = stepStudioCatExpression(insideMargin.state, { ...catInput, time: 400, distance: 145 });
    expect(leave.state).toMatchObject({ expression: "idle", near: false });
    const outsideMargin = stepStudioCatExpression(leave.state, { ...catInput, time: 500, distance: 120 });
    expect(outsideMargin.state).toMatchObject({ expression: "idle", near: false });
  });

  it("호기심은 충분히 보여 준 뒤 멈춘 방문객에게 반가움으로 이어진다", () => {
    const curious = stepStudioCatExpression(null, { ...catInput, distance: 80, playerSpeed: 140 });
    const settle = stepStudioCatExpression(curious.state, { ...catInput, time: 1_000, distance: 80 });
    expect(settle.state.expression).toBe("curious");
    expect(settle.frame).toBe(10);
    const happy = stepStudioCatExpression(settle.state, { ...catInput, time: 1_800, distance: 80 });
    expect(happy).toMatchObject({ frame: 4, state: { expression: "happy", startedAt: 1_800 } });
    expect(stepStudioCatExpression(happy.state, { ...catInput, time: 4_200, distance: 80 }).state.expression).toBe("idle");
  });

  it("빠른 움직임을 다시 알아채되 반가움 도중 자세를 매 프레임 바꾸지 않는다", () => {
    const happy = stepStudioCatExpression(null, { ...catInput, distance: 80 });
    const beforeDwell = stepStudioCatExpression(happy.state, { ...catInput, time: 400, distance: 80, playerSpeed: 200 });
    expect(beforeDwell.state.expression).toBe("happy");
    const curious = stepStudioCatExpression(beforeDwell.state, { ...catInput, time: 1_000, distance: 80, playerSpeed: 200 });
    expect(curious.state.expression).toBe("curious");
    expect(stepStudioCatExpression(curious.state, { ...catInput, time: 3_200, distance: 80, playerSpeed: 200 }).state.expression).toBe("idle");
  });

  it("먼 곳에서는 짧게 눈을 깜박인 뒤 쉬고 방문객이 오면 깨어난다", () => {
    const idle = stepStudioCatExpression(null, catInput);
    expect([4_400, 4_600, 4_760, 4_920].map((time) => stepStudioCatExpression(idle.state, { ...catInput, time }).frame))
      .toEqual([1, 2, 3, 0]);
    const snooze = stepStudioCatExpression(idle.state, { ...catInput, time: 7_000 });
    expect(snooze).toMatchObject({ frame: 12, state: { expression: "snooze" } });
    expect(stepStudioCatExpression(snooze.state, { ...catInput, time: 9_000 }).frame).toBe(14);
    expect(stepStudioCatExpression(snooze.state, { ...catInput, time: 8_000, distance: 50, playerSpeed: 100 }))
      .toMatchObject({ frame: 8, state: { expression: "curious" } });
    expect(stepStudioCatExpression(snooze.state, { ...catInput, time: 13_000 }).state.expression).toBe("idle");
  });

  it("주변에 머문 방문객에게 쉬는 간격을 둔 뒤 다시 반응한다", () => {
    const greeting = stepStudioCatExpression(null, { ...catInput, distance: 80 });
    const rest = stepStudioCatExpression(greeting.state, { ...catInput, time: 2_400, distance: 80 });
    expect(stepStudioCatExpression(rest.state, { ...catInput, time: 8_399, distance: 80 }).state.expression).toBe("idle");
    expect(stepStudioCatExpression(rest.state, { ...catInput, time: 8_400, distance: 80 }).state.expression).toBe("happy");
  });

  it("동작 줄이기는 접근·속도·시간과 관계없이 정지 프레임으로 즉시 전환한다", () => {
    let state: StudioCatExpressionState | null = stepStudioCatExpression(null, { ...catInput, distance: 80 }).state;
    for (const [time, distance, playerSpeed] of [[400, 80, 140], [7_000, 500, 0], [900_000, 30, 200]]) {
      const next = stepStudioCatExpression(state, {
        ...catInput, time: time ?? 0, distance: distance ?? 0, playerSpeed: playerSpeed ?? 0, reducedMotion: true,
      });
      expect(next).toMatchObject({ frame: 0, state: { expression: "idle" } });
      state = next.state;
    }
  });

  it("scene 재시작으로 시간이 되돌아가면 이전 반응 시간을 버린다", () => {
    const old = stepStudioCatExpression(null, { ...catInput, time: 10_000, distance: 40 });
    const restarted = stepStudioCatExpression(old.state, { ...catInput, time: 0 });
    expect(restarted).toMatchObject({ frame: 0, state: { expression: "idle", startedAt: 0, lastTime: 0, near: false } });
    expect(stepStudioCatExpression(null, { ...catInput, time: NaN, distance: NaN, playerSpeed: NaN }))
      .toMatchObject({ frame: 0, state: { expression: "idle", lastTime: 0, near: false } });
  });

  it("같은 입력은 같은 결과를 만들고 긴 실행에서도 항상 해당 표정의 4개 프레임만 사용한다", () => {
    const run = (identity: string) => {
      let state: StudioCatExpressionState | null = null;
      const trace = [];
      for (let time = 0; time < 120_000; time += 137) {
        const next = stepStudioCatExpression(state, { ...catInput, identity, time, distance: time % 20_000 < 7_000 ? 70 : 400 });
        const start = { idle: 0, happy: 4, curious: 8, snooze: 12 }[next.state.expression];
        expect(Number.isInteger(next.frame)).toBe(true);
        expect(next.frame).toBeGreaterThanOrEqual(start);
        expect(next.frame).toBeLessThan(start + 4);
        trace.push(next.frame);
        state = next.state;
      }
      return trace;
    };
    expect(run("studio-cat-a")).toEqual(run("studio-cat-a"));
    expect(run("studio-cat-a")).not.toEqual(run("window-cat"));
  });
});

describe("캐릭터 정면 표정 atlas 선택", () => {
  it.each([["pink", 0], ["silver", 4], ["dark", 8], ["purple", 12]] as const)("%s 스킨의 표정 4개를 같은 행에서 선택한다", (skinKey, rowStart) => {
    expect(studioCharacterExpressionFrame({ ...characterInput, skinKey, time: 6_600 })).toBe(rowStart);
    expect(studioCharacterExpressionFrame({ ...characterInput, skinKey, expression: "happy" })).toBe(rowStart + 1);
    expect(studioCharacterExpressionFrame({ ...characterInput, skinKey, expression: "wave" })).toBe(rowStart + 2);
    expect(studioCharacterExpressionFrame({ ...characterInput, skinKey, expression: "surprised" })).toBe(rowStart + 3);
  });

  it("손인사·공감 이모트와 기존 wave 자세를 실제 표정으로 연결한다", () => {
    expect(studioCharacterExpressionFrame({ ...characterInput, reaction: "wave" })).toBe(2);
    expect(studioCharacterExpressionFrame({ ...characterInput, reaction: "heart" })).toBe(1);
    expect(studioCharacterExpressionFrame({ ...characterInput, motionState: "wave" })).toBe(2);
    expect(studioCharacterExpressionFrame({ ...characterInput, reaction: "heart", expression: "surprised" })).toBe(3);
  });

  it.each(["left", "right", "up"] as const)("%s 방향을 갑자기 정면 표정으로 바꾸지 않는다", (facing) => {
    expect(studioCharacterExpressionFrame({ ...characterInput, facing, reaction: "wave" })).toBeNull();
  });

  it.each(["walk", "talk", "draw", "review", "sit"] as const)("%s 자세를 표정으로 덮어쓰지 않는다", (motionState) => {
    expect(studioCharacterExpressionFrame({ ...characterInput, motionState, reaction: "wave" })).toBeNull();
  });

  it("이동 중이거나 지원하지 않는 스킨은 기존 이미지와 애니메이션을 유지한다", () => {
    expect(studioCharacterExpressionFrame({ ...characterInput, moving: true, reaction: "wave" })).toBeNull();
    expect(studioCharacterExpressionFrame({ ...characterInput, skinKey: "imagegen25", reaction: "wave" })).toBeNull();
    expect(studioCharacterExpressionFrame({ ...characterInput, skinKey: "custom-upload", reaction: "heart" })).toBeNull();
  });

  it("충분히 멈춘 후 드물고 짧게 눈을 깜박이고 그 외에는 기존 자세를 유지한다", () => {
    expect(studioCharacterExpressionFrame({ ...characterInput, time: 6_559 })).toBeNull();
    expect(studioCharacterExpressionFrame({ ...characterInput, time: 6_560 })).toBe(0);
    expect(studioCharacterExpressionFrame({ ...characterInput, time: 6_740 })).toBeNull();
    expect(studioCharacterExpressionFrame({ ...characterInput, time: 6_600, idleForMs: 999 })).toBeNull();
    expect(studioCharacterExpressionFrame({ ...characterInput, time: 6_600, idleForMs: NaN })).toBeNull();
  });

  it("동작 줄이기는 자동 눈 깜박임을 멈추지만 직접 보낸 이모트는 정지 표정으로 보여 준다", () => {
    expect(studioCharacterExpressionFrame({ ...characterInput, time: 6_600, reducedMotion: true })).toBeNull();
    expect(studioCharacterExpressionFrame({ ...characterInput, reducedMotion: true, reaction: "wave" })).toBe(2);
  });
});

describe("이모트 표정 연결", () => {
  it("laugh→happy 프레임, wow→surprised, sleep→눈감음, 미지원 스킨 null", () => {
    expect(studioCharacterExpressionFrame({ ...characterInput, reaction: "laugh" })).toBe(1);
    expect(studioCharacterExpressionFrame({ ...characterInput, reaction: "wow" })).toBe(3);
    expect(studioCharacterExpressionFrame({ ...characterInput, reaction: "sleep" })).toBe(0);
    expect(studioCharacterExpressionFrame({ ...characterInput, skinKey: "silver", reaction: "think" })).toBe(4);
    expect(studioCharacterExpressionFrame({ ...characterInput, skinKey: "purple", reaction: "party" })).toBe(13);
    expect(studioCharacterExpressionFrame({ ...characterInput, expression: "calm" })).toBe(0);
    expect(studioCharacterExpressionFrame({ ...characterInput, skinKey: "npc-cafe", reaction: "laugh" })).toBeNull();
    expect(studioCharacterExpressionFrame({ ...characterInput, skinKey: "imagegen25", reaction: "wow" })).toBeNull();
  });

  it("표정이 없는 춤 이모트는 기존 자세를 유지한다", () => {
    expect(studioReactionExpression("dance")).toBeNull();
    expect(studioCharacterExpressionFrame({ ...characterInput, reaction: "dance" })).toBeNull();
    expect(studioReactionExpression("coffee")).toBe("calm");
    expect(studioReactionExpression(null)).toBeNull();
  });
});
