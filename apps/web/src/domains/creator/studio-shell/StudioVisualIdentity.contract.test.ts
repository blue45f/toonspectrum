import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("ToonStudio visual identity contract", () => {
  it("ships every generated visual asset used by the creator lobby", () => {
    const lobby = source("apps/web/src/domains/creator/studio-shell/StudioCreatorLobby.tsx");
    const model = source("apps/web/src/domains/creator/studio-shell/studio-creator-lobby-model.ts");
    // 로비가 실제로 참조하는 예시 일러스트(`art:`, `visual:`, `studioLobbyArtSource(...)`)를 소스에서 모은다.
    const names = new Set(
      [...lobby.matchAll(/(?:art|visual): "([\w-]+)\.webp"|studioLobbyArtSource\("([\w-]+)\.webp"\)/gu)]
        .map((match) => match[1] ?? match[2] ?? ""),
    );
    names.delete("");
    expect(names.size).toBeGreaterThanOrEqual(10);
    // 로비 전용 고해상도 세트가 제공하는 아트와 파생 너비를 모델 소스에서 읽는다.
    const hqBlock = model.slice(model.indexOf("LOBBY_HQ_ART_WIDTHS"), model.indexOf("};", model.indexOf("LOBBY_HQ_ART_WIDTHS")));
    const hqWidths = new Map<string, number[]>(
      [...hqBlock.matchAll(/(?:"([\w-]+)"|(\w+)):\s*\[([\d,\s]+)\]/gu)].map((match) => [
        match[1] ?? match[2] ?? "",
        (match[3] ?? "").split(",").map((part) => Number(part.trim())).filter((width) => width > 0),
      ]),
    );
    // 아트마다 실제로 내려받는 파생본이 함께 배포되어야 한다. 고해상도 세트에 없는
    // 아트(luna 등)는 구 세트의 320·640px 파생본을 쓴다.
    const assets = [...names].flatMap((name) => {
      const widths = hqWidths.get(name);
      if (widths && widths.length > 0) {
        return widths.map((width) => `apps/web/public/brand/lobby-hq-20261003/${name}-${width}.webp`);
      }
      return [
        `apps/web/public/brand/illustrated-20260928/${name}-320.webp`,
        `apps/web/public/brand/illustrated-20260928/${name}-640.webp`,
      ];
    });

    for (const asset of assets) {
      const absolutePath = resolve(ROOT, asset);
      const header = readFileSync(absolutePath).subarray(0, 12).toString("ascii");
      expect(header.startsWith("RIFF")).toBe(true);
      expect(header.includes("WEBP")).toBe(true);
      expect(statSync(absolutePath).size).toBeGreaterThan(2_000);
    }
    // 히어로는 큰 표시 크기(약 600 CSS px)에 맞춰 최소 1600px 파생본이 있어야 한다.
    expect(Math.max(...(hqWidths.get("hero") ?? []))).toBeGreaterThanOrEqual(1600);
  });

  it("keeps the creator lobby connected to the real project workflow", () => {
    const page = source(
      "apps/web/src/domains/creator/studio-shell/StudioProjectLibraryManagementPage.tsx",
    );
    const lobby = source(
      "apps/web/src/domains/creator/studio-shell/StudioCreatorLobby.tsx",
    );

    expect(page).toContain('controller.view === "active" ? <StudioCreatorLobby');
    expect(lobby).toContain("controller.projectResumeTarget(project)");
    expect(lobby).toContain("controller.library.touch(project.id, resume.documentId)");
    // AI 디렉터 진입점은 검색 명령 팔레트가 아니라 실제 디렉터 화면(AI 허브 #ai-director)으로 간다.
    expect(lobby).not.toContain("toonspectrum:command-palette:open");
    expect(lobby).toContain("studioLobbyDirectorHref(");
    expect(lobby).toContain("studioLobbyDirectorSuggestions()");
    expect(source("apps/web/src/domains/creator/studio-shell/studio-creator-lobby-model.ts"))
      .toContain("return `${AI_HUB_PATH}${query}#${AI_DIRECTOR_ANCHOR}`;");
    expect(lobby).toContain("/studio/new?kind=webtoon&template=webtoon-vertical");
    expect(lobby).toContain("/studio/assets/characters/new");
    expect(lobby).toContain("/studio/bg3d");
  });

  it("preserves focus, responsive, accessibility, and editor-shell rules", () => {
    const css = source(
      "apps/web/src/domains/creator/studio-shell/studio-visual-identity.css",
    );

    expect(css).toContain('[data-studio-editor="true"]');
    expect(css).toContain("[data-studio-canvas-viewport]");
    expect(css).toContain("@media (max-width: 620px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
  });
});
