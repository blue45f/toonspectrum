import { describe, expect, it } from "vitest";

import poserSource from "./StudioVrmPoser.tsx?raw";

describe("VRM webcam initialization boundary", () => {
  it("prepares both motion engines before requesting a camera stream", () => {
    const start = poserSource.indexOf("const startCamera = async () =>");
    const finish = poserSource.indexOf("startCamera();", start);
    const flow = poserSource.slice(start, finish);
    expect(start).toBeGreaterThan(-1);
    expect(finish).toBeGreaterThan(start);
    expect(flow.indexOf("initFaceLandmarker()")).toBeGreaterThan(-1);
    expect(flow.indexOf("initPoseLandmarker()")).toBeGreaterThan(-1);
    expect(flow.indexOf("getUserMedia({")).toBeGreaterThan(flow.indexOf("initPoseLandmarker()"));
    expect(flow).toContain('let failureStage: "camera" | "engine" = "engine"');
    expect(flow).toContain('failureStage = "camera"');
  });

  it("separates engine guidance from camera permission recovery", () => {
    expect(poserSource).toContain('webcamErrorStage === "engine"');
    expect(poserSource).toContain("동작 인식 엔진 오류");
    expect(poserSource).toContain("카메라 권한 및 연결 오류");
    expect(poserSource).toContain('webcamErrorStage !== "engine"');
  });
});
