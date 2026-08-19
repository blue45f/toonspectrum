// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioDrawNode } from "./brush/StudioDrawNode";
import { applyStudioSmartShapeBrushEffect } from "./studio-smart-shape-brush-effect";

import type { DrawEl } from "./studio-element-model";

interface CapturedNode {
  readonly kind: string;
  readonly props: Record<string, unknown>;
}

const capture = vi.hoisted(() => ({ nodes: [] as CapturedNode[] }));

vi.mock("react-konva/lib/ReactKonvaCore", async () => {
  const { Fragment, createElement } = await import("react");
  const node = (kind: string, children = false) => (props: Record<string, unknown>) => {
    capture.nodes.push({ kind, props });
    return children
      ? createElement(Fragment, null, props.children as import("react").ReactNode)
      : null;
  };
  return {
    Arrow: node("Arrow"),
    Circle: node("Circle"),
    Ellipse: node("Ellipse"),
    Group: node("Group", true),
    Line: node("Line"),
    Rect: node("Rect"),
    Shape: node("Shape"),
    Star: node("Star"),
  };
});

function geometric(): DrawEl {
  return {
    id: "smart-shape-canvas",
    type: "draw",
    kind: "rect",
    mode: "pen",
    points: [10, 20, 210, 120],
    stroke: "#42ff8b",
    strokeWidth: 14,
    opacity: 1,
  };
}

function source(overrides: Partial<DrawEl> = {}): DrawEl {
  return {
    ...geometric(),
    kind: "freehand",
    points: [10, 20, 70, 22, 140, 19, 210, 20],
    brush: "neon",
    pressures: [0.4, 0.6, 0.8, 1],
    pressureModel: "linear-full-v1",
    sampleSpacing: 0,
    ...overrides,
  };
}

beforeEach(() => {
  capture.nodes.length = 0;
});

afterEach(cleanup);

describe("smart-shape selected brush Canvas route", () => {
  it("renders the completed shape through the real multi-pass neon Canvas nodes", () => {
    const result = applyStudioSmartShapeBrushEffect(geometric(), source());
    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;

    render(<StudioDrawNode el={result.stroke} />);

    const lines = capture.nodes.filter((entry) => entry.kind === "Line");
    expect(capture.nodes.some((entry) => entry.kind === "Rect")).toBe(false);
    expect(capture.nodes.some((entry) => entry.kind === "Group")).toBe(true);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const line of lines) {
      expect(line.props.globalCompositeOperation).toBe("source-over");
      expect(line.props.points).toEqual(result.stroke.points);
    }
    expect(new Set(lines.map((line) => line.props.strokeWidth)).size).toBeGreaterThan(1);
  });

  it("keeps an incompatible causal stamp as the stable native geometric node", () => {
    const result = applyStudioSmartShapeBrushEffect(geometric(), source({
      brush: "ink-brush",
      stampPipeline: "causal-walker-v2",
    }));
    expect(result).toMatchObject({ status: "fallback", reason: "causal-stamp" });

    render(<StudioDrawNode el={result.stroke} />);

    expect(capture.nodes.filter((entry) => entry.kind === "Rect")).toHaveLength(1);
    expect(capture.nodes.filter((entry) => entry.kind === "Group")).toHaveLength(1);
    expect(capture.nodes.some((entry) => entry.kind === "Line")).toBe(false);
    expect(capture.nodes.some((entry) => entry.kind === "Shape")).toBe(false);
  });
});
