import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioCompanionAssistantDisplay } from "./StudioCompanionAssistantDisplay";

describe("StudioCompanionAssistantDisplay", () => {
  it("renders companion assistant toolkit surface with all 6 quick tabs", () => {
    const markup = renderToStaticMarkup(<StudioCompanionAssistantDisplay />);

    expect(markup).toContain("웹툰 보조 툴킷");
    expect(markup).toContain("플랫폼 규격");
    expect(markup).toContain("스크롤 페이싱");
    expect(markup).toContain("효과음 사전");
    expect(markup).toContain("컬러 조화");
    expect(markup).toContain("포커스 타이머");
    expect(markup).toContain("크로키 가이드");
    expect(markup).toContain("네이버웹툰 (도전/베도/정식)");
  });
});
