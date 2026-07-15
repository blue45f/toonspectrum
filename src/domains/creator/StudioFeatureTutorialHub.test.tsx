import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioFeatureTutorialHub } from "./StudioFeatureTutorialHub";

describe("StudioFeatureTutorialHub", () => {
  it("closed 이면 렌더하지 않는다", () => {
    const html = renderToStaticMarkup(
      <StudioFeatureTutorialHub open={false} onClose={vi.fn()} />
    );
    expect(html).toBe("");
  });

  // open 모달은 createPortal(document.body) 이라 SSR/static 마크업에서는 비어 있을 수 있다.
  // 카탈로그 계약은 studio-feature-tutorials.test 가 담당한다.
  it("모듈이 튜토리얼 허브 컴포넌트를 내보낸다", () => {
    expect(typeof StudioFeatureTutorialHub).toBe("function");
  });
});
