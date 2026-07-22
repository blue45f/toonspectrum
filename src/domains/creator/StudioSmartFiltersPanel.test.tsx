import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioSmartFiltersPanel } from "./StudioSmartFiltersPanel";

describe("StudioSmartFiltersPanel", () => {
  it("renders a searchable, grouped catalog with every new local filter", () => {
    const html = renderToStaticMarkup(
      <StudioSmartFiltersPanel stack={undefined} onChange={vi.fn()} />,
    );
    expect(html).toContain('type="search"');
    expect(html).toContain("필터 이름·효과 검색");
    expect(html).toContain("사용 가능한 필터 47개");
    expect(html).toContain("노출 / 감마 / 오프셋");
    expect(html).toContain("언샤프 마스크");
    expect(html).toContain("팽창 / 침식");
    expect(html).toContain("픽셀 오프셋");
    expect(html).toContain("사용자 컨볼루션");
    expect(html).toContain("구름 텍스처");
    expect(html).toContain("회전 블러");
    expect(html).toContain("줌 블러");
    expect(html).toContain("모자이크 / 픽셀화");
    expect(html).toContain("선화 추출");
    expect(html).toContain("컬러 하프톤");
    expect(html).toContain("미디언 잡티 제거");
    expect(html).toContain("표면 보존 블러");
    expect(html).toContain("빛나는 외곽선");
    expect(html).toContain("종이 컷아웃");
    expect(html).toContain("수채화");
    expect(html).toContain("확산 글로우");
  });

  it("renders bounded controls and a reproducible seed for composite media filters", () => {
    const html = renderToStaticMarkup(
      <StudioSmartFiltersPanel
        stack={{
          version: 1,
          entries: [{
            id: "watercolor-1",
            engine: "watercolor",
            enabled: true,
            params: { strength: 78, spread: 4, bleed: 62, granulation: 52, paper: 46, seed: 112 },
          }],
        }}
        onChange={vi.fn()}
      />,
    );
    expect(html).toContain("안료 농도");
    expect(html).toContain("가장자리 번짐");
    expect(html).toContain("안료 과립");
    expect(html).toContain("종이 질감");
    expect(html).toContain(">시드</span>");
    expect(html).toContain('max="9999"');
    expect(html.match(/type="range"/g)?.length).toBe(5);
  });

  it("renders editable controls and accessible stack actions for an active entry", () => {
    const html = renderToStaticMarkup(
      <StudioSmartFiltersPanel
        stack={{
          version: 1,
          entries: [{
            id: "unsharp-1",
            engine: "unsharp-mask",
            enabled: true,
            params: { amount: 0.8, radius: 2, threshold: 8 },
          }],
        }}
        onChange={vi.fn()}
      />,
    );
    expect(html).toContain("언샤프 마스크 끄기");
    expect(html).toContain("언샤프 마스크 위로 이동");
    expect(html).toContain("언샤프 마스크 아래로 이동");
    expect(html).toContain("언샤프 마스크 삭제");
    expect(html.match(/type="range"/g)?.length).toBe(3);
    expect(html).toContain("임계값");
    expect(html).toContain("pointer-coarse:min-h-11");
  });

  it("shows preset and 3x3 custom-convolution controls", () => {
    const html = renderToStaticMarkup(
      <StudioSmartFiltersPanel
        stack={{
          version: 1,
          entries: [{
            id: "conv-1",
            engine: "custom-convolution",
            enabled: true,
            params: { k4: 5, divisor: 1, bias: 0 },
          }],
        }}
        onChange={vi.fn()}
      />,
    );
    expect(html).toContain("3 × 3 커널");
    expect(html.match(/type="number"/g)?.length).toBe(9);
    expect(html).toContain(">엠보스</button>");
    expect(html).toContain(">박스 블러</button>");
    expect(html).toContain(">하이패스</button>");
  });

  it("shows distinct radial blur and color-halftone controls", () => {
    const html = renderToStaticMarkup(
      <StudioSmartFiltersPanel
        stack={{
          version: 1,
          entries: [
            {
              id: "spin-1",
              engine: "spin-blur",
              enabled: true,
              params: { radius: 18, strength: 85 },
            },
            {
              id: "halftone-1",
              engine: "color-halftone",
              enabled: true,
              params: { dotSize: 4, angle: 15, mode: "cmyk", strength: 100 },
            },
          ],
        }}
        onChange={vi.fn()}
      />,
    );
    expect(html).toContain("회전 범위");
    expect(html).toContain("색상 모드");
    expect(html).toContain("CMYK 컬러 망점");
    expect(html).toContain("망점 크기");
    expect(html.match(/type="range"/g)?.length).toBe(5);
  });
});
