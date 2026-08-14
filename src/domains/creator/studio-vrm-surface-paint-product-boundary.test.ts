import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const poserSource = readFileSync(new URL("./StudioVrmPoser.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");
const toolSource = readFileSync(
  new URL("./studio-vrm-surface-paint-tool.ts", import.meta.url),
  "utf8",
);
const adapterSource = readFileSync(
  new URL("./studio-vrm-surface-brush-provider.ts", import.meta.url),
  "utf8",
);
const panelSource = readFileSync(
  new URL("./StudioVrmTexturePaintPanel.tsx", import.meta.url),
  "utf8",
);

describe("VRM V12 surface-paint product boundary", () => {
  it("keeps the internal surface tool quarantined from the strict product pointer path", () => {
    const begin = poserSource.slice(
      poserSource.indexOf("const beginTexturePaint ="),
      poserSource.indexOf("const moveTexturePaint ="),
    );

    expect(poserSource).toContain('from "./studio-vrm-surface-paint-tool"');
    expect(poserSource).toContain("createStudioVrmSurfacePaintTool({");
    expect(begin).toContain("isStudioVrmTexturePaintBrushProductBlocked(settings.tool)");
    expect(begin).not.toContain("texturePaintSurfaceTool.begin({");
    expect(begin).not.toContain("runtime.beginStroke({");
    expect(poserSource).toContain('tool: "fill"');
    expect(poserSource).toContain("onPointerDown={beginTexturePaint}");
    expect(poserSource).toContain("onPointerMove={moveTexturePaint}");
    expect(poserSource).toContain("onPointerUp={finishTexturePaint}");
    expect(panelSource).not.toContain('onSettingsChange({ tool: "surface-brush" })');
    expect(panelSource).not.toContain('onSettingsChange({ tool: "brush" })');
    expect(pageSource).not.toContain("studio-vrm-surface-paint-tool");
  });

  it("keeps lifecycle exits abortable and the atlas commit canonical-once", () => {
    for (const reason of [
      "pointer-leave",
      "pointer-cancel",
      "lost-capture",
      "window-blur",
      "device-failure",
      "disabled",
      "tool-change",
      "unmount",
    ]) {
      expect(poserSource).toContain(`"${reason}"`);
    }
    expect(poserSource).toContain('addEventListener("webglcontextlost"');
    expect(toolSource.match(/await this\.executeStroke\(\{/gu)).toHaveLength(1);
    expect(toolSource).toContain("maxOperations: this.maxOperations");
    expect(adapterSource).toContain("commit: true");
    expect(adapterSource).toContain("commitSurfaceBrushSession(this.session");
  });

  it("preserves pressure and tilt IR while retaining seam-safe measured projection", () => {
    expect(toolSource).toContain("modelRawInput(");
    expect(toolSource).toContain("pressure: sample.pressure");
    expect(toolSource).toContain("tiltXDeg: sample.tiltX");
    expect(toolSource).toContain("tiltYDeg: sample.tiltY");
    expect(toolSource).toContain("brushProgram: built.brushProgram");
    expect(toolSource).toContain("stroke: built.stroke");
    expect(adapterSource).toContain("projection.islandId");
    expect(adapterSource).toContain("seamBefore: true");
    expect(adapterSource).toContain("worldUnitsPerCssPixelBySample");
    expect(poserSource).toContain("studioVrmSurfacePaintWorldUnitsPerCssPixel(");
  });

  it("shows one honest Korean unavailable state without adding an interactive readback", () => {
    expect(panelSource).toContain("표면 브러시 준비 중");
    expect(panelSource).toContain("surfaceBrushUnavailableReason");
    expect(poserSource).toContain("검증·승인된 3D 표면 브러시 엔진이 아직 연결되지 않아");
    expect(poserSource).toContain("자체 라운드 촉으로 대체하지 않으며");
    expect(poserSource).toContain("ColorDrop과 스포이드를 사용할 수 있습니다");
    expect(panelSource).toContain("disabled\n            aria-disabled=\"true\"");
    expect(panelSource).not.toContain("호환 폴백");
    expect(toolSource).toContain('code: "memory"');
    expect(toolSource).toContain('code: "upload"');
    expect(toolSource).toContain('deviceFailure ? "device-failure" : null');
    expect(`${poserSource}\n${toolSource}\n${adapterSource}`).not.toMatch(
      /\breadPixels\s*\(|\bgetImageData\s*\(/u,
    );
  });
});
