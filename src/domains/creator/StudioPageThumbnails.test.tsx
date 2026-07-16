import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioPageThumbnail } from "./StudioPageThumbnails";

describe("StudioPageThumbnail work assets", () => {
  it("renders an inert collaboration placeholder instead of an invalid SVG image href", () => {
    const html = renderToStaticMarkup(
      <StudioPageThumbnail page={{
        id: "page-1",
        bg: "#fff",
        bgGrad: null,
        canvasH: 1080,
        elements: [{
          id: "asset-1",
          type: "image",
          src: "work-asset://image/asset-1",
          x: 10,
          y: 20,
          width: 300,
          height: 400,
          rotation: 0,
        }],
      }} />
    );
    expect(html).toContain("data-work-asset-placeholder=\"true\"");
    expect(html).toContain("팀 에셋을 안전하게 불러오는 중");
    expect(html).not.toContain("href=\"work-asset://");
  });
});
