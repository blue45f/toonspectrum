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
    expect(html).toContain("사용 가능한 필터 19개");
    expect(html).toContain("노출 / 감마 / 오프셋");
    expect(html).toContain("언샤프 마스크");
    expect(html).toContain("팽창 / 침식");
    expect(html).toContain("픽셀 오프셋");
    expect(html).toContain("사용자 컨볼루션");
    expect(html).toContain("구름 텍스처");
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
  });
});
