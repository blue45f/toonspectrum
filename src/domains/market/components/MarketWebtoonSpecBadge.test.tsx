import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarketWebtoonSpecBadge } from "./MarketWebtoonSpecBadge";

describe("MarketWebtoonSpecBadge", () => {
  it("renders format, polycount grade, lineart, and NoAI badges", () => {
    const markup = renderToStaticMarkup(
      <MarketWebtoonSpecBadge
        format="glb"
        polycountGrade="optimal-webtoon"
        hasLineExtraction={true}
        isNoAiProtected={true}
        licenseTier="solo-creator"
      />,
    );

    expect(markup).toContain("GLB");
    expect(markup).toContain("웹툰 최적화");
    expect(markup).toContain("은선 렌더링 지원");
    expect(markup).toContain("NoAI 안심");
    expect(markup).toContain("1인 작가 상업");
  });

  it("renders heavy warning badge when polycount is high", () => {
    const markup = renderToStaticMarkup(
      <MarketWebtoonSpecBadge polycountGrade="heavy-warning" />,
    );

    expect(markup).toContain("고밀도 (LOD 권장)");
  });
});
