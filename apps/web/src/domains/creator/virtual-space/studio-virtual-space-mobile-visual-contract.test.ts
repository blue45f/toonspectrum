import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const spaceCss = readFileSync(new URL("./studio-virtual-space.css", import.meta.url), "utf8");
const hudCss = readFileSync(new URL("./hud/space-hud.css", import.meta.url), "utf8");
const entrySource = readFileSync(new URL("./StudioVirtualSpaceEntryLobby.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("./StudioVirtualSpacePage.tsx", import.meta.url), "utf8");
const mobileDockSource = readFileSync(new URL("./hud/SpaceMobileDock.tsx", import.meta.url), "utf8");

function luminance(hex: string): number {
  const channels = hex.match(/[0-9a-f]{2}/giu)?.map((value) => Number.parseInt(value, 16) / 255) ?? [];
  return channels.reduce((total, channel, index) => {
    const linear = channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return total + linear * [0.2126, 0.7152, 0.0722][index]!;
  }, 0);
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe("Virtual Studio mobile identity and contrast contract", () => {
  it("몰입형 HUD는 화면 전체를 채우고 모바일 도크의 다섯 행동을 안전 영역 안에 배치한다", () => {
    expect(hudCss).toMatch(/\.space-hud \{[^}]*position: fixed;[^}]*inset: 0;[^}]*height: 100dvh;/u);
    expect(hudCss).toContain("env(safe-area-inset-bottom, 0px)");
    expect(hudCss).toContain("body:has(.space-hud) nav[data-site-product] { display: none !important; }");
    expect(hudCss).toContain('body:has(.space-hud) [data-site-ost="mounted"] { display: none !important; }');
    const slots = Array.from(mobileDockSource.matchAll(/data-mobile-slot="([^"]+)"/gu), (match) => match[1]);
    expect(slots).toEqual(["react", "people", "work", "map", "more"]);
    expect(pageSource).not.toContain("data-mobile-slot");
  });

  it("requires a public nickname and never falls back to an email address", () => {
    expect(entrySource).toContain("studio-virtual-nickname");
    expect(entrySource).toContain("이메일은 공개되지 않습니다");
    expect(pageSource).toContain("studioVirtualSpaceNicknameFromAccount");
    expect(pageSource).not.toMatch(/displayName:\s*session\.data\?\.user\.email/u);
  });

  it("keeps NPC answer, prompt, and input text above enhanced contrast targets", () => {
    expect(spaceCss).toContain(".studio-vspace-npc-answer");
    expect(spaceCss).toContain("background:#f7fbff;color:#111c2d");
    expect(spaceCss).toContain("font-size:.95rem");
    expect(contrast("#111c2d", "#f7fbff")).toBeGreaterThanOrEqual(7);
    expect(contrast("#f4f9ff", "#12263b")).toBeGreaterThanOrEqual(7);
    expect(contrast("#526274", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});
