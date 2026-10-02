import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), "utf8");

const OVERLAY_SCOPE = '#studio-workspace:has([data-studio-brush-panel-presentation="overlay"])';

describe("겹쳐 뜬 브러시 패널이 덮는 캔버스 왼쪽을 HUD가 비켜선다", () => {
  it("줌·상태 줄, 페이지 스트립, 시작 도크가 같은 변수·같은 범위 선택자로 오른쪽으로 물러난다", () => {
    const statusBar = read("../brush/studio-brush-workbench.css");
    const strip = read("../page/studio-page-sequence-strip.css");
    const startDock = read("./studio-canvas-start-dock.css");

    for (const [name, css] of [["상태 줄", statusBar], ["페이지 스트립", strip], ["시작 도크", startDock]] as const) {
      expect(css, `${name} 규칙이 브러시 패널 겹침 범위를 따라야 한다`).toContain(OVERLAY_SCOPE);
      expect(css, `${name} 규칙이 겹침 폭 변수를 써야 한다`).toContain("--studio-brush-overlay-width");
    }
  });

  it("시작 도크는 패널 오른쪽 남은 영역의 가운데에 놓이고 폭도 그만큼 줄어든다", () => {
    const startDock = read("./studio-canvas-start-dock.css");
    expect(startDock).toContain("left: calc(50% + var(--studio-brush-overlay-width, 0px) / 2);");
    expect(startDock).toContain("width: min(820px, calc(100% - var(--studio-brush-overlay-width, 0px) - 24px));");
    // 접힌 한 줄 버튼은 폭을 내용에 맡긴다 — 폭 규칙은 펼친 도크에만 건다.
    expect(startDock).toContain(".studio-canvas-start:not(.studio-canvas-start--collapsed) {\n    width: min(820px");
  });

  it("전역 서비스 알림·토스트가 읽는 하단 여유 변수를 스트립이 열려 있는 동안 채운다", () => {
    const strip = read("../page/studio-page-sequence-strip.css");
    expect(strip).toMatch(/body:has\(\[data-studio-page-sequence-strip="true"\]\)\s*\{[^}]*--studio-page-strip-offset:\s*6\.5rem;[^}]*--immersive-dock-clearance:\s*11rem;/u);
  });
});
