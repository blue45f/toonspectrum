import { describe, expect, it } from "vitest";

import { STUDIO_LIFT3D_LIMITS, STUDIO_LIFT3D_SUBJECTS } from "./studio-lift3d-contract";
import {
  STUDIO_LIFT3D_PRESETS,
  liftStudioImageTo3d,
  liftStudioImageTo3dGlb,
} from "./studio-lift3d-pipeline";
import {
  discImage,
  encodeTestPng,
  opaqueSquareImage,
  verticalGradientImage,
} from "./studio-lift3d.test-fixture";

describe("Studio Lift 3D 파이프라인", () => {
  it("모든 피사체 종류에 프리셋이 있다", () => {
    for (const subject of STUDIO_LIFT3D_SUBJECTS) {
      expect(STUDIO_LIFT3D_PRESETS[subject].label.length).toBeGreaterThan(0);
    }
  });

  it("캐릭터 프리셋이 컷아웃 PNG 를 닫힌 입체로 들어올린다", () => {
    const lifted = liftStudioImageTo3d(discImage(128), { subject: "character" });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;
    expect(lifted.value.metrics.closed).toBe(true);
    expect(lifted.value.metrics.boundaryEdgeCount).toBe(0);
    expect(lifted.value.metrics.triangleCount).toBeGreaterThan(500);
    expect(lifted.value.geometry.bounds.max.y).toBeCloseTo(1.7, 5);
    expect(lifted.value.mask.mode).toBe("alpha");
  });

  it("배경 프리셋은 이미지 전체를 부조 슬래브로 세운다", () => {
    const lifted = liftStudioImageTo3d(verticalGradientImage(96), { subject: "background" });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;
    expect(lifted.value.mask.mode).toBe("full");
    expect(lifted.value.mask.coverage).toBe(1);
    expect(lifted.value.geometry.mode).toBe("relief");
    expect(lifted.value.metrics.closed).toBe(true);
    expect(lifted.value.geometry.bounds.max.y).toBeCloseTo(6, 5);
  });

  it("소품 프리셋이 캐릭터보다 두껍게 부풀린다", () => {
    const character = liftStudioImageTo3d(discImage(96), { subject: "character" });
    const prop = liftStudioImageTo3d(discImage(96), { subject: "prop" });

    expect(character.ok && prop.ok).toBe(true);
    if (!character.ok || !prop.ok) return;
    const relativeDepth = (bounds: { min: { z: number }; max: { z: number; y: number } }) =>
      (bounds.max.z - bounds.min.z) / bounds.max.y;
    expect(relativeDepth(prop.value.geometry.bounds))
      .toBeGreaterThan(relativeDepth(character.value.geometry.bounds) * 1.5);
  });

  it("알파 없는 원화는 배경 키로 넘어가며 그 사실을 경고로 남긴다", () => {
    const lifted = liftStudioImageTo3d(opaqueSquareImage(96), { subject: "character" });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;
    expect(lifted.value.mask.mode).toBe("key");
    expect(lifted.warnings.map((warning) => warning.code)).toContain("alpha-absent");
  });

  it("피사체가 없으면 예외가 아니라 사유 코드로 거절한다", () => {
    const blank = {
      width: 64,
      height: 64,
      pixels: new Uint8ClampedArray(64 * 64 * 4),
    };
    const lifted = liftStudioImageTo3d(blank, { subject: "character" });

    expect(lifted.ok).toBe(false);
    if (lifted.ok) return;
    expect(lifted.code).toBe("empty-subject");
    expect(lifted.detail.length).toBeGreaterThan(0);
  });

  it("잘못된 원본을 앞단에서 걸러낸다", () => {
    const broken = { width: 32, height: 32, pixels: new Uint8ClampedArray(16) };
    const lifted = liftStudioImageTo3d(broken, { subject: "character" });

    expect(lifted.ok).toBe(false);
    if (lifted.ok) return;
    expect(lifted.code).toBe("invalid-source");
  });

  it("해상도를 예산 안으로 조이고 조정 사실을 알린다", () => {
    const lifted = liftStudioImageTo3d(discImage(96), {
      subject: "character",
      resolution: STUDIO_LIFT3D_LIMITS.maxResolution + 400,
    });

    expect(lifted.ok).toBe(true);
    if (!lifted.ok) return;
    expect(lifted.warnings.map((warning) => warning.code)).toContain("resolution-clamped");
    expect(Math.max(lifted.value.metrics.gridWidth, lifted.value.metrics.gridHeight))
      .toBeLessThanOrEqual(STUDIO_LIFT3D_LIMITS.maxResolution);
  });

  it("같은 원화·같은 설정이면 같은 메시 해시가 나온다", () => {
    const first = liftStudioImageTo3d(discImage(96), { subject: "character" });
    const second = liftStudioImageTo3d(discImage(96), { subject: "character" });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.meshHash).toBe(second.value.meshHash);
  });

  it("설정을 바꾸면 결과 해시도 바뀐다", () => {
    const base = liftStudioImageTo3d(discImage(96), { subject: "character" });
    const deeper = liftStudioImageTo3d(discImage(96), { subject: "character", depthScale: 0.6 });

    expect(base.ok && deeper.ok).toBe(true);
    if (!base.ok || !deeper.ok) return;
    expect(base.value.meshHash).not.toBe(deeper.value.meshHash);
  });

  it("리프트와 GLB 인코딩을 한 번에 돌려준다", () => {
    const source = discImage(96);
    const exported = liftStudioImageTo3dGlb(
      source,
      { subject: "character" },
      { name: "주인공", texture: { mimeType: "image/png", bytes: encodeTestPng(source) } },
    );

    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.value.glb.fileName).toBe("주인공.glb");
    expect(exported.value.glb.metrics.textureByteLength).toBeGreaterThan(0);
    expect(exported.value.lift.metrics.closed).toBe(true);
    // GLB 매직 "glTF".
    expect(Array.from(exported.value.glb.bytes.slice(0, 4)))
      .toEqual([0x67, 0x6c, 0x54, 0x46]);
  });
});
