import { describe, expect, it } from "vitest";

import {
  STUDIO_LIFT3D_DECODE_MAX_DIMENSION,
  studioLift3dDecodeErrorMessage,
  studioLift3dDecodeSize,
  studioLift3dTextureMimeType,
} from "./studio-lift3d-image-decode";

describe("Studio Lift 3D 이미지 디코드 경계", () => {
  it("텍스처로 실을 수 있는 형식만 통과시킨다", () => {
    expect(studioLift3dTextureMimeType("image/png")).toBe("image/png");
    expect(studioLift3dTextureMimeType("image/webp")).toBe("image/webp");
    expect(studioLift3dTextureMimeType("image/gif")).toBeNull();
    expect(studioLift3dTextureMimeType(undefined)).toBeNull();
  });

  it("작은 이미지는 그대로 두고 큰 이미지만 종횡비를 지켜 줄인다", () => {
    expect(studioLift3dDecodeSize(800, 600)).toEqual({ width: 800, height: 600 });

    const reduced = studioLift3dDecodeSize(8000, 4000);
    expect(reduced.width).toBe(STUDIO_LIFT3D_DECODE_MAX_DIMENSION);
    expect(reduced.height).toBe(STUDIO_LIFT3D_DECODE_MAX_DIMENSION / 2);
  });

  it("아무리 가늘어도 한 변이 0 이 되지 않는다", () => {
    expect(studioLift3dDecodeSize(9000, 3).height).toBe(1);
  });

  it("실패 사유마다 사용자가 읽을 문장이 있다", () => {
    for (const code of ["decode-failed", "too-large", "too-small", "unsupported-type"] as const) {
      expect(studioLift3dDecodeErrorMessage(code).length).toBeGreaterThan(0);
    }
  });
});
