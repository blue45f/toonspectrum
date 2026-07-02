import { describe, expect, it } from "vitest";

import { screentoneDotsForStroke } from "./studio-brush";
import { bubblePathData } from "./studio-bubble-path";
import {
  SVG_EXPORT_MIME,
  escapeXml,
  exportPageToSvg,
  svgExportFileName,
  svgExportResultMessage,
  type SvgExportEl,
  type SvgExportPageInput,
  type SvgExportResult,
} from "./studio-svg-export";

import type { El } from "./StudioPage";

// ---------------------------------------------------------------------------
// 헬퍼 — 페이지 입력/요소 빌더
// ---------------------------------------------------------------------------

function page(elements: SvgExportEl[], over: Partial<SvgExportPageInput> = {}): SvgExportPageInput {
  return { width: 720, height: 1000, bg: "#ffffff", elements, ...over };
}

function rectEl(over: Partial<Extract<SvgExportEl, { type: "draw" }>> = {}): Extract<SvgExportEl, { type: "draw" }> {
  return {
    id: "d1",
    type: "draw",
    kind: "rect",
    points: [10, 20, 110, 80],
    stroke: "#111111",
    strokeWidth: 2,
    fill: "#ff0000",
    ...over,
  };
}

function textEl(over: Partial<Extract<SvgExportEl, { type: "text" }>> = {}): Extract<SvgExportEl, { type: "text" }> {
  return {
    id: "t1",
    type: "text",
    text: "안녕\n웹툰",
    x: 10,
    y: 20,
    width: 200,
    fontSize: 20,
    fill: "#222222",
    rotation: 0,
    align: "center",
    letterSpacing: 1,
    lineHeight: 1.2,
    ...over,
  };
}

function bubbleEl(over: Partial<Extract<SvgExportEl, { type: "bubble" }>> = {}): Extract<SvgExportEl, { type: "bubble" }> {
  return {
    id: "b1",
    type: "bubble",
    variant: "speech",
    text: "야!",
    x: 5,
    y: 6,
    width: 200,
    height: 120,
    fill: "#ffffff",
    textFill: "#111111",
    rotation: 0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// El 유니온 호환 — StudioPage 요소 배열을 구조 그대로 받는다(컴파일 타임 검증).
// ---------------------------------------------------------------------------

describe("El 유니온 구조 호환", () => {
  it("StudioPage El이 SvgExportEl로 그대로 대입된다(tsc 게이트)", () => {
    const acceptEl = (el: El): SvgExportEl => el;
    expect(typeof acceptEl).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// 문서 골격 — 루트/배경/숨김/결정성
// ---------------------------------------------------------------------------

describe("exportPageToSvg 문서 골격", () => {
  it("루트 svg에 xmlns·크기·viewBox가 결정적으로 들어간다", () => {
    const { svg } = exportPageToSvg(page([]));
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1000" viewBox="0 0 720 1000">')).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("배경 단색 rect를 캔버스 bg와 동일하게 깐다", () => {
    const { svg } = exportPageToSvg(page([], { bg: "#fef3c7" }));
    expect(svg).toContain('<rect width="720" height="1000" fill="#fef3c7"/>');
  });

  it("bgGrad가 있으면 세로 2색 그라데이션 defs로 배경을 칠한다", () => {
    const { svg } = exportPageToSvg(page([], { bgGrad: ["#000000", "#ffffff"] }));
    expect(svg).toContain('x1="0" y1="0" x2="0" y2="1000"');
    expect(svg).toContain('<stop offset="0%" stop-color="#000000"/>');
    expect(svg).toContain('<stop offset="100%" stop-color="#ffffff"/>');
    expect(svg).toMatch(/<rect width="720" height="1000" fill="url\(#sg\d+\)"\/>/);
  });

  it("transparentBg면 배경을 그리지 않는다", () => {
    const { svg } = exportPageToSvg(page([], { transparentBg: true, bg: "#ffffff" }));
    expect(svg).not.toContain('fill="#ffffff"');
  });

  it("숨긴 요소·숨긴 그룹 소속 요소는 제외되고 elementCount에도 빠진다", () => {
    const result = exportPageToSvg(
      page(
        [
          rectEl({ id: "d1", hidden: true }),
          rectEl({ id: "d2", groupId: "g1" }),
          rectEl({ id: "d3", points: [200, 20, 300, 80] }),
        ],
        { groups: [{ id: "g1", name: "숨김 그룹", hidden: true }] }
      )
    );
    expect(result.elementCount).toBe(1);
    expect((result.svg.match(/<rect /g) ?? []).length).toBe(2); // 배경 + d3 하나
  });

  it("같은 입력이면 출력 바이트가 동일하다(결정성)", () => {
    const input = page([
      rectEl(),
      textEl(),
      bubbleEl(),
      { id: "fl1", type: "focusLines", x: 0, y: 0, width: 720, height: 400, lineCount: 12, innerRadius: 60, outerRadius: 300, stroke: "#000000", strokeWidth: 2, noise: 10, rotation: 0 },
    ]);
    expect(exportPageToSvg(input).svg).toBe(exportPageToSvg(input).svg);
  });
});

// ---------------------------------------------------------------------------
// 도형(draw) — 사각/타원/별/다각형/선/화살표/자유곡선
// ---------------------------------------------------------------------------

describe("도형 직렬화", () => {
  it("사각형 — 위치·크기·모서리 반경·선 스타일을 그대로 담는다", () => {
    const { svg } = exportPageToSvg(page([rectEl()]));
    expect(svg).toContain(
      '<rect x="10" y="20" width="100" height="60" rx="3" fill="#ff0000" stroke="#111111" stroke-width="2" stroke-linejoin="round"/>'
    );
  });

  it("점선 프리셋은 선 굵기에 비례한 stroke-dasharray로 나온다", () => {
    const { svg } = exportPageToSvg(page([rectEl({ strokeStyle: { dash: "dash", lineCap: "round", arrowStart: "none", arrowEnd: "none" } })]));
    expect(svg).toContain('stroke-dasharray="6 4"');
  });

  it("타원 — 중심·반지름을 캔버스와 동일하게 계산한다", () => {
    const { svg } = exportPageToSvg(page([rectEl({ kind: "ellipse" })]));
    expect(svg).toContain('<ellipse cx="60" cy="50" rx="50" ry="30"');
  });

  it("별/다각형 — studio-stroke-shapes 포인트 지오메트리를 재사용한다", () => {
    const star = rectEl({ id: "s1", kind: "star", points: [0, 0, 100, 100] });
    const poly = rectEl({ id: "p1", kind: "polygon", points: [0, 0, 100, 100], shapeParams: { starPoints: 5, starInnerRatio: 0.5, polygonSides: 6, cornerRadius: 3 } });
    const { svg } = exportPageToSvg(page([star, poly]));
    // 별 첫 꼭짓점 = 12시 방향(중심 50,50 · 외접 반경 50 → "50,0")
    expect(svg).toContain('<polygon points="50,0');
    // 육각형 = 12개 좌표(x,y 6쌍)
    const polygons = svg.match(/<polygon points="([^"]+)"/g) ?? [];
    expect(polygons.length).toBe(2);
    expect((polygons[1]?.match(/,/g) ?? []).length).toBe(6);
  });

  it("선 — 화살촉(삼각형)을 stroke 색으로 채워 함께 그린다", () => {
    const line = rectEl({
      id: "l1",
      kind: "line",
      points: [0, 0, 100, 0],
      stroke: "#333333",
      strokeWidth: 4,
      strokeStyle: { dash: "solid", lineCap: "round", arrowStart: "none", arrowEnd: "arrow" },
    });
    const { svg } = exportPageToSvg(page([line]));
    expect(svg).toContain('<path d="M 0 0 L 100 0" fill="none" stroke="#333333" stroke-width="4" stroke-linecap="round"');
    expect(svg).toContain('d="M 100 0 L 90.99 4.34 L 90.99 -4.34 Z" fill="#333333"');
  });

  it("화살표(arrow) — 몸통 + 끝점 삼각 화살촉(굵기 비례)을 그린다", () => {
    const arrow = rectEl({ id: "a1", kind: "arrow", points: [0, 0, 100, 0], stroke: "#123456", strokeWidth: 4 });
    const { svg } = exportPageToSvg(page([arrow]));
    expect(svg).toContain('<path d="M 0 0 L 100 0" fill="none" stroke="#123456"');
    expect(svg).toContain('<path d="M 100 0 L 92 4 L 92 -4 Z" fill="#123456"');
  });

  it("자유곡선(펜) — Konva tension 곡선(Q/C 커맨드)으로 매끈하게 나온다", () => {
    const pen = rectEl({ id: "f1", kind: "freehand", points: [0, 0, 10, 0, 20, 10, 30, 30], strokeWidth: 3 });
    const { svg } = exportPageToSvg(page([pen]));
    const d = /<path d="(M 0 0 Q [^"]+)"/.exec(svg)?.[1];
    expect(d).toBeTruthy();
    expect(d).toContain(" C ");
    expect(svg).toContain('stroke-linecap="round"');
  });

  it("형광펜 — multiply 혼합과 사각 끝을 유지한다", () => {
    const hl = rectEl({ id: "h1", kind: "freehand", brush: "highlighter", points: [0, 0, 10, 0, 20, 10, 30, 30] });
    const { svg } = exportPageToSvg(page([hl]));
    expect(svg).toContain('stroke-linecap="square"');
    expect(svg).toContain("mix-blend-mode:multiply");
  });

  it("스크린톤 브러시 — 결정적 망점을 원(circle)으로 그대로 재현한다", () => {
    const tone = rectEl({ id: "st1", kind: "freehand", brush: "screentone", points: [0, 0, 40, 0], strokeWidth: 22 });
    const { svg } = exportPageToSvg(page([tone]));
    const expected = screentoneDotsForStroke([0, 0, 40, 0], 11, Math.max(3, 22 * 0.42)).length / 2;
    expect((svg.match(/<circle /g) ?? []).length).toBe(expected);
  });

  it("지우개 자국은 그리지 않고 skipped로 정직하게 집계한다", () => {
    const eraser = rectEl({ id: "e1", kind: "freehand", mode: "eraser", points: [0, 0, 10, 0, 20, 10] });
    const result = exportPageToSvg(page([eraser]));
    expect(result.svg).not.toContain("<path");
    expect(result.skipped).toEqual([{ id: "e1", type: "draw", mode: "skipped", label: "지우개 자국은 벡터로 재현할 수 없어 제외했어요." }]);
  });

  it("대칭 드로잉 — 세로 대칭이면 미러 사본까지 두 개를 그린다", () => {
    const sym = rectEl({ symmetry: { type: "vertical", centerX: 360, centerY: 0 } });
    const { svg } = exportPageToSvg(page([sym]));
    expect((svg.match(/<rect x="/g) ?? []).length).toBe(2);
    expect(svg).toContain('<rect x="610"'); // 360*2-110 = 610 (미러된 박스 왼쪽)
  });
});

// ---------------------------------------------------------------------------
// 그라데이션·패턴 defs — 우선순위: 패턴 > 그라데이션 > 단색
// ---------------------------------------------------------------------------

describe("그라데이션·패턴 채우기", () => {
  const gradient = { type: "linear" as const, angleDeg: 90, stops: [{ offset: 0, color: "#ff0000" }, { offset: 1, color: "#0000ff" }] };

  it("선형 그라데이션 — CSS 각도 규약 지오메트리를 userSpaceOnUse 좌표로 담는다", () => {
    const { svg } = exportPageToSvg(page([rectEl({ gradient })]));
    expect(svg).toContain('gradientUnits="userSpaceOnUse" x1="10" y1="50" x2="110" y2="50"');
    expect(svg).toContain('<stop offset="0%" stop-color="#ff0000"/>');
    expect(svg).toMatch(/<rect [^>]*fill="url\(#sg\d+\)"/);
  });

  it("방사 그라데이션 — farthest-corner 반지름으로 radialGradient를 만든다", () => {
    const radial = { ...gradient, type: "radial" as const };
    const { svg } = exportPageToSvg(page([rectEl({ kind: "ellipse", gradient: radial })]));
    expect(svg).toMatch(/<radialGradient [^>]*cx="60" cy="50" r="58.31"/); // hypot(50,30)
  });

  it("패턴 — 타일 마크업을 defs <pattern>으로 임베드하고 노드 원점에 정렬한다", () => {
    const { svg } = exportPageToSvg(page([rectEl({ pattern: { patternId: "dots", fg: "#112233", scale: 2 } })]));
    expect(svg).toContain('patternUnits="userSpaceOnUse" width="32" height="32" patternTransform="translate(10 20)"');
    expect(svg).toContain('<circle cx="4" cy="4" r="2.2" fill="#112233"/>');
    expect(svg).toMatch(/<rect [^>]*fill="url\(#sp\d+\)"/);
  });

  it("패턴이 그라데이션보다 이긴다(캔버스 fillPriority 규약)", () => {
    const { svg } = exportPageToSvg(page([rectEl({ gradient, pattern: { patternId: "checker", fg: "#000000", scale: 1 } })]));
    expect(svg).toMatch(/<rect [^>]*fill="url\(#sp\d+\)"/);
    expect(svg).not.toContain("<linearGradient");
  });
});

// ---------------------------------------------------------------------------
// 텍스트 — 여러 줄/정렬/자간/이스케이프/그라데이션/곡선 텍스트/세로쓰기
// ---------------------------------------------------------------------------

describe("텍스트 직렬화", () => {
  it("여러 줄 텍스트 — 줄 중앙 배치(Konva 산식)와 가운데 정렬 anchor를 담는다", () => {
    const { svg } = exportPageToSvg(page([textEl()]));
    expect(svg).toContain('<g transform="translate(10 20)">');
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('<tspan x="100" y="19.2">안녕</tspan>');
    expect(svg).toContain('<tspan x="100" y="43.2">웹툰</tspan>');
    expect(svg).toContain('letter-spacing="1"');
    expect(svg).toContain('font-family="Pretendard, sans-serif"');
    expect(svg).toContain('font-weight="bold"');
    expect(svg).toContain('xml:space="preserve"');
  });

  it("XML 특수문자를 철저히 이스케이프한다", () => {
    const { svg } = exportPageToSvg(page([textEl({ text: `<b>&"quote"&'q'</b>`, align: "left" })]));
    expect(svg).toContain("&lt;b&gt;&amp;&quot;quote&quot;&amp;&apos;q&apos;&lt;/b&gt;");
    expect(svg).not.toContain("<b>");
  });

  it("SFX 외곽선 — stroke를 fill보다 먼저 칠한다(paint-order)", () => {
    const { svg } = exportPageToSvg(page([textEl({ stroke: "#000000", strokeWidth: 3 })]));
    expect(svg).toContain('stroke="#000000" stroke-width="3" paint-order="stroke"');
  });

  it("그라데이션 텍스트 — 레거시 2색 필드도 엔진 스펙으로 변환해 defs를 만든다", () => {
    const { svg } = exportPageToSvg(page([textEl({ text: "A", width: 100, fillType: "gradient", align: "left" })]));
    expect(svg).toContain('x1="50" y1="0" x2="50" y2="26"'); // vertical 180° · bbox 100×26
    expect(svg).toContain('stop-color="#ff3b30"');
    expect(svg).toContain('stop-color="#ffcc00"');
    expect(svg).toMatch(/<text [^>]*fill="url\(#sg\d+\)"/);
  });

  it("곡선 텍스트 — buildTextPathData 경로를 defs에 두고 textPath로 흘린다", () => {
    const { svg } = exportPageToSvg(page([textEl({ textPath: { shape: "arcUp", curve: 70 }, align: "center" })]));
    expect(svg).toMatch(/<path id="stp\d+" d="M 0 [^"]+" fill="none"\/>/);
    expect(svg).toMatch(/<textPath href="#stp\d+" startOffset="50%" text-anchor="middle">/);
  });

  it("세로쓰기 — formatVerticalText 열 재배열(우→좌)을 그대로 담는다", () => {
    const { svg } = exportPageToSvg(page([textEl({ text: "ab\ncd", vertical: true, align: "left" })]));
    expect(svg).toContain(">c  a</tspan>");
    expect(svg).toContain(">d  b</tspan>");
  });

  it("자동 줄바꿈이 필요한 긴 문장은 근사로 정직하게 고지한다", () => {
    const result = exportPageToSvg(page([textEl({ text: "가나다라마바사아자차카타파하", width: 100, align: "left" })]));
    expect(result.skipped.some((s) => s.id === "t1" && s.mode === "approximated" && s.label.includes("자동 줄바꿈"))).toBe(true);
  });

  it("그림자 — feDropShadow 필터(σ=blur/2)로 근사한다", () => {
    const { svg } = exportPageToSvg(
      page([textEl({ shadowColor: "#ff00ff", shadowBlur: 10, shadowOffsetX: 2, shadowOffsetY: 3, shadowOpacity: 0.5 })])
    );
    expect(svg).toContain('<feDropShadow dx="2" dy="3" stdDeviation="5" flood-color="#ff00ff" flood-opacity="0.5"/>');
    expect(svg).toMatch(/<text [^>]*filter="url\(#sf\d+\)"/);
  });

  it("스티커 — Konva 기본값(Arial·검정)으로 텍스트 노드를 만든다", () => {
    const { svg } = exportPageToSvg(
      page([{ id: "s1", type: "sticker", text: "🔥", x: 30, y: 40, fontSize: 48, rotation: 15 }])
    );
    expect(svg).toContain('<g transform="translate(30 40) rotate(15)">');
    expect(svg).toContain('font-family="Arial"');
    expect(svg).toContain('fill="black"');
    expect(svg).toContain(">🔥</tspan>");
  });
});

// ---------------------------------------------------------------------------
// 말풍선 — bubblePathData 재사용/변형/테마
// ---------------------------------------------------------------------------

describe("말풍선 직렬화", () => {
  it("speech — 본체+꼬리 단일 path(bubblePathData)와 안쪽 텍스트를 담는다", () => {
    const { svg } = exportPageToSvg(page([bubbleEl()]));
    const expected = bubblePathData(200, 120, 18, { direction: "bottom", ratio: 0.35, length: 30, base: 28.8, side: "center" });
    expect(svg).toContain(`<path d="${expected}" fill="#ffffff" stroke="#1f1a16" stroke-width="2.5"`);
    expect(svg).toContain('<tspan x="100" y="67.14">야!</tspan>');
    expect(svg).toContain('letter-spacing="0.3"');
  });

  it("whisper — 점선(8 5) 외곽선으로 그린다", () => {
    const { svg } = exportPageToSvg(page([bubbleEl({ variant: "whisper" })]));
    expect(svg).toContain('stroke-dasharray="8 5"');
  });

  it("shout — 20각 별을 크기 비율로 스케일해 그린다", () => {
    const { svg } = exportPageToSvg(page([bubbleEl({ variant: "shout" })]));
    expect(svg).toContain('transform="translate(100 60) scale(1.47 0.88)"');
    const star = /<polygon points="([^"]+)"/.exec(svg)?.[1] ?? "";
    expect(star.split(" ").length).toBe(40); // 20각 별 = 외곽/내곽 40개 정점
  });

  it("box — 테마별 모서리 반경(classic 4/vivid 3)을 반영한다", () => {
    const classic = exportPageToSvg(page([bubbleEl({ variant: "box" })]));
    const vivid = exportPageToSvg(page([bubbleEl({ variant: "box" })], { theme: "vivid" }));
    expect(classic.svg).toContain('rx="4"');
    expect(vivid.svg).toContain('rx="3"');
    expect(vivid.svg).toContain('stroke="#444444"');
  });

  it("thought — 본체 캡슐 + 꼬리 구름방울 3단을 그린다", () => {
    const { svg } = exportPageToSvg(page([bubbleEl({ variant: "thought" })]));
    expect(svg).toContain('rx="60"'); // min(200,120)/2
    expect((svg.match(/<ellipse /g) ?? []).length).toBe(3);
  });

  it("빈 대사면 텍스트 노드를 만들지 않는다", () => {
    const { svg } = exportPageToSvg(page([bubbleEl({ text: "  " })]));
    expect(svg).not.toContain("<text");
  });
});

// ---------------------------------------------------------------------------
// 프레임·이미지
// ---------------------------------------------------------------------------

describe("프레임·이미지 직렬화", () => {
  it("프레임 — 클립 + 배경색 + 절반 인셋 테두리(점선 지원)를 담는다", () => {
    const { svg } = exportPageToSvg(
      page([{ id: "f1", type: "frame", x: 10, y: 10, width: 300, height: 200, bgColor: "#eeeeee", dashStyle: "dashed" }])
    );
    expect(svg).toMatch(/<clipPath id="sc\d+"><rect width="300" height="200"\/><\/clipPath>/);
    expect(svg).toContain('<rect width="300" height="200" fill="#eeeeee"/>');
    expect(svg).toContain('<rect x="1.5" y="1.5" width="297" height="197" rx="2.5" fill="none" stroke="#16100c" stroke-width="3" stroke-dasharray="10 5"/>');
    expect(svg).toMatch(/<g transform="translate\(10 10\)" clip-path="url\(#sc\d+\)">/);
  });

  it("사선(폴리곤) 프레임 — 폴리곤 클립·채움·테두리로 그린다", () => {
    const { svg } = exportPageToSvg(
      page([{ id: "f2", type: "frame", x: 0, y: 0, width: 300, height: 200, points: [0, 0, 300, 0, 280, 200, 20, 200] }])
    );
    expect(svg).toContain('<clipPath id="sc1"><polygon points="0,0 300,0 280,200 20,200"/></clipPath>');
    expect((svg.match(/<polygon points="0,0 300,0 280,200 20,200"/g) ?? []).length).toBe(3); // 클립+채움+테두리
  });

  it("프레임 배경 이미지 — cover-fit을 preserveAspectRatio slice로 재현하고 외부 URL은 고지한다", () => {
    const result = exportPageToSvg(
      page([{ id: "f3", type: "frame", x: 0, y: 0, width: 300, height: 200, bg: "https://cdn.example.com/bg.png" }])
    );
    expect(result.svg).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(result.skipped.some((s) => s.id === "f3" && s.mode === "approximated" && s.label.includes("외부 주소"))).toBe(true);
  });

  it("이미지 — 회전·기울이기·반전·둥근 모서리·그림자를 벡터 속성으로 담는다", () => {
    const result = exportPageToSvg(
      page([
        {
          id: "i1",
          type: "image",
          src: "data:image/png;base64,AAA",
          x: 1,
          y: 2,
          width: 100,
          height: 50,
          rotation: 45,
          opacity: 0.5,
          flipped: true,
          cornerRadius: 8,
          shadowColor: "#000000",
          shadowBlur: 10,
          shadowOffsetX: 2,
          shadowOffsetY: 3,
          shadowOpacity: 0.6,
          skewX: 30,
        },
      ])
    );
    expect(result.svg).toContain('transform="translate(1 2) rotate(45) matrix(1 0 0.58 1 0 0)"');
    expect(result.svg).toContain('opacity="0.5"');
    expect(result.svg).toMatch(/<clipPath id="sc\d+"><rect width="100" height="50" rx="8"\/><\/clipPath>/);
    expect(result.svg).toContain('<feDropShadow dx="2" dy="3" stdDeviation="5" flood-color="#000000" flood-opacity="0.6"/>');
    expect(result.svg).toContain('href="data:image/png;base64,AAA"');
    expect(result.svg).toContain('preserveAspectRatio="none" transform="translate(100 0) scale(-1 1)"');
    expect(result.skipped).toEqual([]); // data URL + 필터 없음 → 완전 벡터(고지 없음)
  });

  it("픽셀 필터가 있는 이미지는 원본으로 근사하고 정직하게 고지한다", () => {
    const result = exportPageToSvg(
      page([{ id: "i2", type: "image", src: "data:image/png;base64,AAA", x: 0, y: 0, width: 10, height: 10, rotation: 0, brightness: 0.4 }])
    );
    expect(result.skipped.some((s) => s.id === "i2" && s.label.includes("픽셀 필터"))).toBe(true);
  });

  it("외부 URL 이미지는 임베드가 아님을 고지한다", () => {
    const result = exportPageToSvg(
      page([{ id: "i3", type: "image", src: "https://cdn.example.com/a.png", x: 0, y: 0, width: 10, height: 10, rotation: 0 }])
    );
    expect(result.skipped.some((s) => s.id === "i3" && s.label.includes("외부 주소"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 집중선·속도선 — 시드 난수 재현
// ---------------------------------------------------------------------------

describe("집중선·속도선", () => {
  it("집중선 — lineCount만큼의 선을 시드 난수로 결정적으로 그린다", () => {
    const el: SvgExportEl = { id: "fl1", type: "focusLines", x: 5, y: 6, width: 400, height: 300, lineCount: 8, innerRadius: 50, outerRadius: 150, stroke: "#101010", strokeWidth: 2, noise: 10, rotation: 30 };
    const a = exportPageToSvg(page([el]));
    const b = exportPageToSvg(page([el]));
    expect(a.svg).toBe(b.svg);
    const d = /<path d="([^"]+)" fill="none" stroke="#101010"/.exec(a.svg)?.[1] ?? "";
    expect((d.match(/M /g) ?? []).length).toBe(8);
    expect(a.svg).toContain('transform="translate(5 6) rotate(30)"');
  });

  it("속도선 — 방향·개수를 유지하고 id가 다르면 배치도 달라진다", () => {
    const mk = (id: string): SvgExportEl => ({ id, type: "speedLines", x: 0, y: 0, width: 200, height: 100, lineCount: 5, direction: "horizontal", stroke: "#000000", strokeWidth: 2, rotation: 0 });
    const a = exportPageToSvg(page([mk("sl1")]));
    const b = exportPageToSvg(page([mk("sl2")]));
    const dA = /<path d="([^"]+)"/.exec(a.svg)?.[1] ?? "";
    expect((dA.match(/M /g) ?? []).length).toBe(5);
    expect(a.svg).not.toBe(b.svg);
  });
});

// ---------------------------------------------------------------------------
// 패널 클리핑·혼합 모드·아래로 클리핑
// ---------------------------------------------------------------------------

describe("레이어 규약(클립·혼합)", () => {
  const frame: SvgExportEl = { id: "f1", type: "frame", x: 0, y: 0, width: 300, height: 300 };

  it("패널 안 요소는 패널 rect로 클립된다(wrapClip 규약)", () => {
    const { svg } = exportPageToSvg(page([frame, textEl({ x: 50, y: 50, width: 100, align: "left" })]));
    expect((svg.match(/clip-path="url\(#/g) ?? []).length).toBe(2); // 프레임 자체 + 패널 클립
    expect(svg).toMatch(/<clipPath id="sc\d+"><rect x="0" y="0" width="300" height="300"\/><\/clipPath>/);
  });

  it("noClip 요소는 패널 클립을 받지 않는다", () => {
    const { svg } = exportPageToSvg(page([frame, textEl({ x: 50, y: 50, width: 100, align: "left", noClip: true })]));
    expect((svg.match(/clip-path="url\(#/g) ?? []).length).toBe(1); // 프레임 자체만
  });

  it("혼합 모드는 CSS mix-blend-mode로 매핑한다", () => {
    const { svg } = exportPageToSvg(page([rectEl({ blendMode: "multiply" })]));
    expect(svg).toContain('<g style="mix-blend-mode:multiply">');
  });

  it("표현 불가한 혼합 모드는 보통 합성으로 그리고 근사 고지한다", () => {
    const result = exportPageToSvg(page([rectEl({ blendMode: "destination-out" })]));
    expect(result.svg).not.toContain("mix-blend-mode");
    expect(result.skipped.some((s) => s.id === "d1" && s.label.includes("혼합 모드"))).toBe(true);
  });

  it("아래 레이어 클리핑(clipBelow)은 근사로 고지한다", () => {
    const result = exportPageToSvg(page([rectEl({ id: "base" }), rectEl({ id: "top", clipBelow: true })]));
    expect(result.skipped.some((s) => s.id === "top" && s.mode === "approximated" && s.label.includes("클리핑"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 결과 메타 — 글꼴/주의사항/메시지/파일명/MIME
// ---------------------------------------------------------------------------

describe("결과 메타·헬퍼", () => {
  it("사용 글꼴을 수집하고 임베드 불가 주의사항을 담는다", () => {
    const result = exportPageToSvg(page([textEl({ font: "Jua" }), bubbleEl()]));
    expect(result.fontFamilies).toContain("Jua");
    expect(result.fontFamilies).toContain("Pretendard, sans-serif");
    expect(result.caveats.some((c) => c.includes("글꼴"))).toBe(true);
  });

  it("도형만 있으면 글꼴 주의사항이 없다", () => {
    const result = exportPageToSvg(page([rectEl()]));
    expect(result.fontFamilies).toEqual([]);
    expect(result.caveats).toEqual([]);
  });

  it("svgExportResultMessage — 전부 벡터 보존/제외/근사를 정직하게 요약한다", () => {
    const clean = exportPageToSvg(page([rectEl()]));
    expect(svgExportResultMessage(clean)).toBe("SVG 저장 완료 — 요소 1개 벡터 변환 · 전부 벡터 보존");
    const mixed = exportPageToSvg(
      page([
        rectEl({ id: "e1", kind: "freehand", mode: "eraser", points: [0, 0, 10, 0, 20, 10] }),
        { id: "i2", type: "image", src: "data:image/png;base64,AAA", x: 0, y: 0, width: 10, height: 10, rotation: 0, brightness: 0.4 },
      ])
    );
    expect(svgExportResultMessage(mixed)).toBe("SVG 저장 완료 — 요소 2개 벡터 변환 · 제외 1개 · 근사 1개");
  });

  it("svgExportFileName — 래스터 내보내기와 같은 제목 규칙(.svg)", () => {
    expect(svgExportFileName("  ")).toBe("toonspectrum-comic.svg");
    expect(svgExportFileName(" 나의 웹툰 ")).toBe("나의 웹툰.svg");
  });

  it("escapeXml — 다섯 가지 특수문자를 전부 치환한다", () => {
    expect(escapeXml(`<a & "b" 'c'>`)).toBe("&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;");
  });

  it("SVG MIME 타입을 노출한다(콜러 Blob 생성용)", () => {
    expect(SVG_EXPORT_MIME).toBe("image/svg+xml;charset=utf-8");
  });

  it("결과 타입 — 스킵 항목은 id/type/mode/label을 갖춘다", () => {
    const result: SvgExportResult = exportPageToSvg(page([rectEl({ id: "e1", kind: "freehand", mode: "eraser", points: [0, 0, 10, 0, 20, 10] })]));
    expect(result.skipped[0]).toMatchObject({ id: "e1", type: "draw", mode: "skipped" });
    expect(result.elementCount).toBe(1);
  });
});
