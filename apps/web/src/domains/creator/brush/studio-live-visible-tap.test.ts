import { afterEach, describe, expect, it } from "vitest";

import { isStudioImmediateFreehandCommit } from "./studio-draw-completion";
import {
  peekStudioStageCssScale,
  resolveStudioDrawTapRadius,
  studioLiveVisibleTapDocumentRadius,
} from "./studio-live-visible-tap";
import { studioKonvaRuntime } from "../render/studio-konva-runtime";

import type Konva from "konva";

/** 첫 레이아웃 전의 스테이지만 흉내낸다. width()는 컨테이너보다 작고 scaleX()는 정상이다. */
function pushStage(width: number, clientWidth: number, scaleX: number) {
  const stage = {
    width: () => width,
    scaleX: () => scaleX,
    content: { clientWidth },
  } as unknown as Konva.Stage;
  studioKonvaRuntime.stages.push(stage);
}

afterEach(() => {
  studioKonvaRuntime.stages.length = 0;
});

describe("studioLiveVisibleTapDocumentRadius", () => {
  it("keeps a planned nib that already covers the live CSS floor", () => {
    expect(studioLiveVisibleTapDocumentRadius(2.5, 1)).toBeCloseTo(2.5);
    expect(studioLiveVisibleTapDocumentRadius(3.22875, 1)).toBeCloseTo(3.22875);
  });

  it("grows only when the document nib would downsample below the live CSS floor", () => {
    expect(studioLiveVisibleTapDocumentRadius(1.25, 1)).toBeCloseTo(2.5);
    expect(studioLiveVisibleTapDocumentRadius(1.25, 0.25)).toBeCloseTo(10);
    expect(studioLiveVisibleTapDocumentRadius(0.4, 0.2)).toBeCloseTo(12.5);
  });

  it("leaves committed taps on the planned radius", () => {
    expect(resolveStudioDrawTapRadius(false, 0.35)).toBe(0.35);
    expect(resolveStudioDrawTapRadius(true, 3.22875)).toBeCloseTo(3.22875);
  });
});

describe("첫 획이 지연 배치로 잘못 라우팅되지 않는다", () => {
  it("레이아웃 전의 부풀어진 비율을 뷰 줌 범위로 걸러 스테이지 변환으로 되돌린다", () => {
    pushStage(100, 1600, 1);
    expect(peekStudioStageCssScale()).toBeCloseTo(1);
  });

  it("정상 비율과 실제 줌은 그대로 유지한다", () => {
    pushStage(1600, 1600, 1);
    expect(peekStudioStageCssScale()).toBeCloseTo(1);
    studioKonvaRuntime.stages.length = 0;
    pushStage(400, 1600, 4);
    expect(peekStudioStageCssScale()).toBeCloseTo(4);
  });

  it("첫 레이아웃 전의 짧은 획도 즉시 커밋으로 남는다", () => {
    // stage.width()가 컨테이너보다 작아 비율이 16배로 부풀면 travel 3px도 지연 배치로 넘어간다.
    pushStage(100, 1600, 1);
    expect(isStudioImmediateFreehandCommit({ kind: "freehand", points: [0, 0, 2, 3] })).toBe(true);
    expect(isStudioImmediateFreehandCommit({ kind: "freehand", points: [0, 0, 2, 3, 5, 6] })).toBe(true);
    // 긴 획은 부풀어진 비율과 관계없이 지연 배치를 유지한다.
    expect(isStudioImmediateFreehandCommit({ kind: "freehand", points: [0, 0, 12, 0, 25, 0] })).toBe(false);
  });
});
