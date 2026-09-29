import { describe, expect, it } from "vitest";

import { createVectorLayer } from "./vector-layer-model";
import { pointsToVectorStroke } from "./vector-stroke-path";
import {
  exportVectorLayerToSvg,
  vectorStrokeToDotCircle,
  vectorStrokeToOutlinePathD,
} from "./vector-layer-svg-export";

function twoStrokeLayer() {
  const first = pointsToVectorStroke(
    [
      { x: 10, y: 10, pressure: 1 },
      { x: 60, y: 10, pressure: 1 },
      { x: 110, y: 40, pressure: 1 },
    ],
    { baseWidth: 8, color: "#ff0000", opacity: 0.9, id: "s1" }
  )!;
  const second = pointsToVectorStroke(
    [
      { x: 10, y: 80, pressure: 1 },
      { x: 110, y: 80, pressure: 1 },
    ],
    { baseWidth: 4, color: "#0000ff", id: "s2" }
  )!;
  return createVectorLayer({
    id: "l1",
    name: "테스트 레이어",
    strokes: [first, second],
    opacity: 0.8,
  });
}

describe("exportVectorLayerToSvg", () => {
  it("유효한 SVG 문서를 생성한다", () => {
    const result = exportVectorLayerToSvg(twoStrokeLayer());
    expect(result.svg.startsWith("<svg")).toBe(true);
    expect(result.svg.endsWith("</svg>")).toBe(true);
    expect(result.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(result.mode).toBe("outline");
    expect(result.strokeCount).toBe(2);
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it("외곽선 모드에서 색상·불투명도가 반영된다", () => {
    const result = exportVectorLayerToSvg(twoStrokeLayer());
    expect(result.svg).toContain('fill="#ff0000"');
    expect(result.svg).toContain('fill="#0000ff"');
    expect(result.svg).toContain('opacity="0.9"');
    expect(result.svg).toContain('opacity="0.8"'); // 레이어 그룹
  });

  it("외곽선 패스는 닫힌 폴리곤(Z)이다", () => {
    const stroke = pointsToVectorStroke(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
      { baseWidth: 6 }
    )!;
    const d = vectorStrokeToOutlinePathD(stroke, 12, 2);
    expect(d).not.toBeNull();
    expect(d!.startsWith("M")).toBe(true);
    expect(d!.endsWith("Z")).toBe(true);
    expect(d).toContain("L");
  });

  it("점(dot) 스트로크는 circle 로 출력된다", () => {
    const dot = pointsToVectorStroke([{ x: 25, y: 30, pressure: 1 }], {
      baseWidth: 10,
      color: "#00ff00",
      id: "dot",
    })!;
    expect(vectorStrokeToDotCircle(dot, 2)).toMatchObject({
      cx: 25,
      cy: 30,
      r: 5,
    });
    const layer = createVectorLayer({ id: "l1", strokes: [dot] });
    const result = exportVectorLayerToSvg(layer);
    expect(result.svg).toContain("<circle");
    expect(result.svg).toContain('fill="#00ff00"');
    expect(result.strokeCount).toBe(1);
  });

  it("segments 모드에서는 stroke-width 단일 패스로 근사한다", () => {
    const result = exportVectorLayerToSvg(twoStrokeLayer(), {
      mode: "segments",
    });
    expect(result.mode).toBe("segments");
    expect(result.svg).toContain('fill="none"');
    expect(result.svg).toContain("stroke-width=");
    expect(result.svg).toContain('stroke="#ff0000"');
    expect(result.svg).toContain("stroke-linecap=\"round\"");
  });

  it("viewBox·배경 옵션을 반영한다", () => {
    const result = exportVectorLayerToSvg(twoStrokeLayer(), {
      width: 400,
      height: 300,
      background: "#ffffff",
    });
    expect(result.svg).toContain('viewBox="0 0 400 300"');
    expect(result.svg).toContain("<rect");
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
  });

  it("유효하지 않은 색상은 #000000 으로 대체된다", () => {
    const line = pointsToVectorStroke(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      { baseWidth: 4 }
    )!;
    const evil = { ...line, color: '"><script>alert(1)</script>' };
    const result = exportVectorLayerToSvg(
      createVectorLayer({ id: "l1", strokes: [evil] })
    );
    expect(result.svg).not.toContain("<script>");
    expect(result.svg).toContain('fill="#000000"');
  });

  it("빈 레이어도 유효한 SVG 를 만든다", () => {
    const result = exportVectorLayerToSvg(createVectorLayer({ id: "empty" }));
    expect(result.strokeCount).toBe(0);
    expect(result.svg.startsWith("<svg")).toBe(true);
    expect(result.svg.endsWith("</svg>")).toBe(true);
  });

  it("불투명도 범위를 벗어나면 클램프된다", () => {
    const line = pointsToVectorStroke(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      { baseWidth: 4, opacity: 5 }
    )!;
    const result = exportVectorLayerToSvg(
      createVectorLayer({ id: "l1", strokes: [line] })
    );
    expect(result.svg).toContain('opacity="1"');
  });
});
