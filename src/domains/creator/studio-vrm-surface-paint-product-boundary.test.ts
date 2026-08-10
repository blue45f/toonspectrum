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
  it("has a real non-test StudioVrmPoser caller without moving ownership into StudioPage", () => {
    expect(poserSource).toContain('from "./studio-vrm-surface-paint-tool"');
    expect(poserSource).toContain("createStudioVrmSurfacePaintTool({");
    expect(poserSource).toContain("texturePaintSurfaceTool.begin({");
    expect(poserSource).toContain("texturePaintSurfaceTool.append(");
    expect(poserSource).toContain("texturePaintSurfaceTool.finish(pointerId)");
    expect(poserSource).toContain('tool: "surface-brush"');
    expect(poserSource).toContain("onPointerDown={beginTexturePaint}");
    expect(poserSource).toContain("onPointerMove={moveTexturePaint}");
    expect(poserSource).toContain("onPointerUp={finishTexturePaint}");
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

  it("shows unsupported and failure states without adding an interactive readback", () => {
    expect(panelSource).toContain("지원 범위: round 촉 · 혼색 없음");
    expect(panelSource).toContain("stamp/image");
    expect(panelSource).toContain("smudge/wet");
    expect(toolSource).toContain('code: "memory"');
    expect(toolSource).toContain('code: "upload"');
    expect(toolSource).toContain('deviceFailure ? "device-failure" : null');
    expect(`${poserSource}\n${toolSource}\n${adapterSource}`).not.toMatch(
      /\breadPixels\s*\(|\bgetImageData\s*\(/u,
    );
  });
});
