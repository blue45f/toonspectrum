import { describe, expect, it } from "vitest";

import {
  TAP_MAX_DURATION_MS,
  TAP_MAX_MOVE_PX,
  SCRUB_INTERVAL_MS,
  beginScrub,
  classifyTap,
  describeGestureAction,
  describeScrubFeedback,
  defaultTouchGestureSettings,
  gestureForTap,
  nextScrubTick,
  normalizeTouchGestureSettings,
  stopScrub,
  type TouchSample,
  type TouchSequence,
} from "./touch-gesture-model";

/** 포인터 샘플을 만드는 테스트 헬퍼. */
function sample(
  pointerId: number,
  x: number,
  y: number,
  t: number,
  pointerType: TouchSample["pointerType"] = "touch",
): TouchSample {
  return { pointerId, x, y, t, pointerType };
}

/** TouchSequence 를 만드는 테스트 헬퍼. startTime 은 첫 샘플 시각을 사용한다. */
function sequence(fingerCount: number, samples: TouchSample[]): TouchSequence {
  return { samples, startTime: samples[0]?.t ?? 0, fingerCount };
}

/** 두 손가락이 정지 상태로 tEnd(ms)까지 머무는 시퀀스. */
function stationaryTwoFinger(tEnd: number): TouchSequence {
  return sequence(2, [
    sample(1, 100, 100, 0),
    sample(2, 160, 100, 0),
    sample(1, 100, 100, tEnd),
    sample(2, 160, 100, tEnd),
  ]);
}

describe("상수", () => {
  it("티켓 T1 명세 값과 일치한다", () => {
    expect(TAP_MAX_MOVE_PX).toBe(10);
    expect(TAP_MAX_DURATION_MS).toBe(300);
    expect(SCRUB_INTERVAL_MS).toBe(150);
  });
});

describe("classifyTap", () => {
  it("이동 5px·지속 200ms 두 손가락 접촉을 tap 으로 판정한다", () => {
    const seq = sequence(2, [
      sample(1, 100, 100, 0),
      sample(2, 160, 100, 0),
      sample(1, 105, 100, 200), // 5px 이동
      sample(2, 160, 105, 200), // 5px 이동
    ]);
    expect(classifyTap(seq)).toBe("tap");
  });

  it("이동 20px 두 손가락 접촉을 pan(줌/팬)으로 판정한다", () => {
    const seq = sequence(2, [
      sample(1, 100, 100, 0),
      sample(2, 160, 100, 0),
      sample(1, 120, 100, 200), // 20px 이동
      sample(2, 140, 100, 200), // 20px 이동
    ]);
    expect(classifyTap(seq)).toBe("pan");
  });

  it("손가락 하나만 기준을 넘겨도 pan 으로 판정한다", () => {
    const seq = sequence(2, [
      sample(1, 100, 100, 0),
      sample(2, 160, 100, 0),
      sample(1, 120, 100, 200), // 20px 이동
      sample(2, 160, 100, 200), // 정지
    ]);
    expect(classifyTap(seq)).toBe("pan");
  });

  it("경계: 정확히 10px 이동은 tap 이 아니다", () => {
    const seq = sequence(2, [
      sample(1, 100, 100, 0),
      sample(2, 160, 100, 0),
      sample(1, 110, 100, 200), // 정확히 10px
      sample(2, 160, 100, 200),
    ]);
    expect(classifyTap(seq)).toBe("pan");
  });

  it("경계: 299ms 지속은 tap, 301ms 지속은 hold 다", () => {
    expect(classifyTap(stationaryTwoFinger(299))).toBe("tap");
    expect(classifyTap(stationaryTwoFinger(301))).toBe("hold");
  });

  it("경계: 정확히 300ms 지속은 tap 이 아니다", () => {
    expect(classifyTap(stationaryTwoFinger(300))).toBe("hold");
  });

  it("움직이지 않고 오래 누르면 hold 로 판정한다 (스크럽 진입 가능)", () => {
    expect(classifyTap(stationaryTwoFinger(500))).toBe("hold");
  });

  it("움직이며 오래 누르면 pan 으로 판정한다", () => {
    const seq = sequence(2, [
      sample(1, 100, 100, 0),
      sample(2, 160, 100, 0),
      sample(1, 120, 100, 500),
      sample(2, 140, 100, 500),
    ]);
    expect(classifyTap(seq)).toBe("pan");
  });

  it("샘플이 비어 있으면 보수적으로 pan 을 반환한다 (tap 아님 보장)", () => {
    expect(classifyTap({ samples: [], startTime: 0, fingerCount: 0 })).toBe("pan");
  });

  it("한 손가락 짧은 접촉도 tap 으로 판정한다", () => {
    const seq = sequence(1, [
      sample(1, 50, 50, 0),
      sample(1, 52, 51, 120),
    ]);
    expect(classifyTap(seq)).toBe("tap");
  });

  it("pen 포인터도 동일하게 판정한다", () => {
    const seq = sequence(2, [
      sample(1, 100, 100, 0, "pen"),
      sample(2, 160, 100, 0, "pen"),
      sample(1, 102, 101, 150, "pen"),
      sample(2, 161, 102, 150, "pen"),
    ]);
    expect(classifyTap(seq)).toBe("tap");
  });

  it("왔다 갔다 해도 터치다운 지점에서 멀어진 최대 거리를 기준으로 삼는다", () => {
    const seq = sequence(1, [
      sample(1, 100, 100, 0),
      sample(1, 115, 100, 50), // 15px 까지 멀어졌다가
      sample(1, 100, 100, 100), // 복귀 (시작~끝 거리는 0)
    ]);
    expect(classifyTap(seq)).toBe("pan");
  });
});

describe("gestureForTap", () => {
  it("2손가락 → undo, 3손가락 → redo", () => {
    expect(gestureForTap(2)).toBe("undo");
    expect(gestureForTap(3)).toBe("redo");
  });

  it("1손가락·4손가락·0손가락 → none", () => {
    expect(gestureForTap(1)).toBe("none");
    expect(gestureForTap(4)).toBe("none");
    expect(gestureForTap(0)).toBe("none");
  });
});

describe("스크럽 틱", () => {
  it("비활성 상태에서는 틱이 발생하지 않는다", () => {
    const state = stopScrub();
    const result = nextScrubTick(state, 1000);
    expect(result.ticked).toBe(false);
    expect(result.state).toBe(state);
  });

  it("150ms 가 지나지 않으면 틱이 발생하지 않는다", () => {
    const state = beginScrub(1000);
    const result = nextScrubTick(state, 1000 + SCRUB_INTERVAL_MS - 1);
    expect(result.ticked).toBe(false);
    expect(result.state.count).toBe(0);
  });

  it("정확히 150ms 경과 시 틱이 발생하고 count 가 1 증가한다", () => {
    const state = beginScrub(1000);
    const result = nextScrubTick(state, 1000 + SCRUB_INTERVAL_MS);
    expect(result.ticked).toBe(true);
    expect(result.state.count).toBe(1);
    expect(result.state.lastTickAt).toBe(1000 + SCRUB_INTERVAL_MS);
    expect(result.state.active).toBe(true);
  });

  it("여러 구간을 건너뛰어도 호출당 1틱만 발생한다", () => {
    const state = beginScrub(1000);
    const result = nextScrubTick(state, 1000 + SCRUB_INTERVAL_MS * 3);
    expect(result.ticked).toBe(true);
    expect(result.state.count).toBe(1);
    expect(result.state.lastTickAt).toBe(1000 + SCRUB_INTERVAL_MS * 3);
  });

  it("연속 호출 시 150ms 간격으로 count 가 누적된다", () => {
    let state = beginScrub(0);
    for (let i = 1; i <= 3; i += 1) {
      const result = nextScrubTick(state, i * SCRUB_INTERVAL_MS);
      expect(result.ticked).toBe(true);
      state = result.state;
    }
    expect(state.count).toBe(3);
  });

  it("입력 상태를 변경하지 않는다 (순수 함수)", () => {
    const state = beginScrub(1000);
    const snapshot = { ...state };
    nextScrubTick(state, 1000 + SCRUB_INTERVAL_MS);
    expect(state).toEqual(snapshot);
  });
});

describe("설정", () => {
  it("기본값은 제스처 켜짐·실행취소/다시실행 켜짐·모션 축소 토스트 모드 꺼짐이다", () => {
    expect(defaultTouchGestureSettings()).toEqual({
      enabled: true,
      undoRedoGestures: true,
      reduceMotionToastOnly: false,
    });
  });

  it("null/undefined 입력은 기본값을 반환한다", () => {
    expect(normalizeTouchGestureSettings(null)).toEqual(defaultTouchGestureSettings());
    expect(normalizeTouchGestureSettings(undefined)).toEqual(defaultTouchGestureSettings());
  });

  it("부분 입력은 나머지를 기본값으로 채운다", () => {
    expect(normalizeTouchGestureSettings({ enabled: false })).toEqual({
      enabled: false,
      undoRedoGestures: true,
      reduceMotionToastOnly: false,
    });
  });

  it("boolean 이 아닌 값은 기본값으로 대체한다", () => {
    expect(
      normalizeTouchGestureSettings({
        enabled: "yes",
        undoRedoGestures: 1,
      } as unknown as Partial<ReturnType<typeof defaultTouchGestureSettings>>),
    ).toEqual(defaultTouchGestureSettings());
  });

  it("quickMenuGesture 는 boolean 일 때만 유지된다", () => {
    expect(
      normalizeTouchGestureSettings({ quickMenuGesture: true }).quickMenuGesture,
    ).toBe(true);
    expect(
      "quickMenuGesture" in normalizeTouchGestureSettings({}),
    ).toBe(false);
  });

  it("reduced-motion 설정(reduceMotionToastOnly)을 정규화한다", () => {
    expect(
      normalizeTouchGestureSettings({ reduceMotionToastOnly: true }).reduceMotionToastOnly,
    ).toBe(true);
    expect(
      normalizeTouchGestureSettings({ reduceMotionToastOnly: false }).reduceMotionToastOnly,
    ).toBe(false);
  });
});

describe("액션 설명", () => {
  it("한국어 기본 설명을 반환한다", () => {
    expect(describeGestureAction("undo")).toBe("실행 취소");
    expect(describeGestureAction("redo")).toBe("다시 실행");
    expect(describeGestureAction("none")).toBe("제스처 없음");
  });

  it("영어 설명을 반환한다", () => {
    expect(describeGestureAction("undo", "en")).toBe("Undo");
    expect(describeGestureAction("redo", "en")).toBe("Redo");
    expect(describeGestureAction("none", "en")).toBe("No gesture");
  });

  it("스크럽 토스트 문구를 만든다 (예: 3단계 실행 취소)", () => {
    expect(describeScrubFeedback("undo", 3)).toBe("3단계 실행 취소");
    expect(describeScrubFeedback("redo", 2)).toBe("2단계 다시 실행");
    expect(describeScrubFeedback("undo", 3, "en")).toBe("Undo 3 steps");
    expect(describeScrubFeedback("redo", 2, "en")).toBe("Redo 2 steps");
  });

  it("0 이하 단계 수는 1단계로 보정한다", () => {
    expect(describeScrubFeedback("undo", 0)).toBe("1단계 실행 취소");
  });
});
