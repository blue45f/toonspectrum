/**
 * 3D 데생 인형 캡처 결과 계약 테스트 — resolveStudioMannequinCaptureResult 는 순수 함수라
 * WebGL 없이 검증한다. display 쌍은 "둘 다 유한 양수이면서 래스터 이하"일 때만 포함된다
 * (업스케일 삽입 금지 — VRM 3D 삽입 컨트롤러의 resolveVrmInsertDisplaySize 와 같은 규칙).
 */
import { describe, expect, it } from "vitest";

import { resolveStudioMannequinCaptureResult } from "./studio-mannequin-scene";

const PNG = "data:image/png;base64,AAAA";

describe("resolveStudioMannequinCaptureResult", () => {
  it("래스터가 논리 뷰보다 크면(슈퍼샘플 캡처) display 쌍을 포함한다", () => {
    const result = resolveStudioMannequinCaptureResult({
      pngDataUrl: PNG,
      width: 1280,
      height: 960,
      displayWidth: 640,
      displayHeight: 480,
    });
    expect(result).toEqual({
      pngDataUrl: PNG,
      width: 1280,
      height: 960,
      displayWidth: 640,
      displayHeight: 480,
    });
  });

  it("래스터와 논리 뷰가 같으면(1x·dpr1) display 쌍을 그대로 포함한다", () => {
    const result = resolveStudioMannequinCaptureResult({
      pngDataUrl: PNG,
      width: 640,
      height: 480,
      displayWidth: 640,
      displayHeight: 480,
    });
    expect(result.displayWidth).toBe(640);
    expect(result.displayHeight).toBe(480);
  });

  it("픽셀 예산 등으로 래스터가 뷰보다 작아지면 display 쌍을 생략한다(업스케일 금지)", () => {
    const result = resolveStudioMannequinCaptureResult({
      pngDataUrl: PNG,
      width: 500,
      height: 400,
      displayWidth: 640,
      displayHeight: 480,
    });
    expect(result).toEqual({ pngDataUrl: PNG, width: 500, height: 400 });
    expect("displayWidth" in result).toBe(false);
    expect("displayHeight" in result).toBe(false);
  });

  it("한 축만 래스터를 넘어도 쌍 전체를 생략한다(비율 왜곡 방지)", () => {
    const result = resolveStudioMannequinCaptureResult({
      pngDataUrl: PNG,
      width: 1280,
      height: 400,
      displayWidth: 640,
      displayHeight: 480,
    });
    expect(result.displayWidth).toBeUndefined();
    expect(result.displayHeight).toBeUndefined();
  });

  it("적대적 display 값(NaN/음수/0/Infinity)은 생략으로 fail-closed 한다", () => {
    for (const [displayWidth, displayHeight] of [
      [Number.NaN, 480],
      [640, Number.NaN],
      [-1, 480],
      [0, 480],
      [Number.POSITIVE_INFINITY, 480],
    ] as const) {
      const result = resolveStudioMannequinCaptureResult({
        pngDataUrl: PNG,
        width: 1280,
        height: 960,
        displayWidth,
        displayHeight,
      });
      expect(result.displayWidth, `w=${displayWidth} h=${displayHeight}`).toBeUndefined();
      expect(result.displayHeight, `w=${displayWidth} h=${displayHeight}`).toBeUndefined();
    }
  });
});
