// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_OIL_IMPASTO_RELIEF_HIGHLIGHT_COLOR,
} from "./studio-oil-ribbon-carrier";
import { StudioDrawNode } from "./StudioDrawNode";

import type { DrawEl } from "./studio-element-model";

interface CapturedKonvaNode {
  kind: string;
  props: Record<string, unknown>;
}

const konvaCapture = vi.hoisted(() => ({
  nodes: [] as CapturedKonvaNode[],
}));

vi.mock("react-konva/lib/ReactKonvaCore", async () => {
  const { Fragment, createElement } = await import("react");
  const capture = (kind: string, renderChildren = false) =>
    (props: Record<string, unknown>) => {
      konvaCapture.nodes.push({ kind, props });
      return renderChildren
        ? createElement(Fragment, null, props.children as import("react").ReactNode)
        : null;
    };
  return {
    Arrow: capture("Arrow"),
    Circle: capture("Circle"),
    Ellipse: capture("Ellipse"),
    Group: capture("Group", true),
    Line: capture("Line"),
    Path: capture("Path"),
    Rect: capture("Rect"),
    Shape: capture("Shape"),
    Star: capture("Star"),
  };
});

interface RecordedStroke {
  alpha: number;
  cap: CanvasLineCap;
  composite: string;
  style: string;
  width: number;
}

/** Records every stroke pass with the compositing state it was painted under. */
class OilSceneContext {
  readonly fills: Array<{ alpha: number; style: string }> = [];
  readonly strokes: RecordedStroke[] = [];
  fillStyle: string | CanvasGradient | CanvasPattern = "";
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  lineCap: CanvasLineCap = "butt";
  lineJoin: CanvasLineJoin = "miter";
  lineWidth = 1;
  strokeStyle: string | CanvasGradient | CanvasPattern = "";

  save(): void {}
  restore(): void {}
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  fill(): void {
    this.fills.push({ alpha: this.globalAlpha, style: String(this.fillStyle) });
  }
  stroke(): void {
    this.strokes.push({
      alpha: this.globalAlpha,
      cap: this.lineCap,
      composite: this.globalCompositeOperation,
      style: String(this.strokeStyle),
      width: this.lineWidth,
    });
  }
}

function oilEl(brush: string): DrawEl {
  return {
    id: `impasto-node-${brush}`,
    type: "draw",
    kind: "freehand",
    brush,
    points: [8, 60, 120, 64, 260, 52, 420, 66],
    pressures: [0.42, 0.78, 0.6, 0.7],
    stroke: "#8b3f31",
    strokeWidth: 24,
  };
}

function paintOilShape(): OilSceneContext {
  const shapes = konvaCapture.nodes.filter(({ kind }) => kind === "Shape");
  expect(shapes).toHaveLength(1);
  const context = new OilSceneContext();
  (shapes[0]!.props.sceneFunc as (context: OilSceneContext) => void)(context);
  return context;
}

beforeEach(() => {
  konvaCapture.nodes.length = 0;
});

afterEach(() => {
  cleanup();
});

describe("StudioDrawNode — brush--impasto-relief Canvas 릴리프 오버레이", () => {
  it("임파스토 릴리프 레인만 screen 글린트와 round-cap 코어 섀도우를 페인트한다", () => {
    render(<StudioDrawNode el={oilEl("brush--impasto-relief")} />);
    const context = paintOilShape();

    // 유화 바디는 그대로 한 번 채운다.
    expect(context.fills.length).toBeGreaterThan(0);
    const bandStrokes = context.strokes.filter(({ cap }) => cap === "butt");
    const glints = context.strokes.filter(
      ({ composite, style }) =>
        composite === "screen" && style === STUDIO_OIL_IMPASTO_RELIEF_HIGHLIGHT_COLOR,
    );
    const coreShadows = context.strokes.filter(
      ({ cap, composite, style }) =>
        cap === "round" && composite === "multiply" && style === "#8b3f31",
    );
    expect(bandStrokes.length).toBeGreaterThan(0);
    expect(glints.length).toBeGreaterThan(0);
    expect(coreShadows.length).toBeGreaterThan(0);
    // (kind × 톤 버킷) 양자화: 릴리프는 최대 3 + 3 페인트 패스.
    expect(glints.length + coreShadows.length).toBeLessThanOrEqual(6);
    for (const glint of glints) {
      expect(glint.cap).toBe("round");
      expect(glint.alpha).toBeGreaterThan(0);
      expect(glint.alpha).toBeLessThanOrEqual(0.44);
    }
    // 페인트 순서 계약: 릴리프는 강모 밴드 뒤에, 섀도우가 글린트보다 먼저.
    const lastBand = context.strokes.map(({ cap }) => cap).lastIndexOf("butt");
    const firstRelief = context.strokes.findIndex(({ cap }) => cap === "round");
    expect(firstRelief).toBeGreaterThan(lastBand);
    const firstGlint = context.strokes.findIndex(
      ({ composite }) => composite === "screen",
    );
    const lastCoreShadow = context.strokes
      .map(({ cap, composite }) => cap === "round" && composite === "multiply")
      .lastIndexOf(true);
    expect(firstGlint).toBeGreaterThan(lastCoreShadow);
  });

  it.each(["oil--impasto-ribbon", "brush--oil-lanes", "brush--bristle-depletion"])(
    "프로그램에 핀되지 않은 유화 형제 레인(%s)은 릴리프 패스를 전혀 페인트하지 않는다",
    (brush) => {
      render(<StudioDrawNode el={oilEl(brush)} />);
      const context = paintOilShape();

      expect(context.strokes.length).toBeGreaterThan(0);
      expect(context.strokes.every(({ cap }) => cap === "butt")).toBe(true);
      expect(context.strokes.some(({ composite }) => composite === "screen")).toBe(false);
      expect(context.strokes.some(
        ({ style }) => style === STUDIO_OIL_IMPASTO_RELIEF_HIGHLIGHT_COLOR,
      )).toBe(false);
    },
  );
});
