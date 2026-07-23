import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { STUDIO_CURVE_MAX_CONTROL_POINTS } from "./studio-curves";
import { StudioCurvePanel } from "./StudioCurvePanel";

import type { StudioImageDataLike } from "./studio-filters";

const curvePanelSource = readFileSync(
  new URL("./StudioCurvePanel.tsx", import.meta.url),
  "utf8",
);

function renderCurvePanel(): string {
  return renderToStaticMarkup(
    <StudioCurvePanel
      points={[
        { x: 0, y: 0 },
        { x: 128, y: 160 },
        { x: 255, y: 255 },
      ]}
      onChange={vi.fn()}
      onReset={vi.fn()}
    />,
  );
}

describe("StudioCurvePanel", () => {
  it("keeps the visible point geometry while adding a 44px-equivalent transparent target", () => {
    const html = renderCurvePanel();

    expect(html.match(/data-studio-curve-point-hit-target="true"/g)).toHaveLength(3);
    expect(html.match(/width="44" height="44"/g)).toHaveLength(3);
    expect(html.match(/r="4"/g)).toHaveLength(3);
    expect(curvePanelSource).toContain('fill="transparent"');
    expect(curvePanelSource).toContain('pointerEvents="none"');
    expect(curvePanelSource).toContain("const POINT_HIT_SIZE = 44");
    expect(curvePanelSource).toContain("function hitTargetOrigin(coordinate: number)");
    expect(html).toContain("min-w-[170px]");
  });

  it("resolves overlapping touch targets by nearest-point geometry instead of SVG paint order", () => {
    expect(curvePanelSource).toContain("const pointHitRefs = useRef<Array<SVGRectElement | null>>([])");
    expect(curvePanelSource).toContain("POINT_HIT_SIZE / Math.SQRT2");
    expect(curvePanelSource).toContain("onPointerDown={handlePointerDown}");
    expect(curvePanelSource).toContain("pointHitRefs.current[index]?.focus()");
    expect(curvePanelSource).toContain("if (event.detail === 0) setSelectedPointIndex(i)");
    expect(curvePanelSource.match(/setPointerCapture/g)).toHaveLength(1);
    expect(curvePanelSource).not.toContain("onPointerDown={(event) =>");
  });

  it("exposes every curve point as a focusable keyboard control", () => {
    const html = renderCurvePanel();

    expect(html.match(/tabindex="0"/g)).toHaveLength(3);
    expect(html.match(/role="button"/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(html.match(/aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown/g)).toHaveLength(3);
    expect(html).toContain('role="group" aria-label="톤 커브 편집기 (RGB 채널)"');
    expect(html).not.toContain('role="img"');
  });

  it("moves points by one or ten with arrows through the existing normalized engine", () => {
    expect(curvePanelSource).toContain(
      "const step = event.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP",
    );
    expect(curvePanelSource).toContain('if (event.key === "ArrowLeft") x -= step');
    expect(curvePanelSource).toContain('else if (event.key === "ArrowRight") x += step');
    expect(curvePanelSource).toContain('else if (event.key === "ArrowUp") y += step');
    expect(curvePanelSource).toContain('else if (event.key === "ArrowDown") y -= step');
    expect(curvePanelSource).toContain('event.key === "Enter" || event.key === " "');
    expect(curvePanelSource).toContain("emitCurve(moveCurvePoint(curve, index, x, y))");
  });

  it("provides selected-point X/Y inputs and explicit add/delete actions", () => {
    const html = renderCurvePanel();

    expect(html).toContain('data-studio-curve-point-editor="true"');
    expect(html).toContain('aria-label="선택한 제어점 X 좌표"');
    expect(html).toContain('aria-label="선택한 제어점 Y 좌표"');
    expect(html).toContain("점 추가");
    expect(html).toContain("점 삭제");
    expect(html.match(/min-h-11/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(curvePanelSource).toContain("const next = addCurvePoint(curve, suggestedPoint.x, suggestedPoint.y)");
    expect(curvePanelSource).toContain("const next = removeCurvePoint(curve, index)");
  });

  it("protects endpoint X and explains why deletion is unavailable", () => {
    const html = renderCurvePanel();

    expect(html).toMatch(/<input[^>]*readOnly=""[^>]*value="0"/);
    expect(html).toContain("첫 점과 마지막 점의 X 위치는 고정되며 Y만 조절할 수 있습니다.");
    expect(html).toMatch(/disabled=""[^>]*aria-describedby=/);
    expect(curvePanelSource).toContain(
      "const selectedPointIsEndpoint = selectedIndex === 0 || selectedIndex === curve.length - 1",
    );
  });

  it("normalizes malformed ordering before exposing point coordinates", () => {
    const html = renderToStaticMarkup(
      <StudioCurvePanel
        points={[
          { x: 220, y: 200 },
          { x: 30, y: 40 },
        ]}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    const first = html.indexOf("X 0, Y 40");
    const second = html.indexOf("X 30, Y 40");
    const third = html.indexOf("X 220, Y 200");
    const last = html.indexOf("X 255, Y 200");
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
    expect(last).toBeGreaterThan(third);
  });

  it("renders unchanged without a histogram source and mounts the luma histogram above the curve when provided", () => {
    expect(renderCurvePanel()).not.toContain("data-studio-histogram");

    const histogramSource: StudioImageDataLike = {
      data: new Uint8ClampedArray([
        0, 0, 0, 255,
        255, 255, 255, 255,
        128, 128, 128, 255,
        9, 9, 9, 0,
      ]),
      width: 2,
      height: 2,
    };
    const html = renderToStaticMarkup(
      <StudioCurvePanel
        points={[
          { x: 0, y: 0 },
          { x: 255, y: 255 },
        ]}
        histogramSource={histogramSource}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    expect(html).toContain('data-studio-histogram-section="true"');
    expect(html).toContain('data-studio-histogram-bars="true"');
    expect(html).toContain("휘도 히스토그램");
    const histogramIndex = html.indexOf("data-studio-histogram-section");
    const curveEditorIndex = html.indexOf("톤 커브 편집기");
    expect(histogramIndex).toBeGreaterThan(0);
    expect(curveEditorIndex).toBeGreaterThan(histogramIndex);
  });

  it("disables point insertion at the bounded shared-document limit and explains recovery", () => {
    const points = Array.from({ length: STUDIO_CURVE_MAX_CONTROL_POINTS }, (_, index) => ({
      x: Math.round(index * 255 / (STUDIO_CURVE_MAX_CONTROL_POINTS - 1)),
      y: Math.round(index * 255 / (STUDIO_CURVE_MAX_CONTROL_POINTS - 1)),
    }));
    const html = renderToStaticMarkup(
      <StudioCurvePanel points={points} onChange={vi.fn()} onReset={vi.fn()} />,
    );

    expect(html).toMatch(/disabled=""[^>]*title="채널마다 제어점은 최대 16개/);
    expect(html).toContain("채널마다 최대 16개까지 사용할 수 있습니다.");
    expect(curvePanelSource).toContain("if (curvePointLimitReached) return;");
  });
});
