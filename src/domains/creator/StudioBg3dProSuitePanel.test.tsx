import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";

import { StudioBg3dProSuitePanel } from "./StudioBg3dProSuitePanel";

describe("StudioBg3dProSuitePanel", () => {
  it("renders all 4 pro suite tabs: Prop Grip, Manga Lens, Scene Culling, Hair Strands", () => {
    const markup = renderToStaticMarkup(<StudioBg3dProSuitePanel />);

    expect(markup).toContain("소품 그립");
    expect(markup).toContain("만화 렌즈");
    expect(markup).toContain("배경 컬링");
    expect(markup).toContain("헤어 가닥");

    // Default Grip Tab
    expect(markup).toContain("6종 만화 손 그립 아키타입");
    expect(markup).toContain("검/칼 파워 그립");
    expect(markup).toContain("권총 방아쇠 그립");
    expect(markup).toContain("손가락 쥐는 악력 (Tightness)");
  });

  it("renders properly in disabled mode", () => {
    const markup = renderToStaticMarkup(<StudioBg3dProSuitePanel disabled />);
    expect(markup).toContain("disabled");
  });
});
