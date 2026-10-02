import { describe, expect, it } from "vitest";

import {
  studioVirtualSpaceHudTabOf,
  studioVirtualWorkspacePanelForScope,
} from "./studio-virtual-space-panel-scope";

describe("studioVirtualWorkspacePanelForScope 메가폰·투표", () => {
  it("팀 공간에서는 메가폰·투표 패널을 그대로 연다", () => {
    expect(studioVirtualWorkspacePanelForScope("megaphone", false)).toBe("megaphone");
    expect(studioVirtualWorkspacePanelForScope("poll", false)).toBe("poll");
  });

  it("개인 공간에서는 프로젝트 전용 패널이라 열지 않는다(null)", () => {
    expect(studioVirtualWorkspacePanelForScope("megaphone", true)).toBeNull();
    expect(studioVirtualWorkspacePanelForScope("poll", true)).toBeNull();
  });

  it("메가폰·투표 세부 뷰의 부모 탭은 대화 탭이다", () => {
    expect(studioVirtualSpaceHudTabOf("megaphone")).toBe("chat");
    expect(studioVirtualSpaceHudTabOf("poll")).toBe("chat");
  });
});
