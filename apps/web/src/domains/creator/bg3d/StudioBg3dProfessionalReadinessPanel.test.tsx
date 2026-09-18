// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import {
  resolveStudioBg3dProfessionalRuntimeReadiness,
  type StudioBg3dProfessionalRuntimeReadiness,
} from "./studio-bg3d-professional-runtime-readiness";
import { StudioBg3dProfessionalReadinessPanel } from "./StudioBg3dProfessionalReadinessPanel";

const BOX: BgPrimitive = {
  id: "box-panel",
  kind: "box",
  position: [0, 0.5, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  color: "#ffffff",
};

function readiness(
  capabilities: Parameters<typeof resolveStudioBg3dProfessionalRuntimeReadiness>[0]["capabilities"],
  runtimeFailure?: Parameters<typeof resolveStudioBg3dProfessionalRuntimeReadiness>[0]["runtimeFailure"],
): StudioBg3dProfessionalRuntimeReadiness {
  return resolveStudioBg3dProfessionalRuntimeReadiness({
    authorityId: "panel-authority",
    primitives: [BOX],
    customModels: [],
    attachmentByStorageModelId: new Map(),
    baseDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    viewportAspectRatio: 1,
    revision: 2,
    capabilities,
    runtimeFailure,
  });
}

const WEBGPU = Object.freeze({
  webgpu: true,
  webgl2: false,
  computeShaders: true,
  timestampQueries: true,
  float16Shaders: true,
  compressedTextureAstc: true,
  compressedTextureBc: false,
  compressedTextureEtc2: false,
  maxTextureDimension2d: 8192,
  deviceMemoryGiB: 8,
});

describe("StudioBg3dProfessionalReadinessPanel", () => {
  it("shows the canonical renderer and NPR output readiness", () => {
    render(<StudioBg3dProfessionalReadinessPanel readiness={readiness(WEBGPU)} />);
    expect(screen.getByText("전문 출력 준비됨")).toBeTruthy();
    expect(screen.getByText("Three WebGPU · TSL")).toBeTruthy();
    expect(screen.getByText(/NPR 패스/u)).toBeTruthy();
    expect(screen.getByText(/객체 1/u)).toBeTruthy();
  });

  it("announces a renderer failure and authority-preserving recovery", () => {
    render(<StudioBg3dProfessionalReadinessPanel readiness={readiness(
      { ...WEBGPU, webgpu: false },
      { kind: "webgpu-device-lost", attempt: 1, recoverable: false },
    )} />);
    expect(screen.getByRole("alert").textContent).toContain("전문 3D 준비 차단");
    expect(screen.getByText("복구 계획")).toBeTruthy();
    expect(screen.getByText(/자동으로 엔진을 바꾸지 않고/u)).toBeTruthy();
  });
});
