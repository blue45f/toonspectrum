import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { TOONSTUDIO_PRIMARY_NAVIGATION } from "../../../shared/components/site-navigation";

const canvasWelcome = readFileSync(
  new URL("../canvas/StudioCinematicCanvasWelcome.tsx", import.meta.url),
  "utf8",
);
const canvasCss = readFileSync(
  new URL("../studio-cuttoon-editor/studio-cinematic-canvas-v4.css", import.meta.url),
  "utf8",
);
const canvasStartDockCss = readFileSync(
  new URL("../canvas/studio-canvas-start-dock.css", import.meta.url),
  "utf8",
);
const creatorLobby = readFileSync(new URL("./StudioCreatorLobby.tsx", import.meta.url), "utf8");
const creatorLobbyModel = readFileSync(new URL("./studio-creator-lobby-model.ts", import.meta.url), "utf8");
const workspaceNavigation = readFileSync(
  new URL("../../../shared/components/workspace/WorkspaceNavigation.tsx", import.meta.url),
  "utf8",
);
const workspaceCss = readFileSync(
  new URL("../../../shared/components/workspace/workspace-visual-v3.css", import.meta.url),
  "utf8",
);
const iconDirectory = new URL(
  "../../../../public/brand/toonstudio-premium-icons/",
  import.meta.url,
);

const PREMIUM_ICON_NAMES = [
  "ai-director.webp",
  "assets.webp",
  "background.webp",
  "canvas.webp",
  "character.webp",
  "community.webp",
  "create.webp",
  "home.webp",
  "projects.webp",
  "settings.webp",
  "story.webp",
] as const;

describe("ToonStudio premium visual flow contract", () => {
  it("ships the complete generated premium icon family", () => {
    expect(readdirSync(iconDirectory).filter((name) => name.endsWith(".webp")).sort()).toEqual(
      [...PREMIUM_ICON_NAMES].sort(),
    );
    for (const name of PREMIUM_ICON_NAMES) {
      expect(readFileSync(new URL(name, iconDirectory)).byteLength).toBeGreaterThan(1_000);
    }
  });

  it("uses image-led creation paths in the lobby and global workspace navigation", () => {
    // 로비 빠른 시작은 파생본이 함께 배포되는 브랜드 예시 일러스트 세트를 쓴다
    // (로비 전용 고해상도 세트 우선, 없는 아트는 구 세트). 카드 7종 전부 아트를 갖는다.
    expect(creatorLobby).toContain("studioLobbyArtSource(action.art)");
    expect(creatorLobbyModel).toContain("/brand/illustrated-20260928");
    expect(creatorLobby.match(/art: "[^"]+\.webp"/gu)).toHaveLength(7);
    const navigationArt = [...workspaceNavigation.matchAll(/(?:"([\w-]+)"|(\w+)):\s*"\/brand\/toonstudio-premium-icons\/([^"]+\.webp)"/gu)];
    expect(navigationArt.map((entry) => entry[1] ?? entry[2]).sort())
      .toEqual(TOONSTUDIO_PRIMARY_NAVIGATION.map(({ id }) => id).sort());
    for (const entry of navigationArt) expect(PREMIUM_ICON_NAMES).toContain(entry[3]);
    expect(workspaceCss).toContain(".workspace-nav-visual>img");
  });

  it("turns the blank canvas into a mode and scene-led webtoon start flow", () => {
    expect(canvasWelcome.match(/data-canvas-start-mode/gu)).toHaveLength(1);
    expect(canvasWelcome.match(/id: "(romance|sf|action|fantasy|daily|horror)"/gu)).toHaveLength(6);
    expect(canvasStartDockCss).toContain(".studio-cinematic-canvas-welcome__scene-strip");
    expect(canvasStartDockCss).toContain("body:has([data-studio-cinematic-canvas-welcome");
  });

  it("preserves reduced-motion, high-contrast, and mobile-safe presentation", () => {
    expect(canvasCss).toContain("@media(prefers-reduced-motion:reduce)");
    expect(canvasCss).toContain("@media(forced-colors:active)");
    // 강제 색상 모드는 그림을 숨기므로 레일 만들기 버튼은 이름 글자를 다시 보여 줘야 빈 칸이 되지 않는다.
    expect(canvasCss).toMatch(/@media\(forced-colors:active\)\{\s*\.studio-creation-mode-trigger__copy\{display:grid/u);
    expect(canvasStartDockCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(canvasStartDockCss).toContain("@media (forced-colors: active)");
    // 시작 도크는 화면 고정 오버레이가 아니라 캔버스 뷰포트 안에 머물러 모바일 크롬과 안전 영역을 가리지 않는다.
    expect(canvasStartDockCss).toMatch(/\.studio-canvas-start \{\n {2}--start-line[^}]*position: absolute;/u);
    expect(canvasStartDockCss).not.toContain("position: fixed");
    expect(canvasStartDockCss).toContain("@media (max-width: 63.999rem)");
  });
});
