import { describe, expect, it } from "vitest";

import {
  BALLOON_PRESETS,
  balloonBodyConnectionPoint,
  balloonBodySvgPath,
  balloonInnerSvgPath,
  balloonIsDashed,
  balloonRectConnectionPoint,
  balloonTailSvgPath,
  createBalloon,
  moveTailTip,
  reconnectTail,
  type SpeechBalloon,
} from "./speech-balloon";

function makeBalloon(preset: SpeechBalloon["preset"] = "normal"): SpeechBalloon {
  return createBalloon("b1", preset, { x: 0, y: 0, w: 200, h: 100 }, { text: "안녕" });
}

describe("BALLOON_PRESETS", () => {
  it("프리셋이 6종 이상이다", () => {
    expect(BALLOON_PRESETS.length).toBeGreaterThanOrEqual(6);
  });

  it("요구된 6종(일반·생각·외침·속삭임·사각·구름)을 포함한다", () => {
    const presets = BALLOON_PRESETS.map((p) => p.preset);
    for (const required of ["normal", "thought", "shout", "whisper", "rectangle", "cloud"]) {
      expect(presets).toContain(required);
    }
  });
});

describe("balloonBodyConnectionPoint", () => {
  it("tip 방향의 타원 외곽 위에 연결점을 계산한다", () => {
    const body = { x: 0, y: 0, w: 200, h: 100 };
    const tip = { x: 300, y: 50 }; // 정중앙 오른쪽
    const p = balloonBodyConnectionPoint(body, tip);
    expect(p.x).toBeCloseTo(200, 6);
    expect(p.y).toBeCloseTo(50, 6);
  });

  it("tip이 중심과 같으면 기본 지점을 반환한다", () => {
    const body = { x: 0, y: 0, w: 200, h: 100 };
    const p = balloonBodyConnectionPoint(body, { x: 100, y: 50 });
    expect(p.x).toBeCloseTo(200, 6);
    expect(p.y).toBeCloseTo(50, 6);
  });
});

describe("balloonRectConnectionPoint", () => {
  it("사각 외곽 위의 연결점을 계산한다", () => {
    const body = { x: 0, y: 0, w: 200, h: 100 };
    const p = balloonRectConnectionPoint(body, { x: 100, y: 300 }); // 정중앙 아래
    expect(p.x).toBeCloseTo(100, 6);
    expect(p.y).toBeCloseTo(100, 6);
  });
});

describe("moveTailTip", () => {
  it("꼬리가 없는 말풍선에 꼬리를 생성한다", () => {
    const balloon = createBalloon("b2", "rectangle", { x: 0, y: 0, w: 200, h: 100 });
    expect(balloon.tail).toBeUndefined();
    const moved = moveTailTip(balloon, { x: 100, y: 300 });
    expect(moved.tail).toBeDefined();
    expect(moved.tail!.tip).toEqual({ x: 100, y: 300 });
  });

  it("기존 꼬리의 끝점만 이동한다", () => {
    const balloon = makeBalloon();
    expect(balloon.tail).toBeDefined();
    const beforeStart = { ...balloon.tail!.start };
    const moved = moveTailTip(balloon, { x: 400, y: 400 });
    expect(moved.tail!.tip).toEqual({ x: 400, y: 400 });
    expect(moved.tail!.start).toEqual(beforeStart);
  });

  it("원본 말풍선을 변경하지 않는다", () => {
    const balloon = makeBalloon();
    const beforeTip = { ...balloon.tail!.tip };
    moveTailTip(balloon, { x: 1, y: 2 });
    expect(balloon.tail!.tip).toEqual(beforeTip);
  });
});

describe("reconnectTail", () => {
  it("tip 기준으로 꼬리 시작점을 본문 외곽에 다시 연결한다", () => {
    const balloon = makeBalloon();
    const moved = moveTailTip(balloon, { x: -100, y: 50 }); // 왼쪽
    const reconnected = reconnectTail(moved);
    expect(reconnected.tail!.start.x).toBeCloseTo(0, 3);
    expect(reconnected.tail!.start.y).toBeCloseTo(50, 3);
  });
});

describe("SVG path 생성", () => {
  it("모든 프리셋에서 유효한 path를 만든다", () => {
    for (const info of BALLOON_PRESETS) {
      const path = balloonBodySvgPath(makeBalloon(info.preset));
      expect(path.length).toBeGreaterThan(10);
      expect(path).toMatch(/^M /);
      expect(path.trim().endsWith("Z")).toBe(true);
    }
  });

  it("double 프리셋만 안쪽 path를 만든다", () => {
    expect(balloonInnerSvgPath(makeBalloon("double"))).not.toBeNull();
    expect(balloonInnerSvgPath(makeBalloon("normal"))).toBeNull();
  });

  it("꼬리가 없으면 tail path가 null이다", () => {
    const balloon = createBalloon("b3", "rectangle", { x: 0, y: 0, w: 200, h: 100 });
    expect(balloonTailSvgPath(balloon)).toBeNull();
  });

  it("일반 꼬리 path는 베지어(Q)를 포함하고 유효하다", () => {
    const path = balloonTailSvgPath(makeBalloon("normal"));
    expect(path).not.toBeNull();
    expect(path!).toContain("Q");
    expect(path!.trim().endsWith("Z")).toBe(true);
  });

  it("thought 프리셋 꼬리는 구름 원(A 호) 3개를 만든다", () => {
    const path = balloonTailSvgPath(makeBalloon("thought"));
    expect(path).not.toBeNull();
    expect(path!.split("A").length - 1).toBeGreaterThanOrEqual(6);
  });

  it("whisper 프리셋만 점선 판정이 true이다", () => {
    expect(balloonIsDashed(makeBalloon("whisper"))).toBe(true);
    expect(balloonIsDashed(makeBalloon("normal"))).toBe(false);
    expect(balloonIsDashed(makeBalloon("shout"))).toBe(false);
  });
});
