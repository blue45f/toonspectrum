import { describe, expect, it } from "vitest";

import {
  XR_CUT_ASPECTS,
  XR_CUT_CAMERA_PRESETS,
  XR_CUT_LONG_EDGE_MAX_PX,
  XR_CUT_LONG_EDGE_MIN_PX,
  XrCutCaptureError,
  createXrCutCaptureJob,
  xrCutCaptureFilename,
  xrCutOutputSize,
  type XrCutCamera,
  type XrCutToonStyle,
} from "./xr-webtoon-cut-capture";

const CAMERA: XrCutCamera = {
  position: [0, 1.6, 4],
  lookAt: [0, 1.2, 0],
  fovDeg: 45,
};
const STYLE: XrCutToonStyle = {
  toonShading: true,
  outline: 0.7,
  screentone: "dots",
  halftone: true,
};

describe("xrCutOutputSize", () => {
  it("화면비에 맞는 해상도를 계산한다", () => {
    const square = xrCutOutputSize("cut-1-1", 1024);
    expect(square).toEqual({ width: 1024, height: 1024 });

    const portrait = xrCutOutputSize("cut-4-5", 1000);
    expect(portrait).toEqual({ width: 800, height: 1000 });

    const wide = xrCutOutputSize("cut-16-9", 1920);
    expect(wide.height).toBe(1080);
    expect(wide.width).toBe(1920);
  });

  it("범위를 벗어난 크기는 에러다", () => {
    expect(() => xrCutOutputSize("cut-1-1", XR_CUT_LONG_EDGE_MIN_PX - 1)).toThrow(
      XrCutCaptureError,
    );
    expect(() => xrCutOutputSize("cut-1-1", XR_CUT_LONG_EDGE_MAX_PX + 1)).toThrow(
      XrCutCaptureError,
    );
    expect(() => xrCutOutputSize("cut-1-1", Number.NaN)).toThrow(XrCutCaptureError);
  });

  it("알 수 없는 화면비는 에러다", () => {
    expect(() => xrCutOutputSize("cut-9-99" as never, 1024)).toThrow(XrCutCaptureError);
  });
});

describe("createXrCutCaptureJob", () => {
  it("유효한 입력으로 작업을 만든다", () => {
    const job = createXrCutCaptureJob({
      jobId: "job-1",
      aspectId: "cut-4-5",
      longEdgePx: 1000,
      camera: CAMERA,
      style: STYLE,
    });
    expect(job.kind).toBe("toonstudio.xr-cut-capture-job");
    expect(job.widthPx).toBe(800);
    expect(job.heightPx).toBe(1000);
    expect(job.camera.fovDeg).toBe(45);
    expect(Object.isFrozen(job)).toBe(true);
  });

  it("outline은 0..1로 정규화된다", () => {
    const job = createXrCutCaptureJob({
      jobId: "job-2",
      aspectId: "cut-1-1",
      longEdgePx: 512,
      camera: CAMERA,
      style: { ...STYLE, outline: 99 },
    });
    expect(job.style.outline).toBe(1);
  });

  it("잘못된 fov는 에러다", () => {
    expect(() =>
      createXrCutCaptureJob({
        jobId: "job-3",
        aspectId: "cut-1-1",
        longEdgePx: 512,
        camera: { ...CAMERA, fovDeg: 200 },
        style: STYLE,
      }),
    ).toThrow(XrCutCaptureError);
  });

  it("빈 jobId는 에러다", () => {
    expect(() =>
      createXrCutCaptureJob({
        jobId: "  ",
        aspectId: "cut-1-1",
        longEdgePx: 512,
        camera: CAMERA,
        style: STYLE,
      }),
    ).toThrow(XrCutCaptureError);
  });
});

describe("xrCutCaptureFilename", () => {
  it("예상 형식의 파일명을 만든다", () => {
    const job = createXrCutCaptureJob({
      jobId: "job-9",
      aspectId: "cut-4-5",
      longEdgePx: 1000,
      camera: CAMERA,
      style: STYLE,
    });
    expect(xrCutCaptureFilename(job)).toBe("toonstudio-cut-cut-4-5-800x1000.png");
  });
});

describe("XR_CUT_CAMERA_PRESETS", () => {
  it("프리셋이 유효한 카메라 값이다", () => {
    for (const preset of Object.values(XR_CUT_CAMERA_PRESETS)) {
      expect(preset.fovDeg).toBeGreaterThanOrEqual(10);
      expect(preset.fovDeg).toBeLessThanOrEqual(120);
      expect(preset.position).toHaveLength(3);
      expect(preset.lookAt).toHaveLength(3);
    }
  });

  it("화면비 레이블이 한/영 모두 있다", () => {
    for (const aspect of Object.values(XR_CUT_ASPECTS)) {
      expect(aspect.label.ko.length).toBeGreaterThan(0);
      expect(aspect.label.en.length).toBeGreaterThan(0);
    }
  });
});
