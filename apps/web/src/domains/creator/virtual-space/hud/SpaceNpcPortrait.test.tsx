// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SPACE_NPC_PORTRAIT_FADE_MS, SpaceNpcPortrait } from "./SpaceNpcPortrait";
import { resetSpaceNpcPortraitManifestCache, SPACE_NPC_PORTRAIT_ROOT } from "./space-npc-portrait";

const manifest = {
  portraits: [{ npc: "npc-cafe", file: "npc-cafe.webp" }],
  expressions: { "npc-cafe": { happy: "npc-cafe-happy.webp", thinking: "npc-cafe-thinking.webp" } },
};

function portraitLayers() {
  return [...document.querySelectorAll<HTMLImageElement>("img.space-npc-portrait__layer")];
}

describe("NPC 초상화 표정 교차 페이드", () => {
  beforeEach(() => {
    resetSpaceNpcPortraitManifestCache();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(manifest), { status: 200 })));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetSpaceNpcPortraitManifestCache();
  });

  it("표정이 바뀐 첫 렌더부터 이전 표정을 아래 층에 남기고, 페이드가 끝나면 한 장만 남긴다", async () => {
    const view = render(<SpaceNpcPortrait skinKey="npc-cafe" expression="happy" alt="린 · 카페 매니저" artStyle="sky-island" />);
    const happy = await screen.findByRole("img", { name: "린 · 카페 매니저" });
    await vi.waitFor(() => expect(screen.getByRole("img", { name: "린 · 카페 매니저" }).getAttribute("src"))
      .toBe(`${SPACE_NPC_PORTRAIT_ROOT}/npc-cafe-happy.webp`));
    expect(happy.getAttribute("alt")).not.toMatch(/NPC 초상화/u);
    vi.useFakeTimers();
    view.rerender(<SpaceNpcPortrait skinKey="npc-cafe" expression="thinking" alt="린 · 카페 매니저" artStyle="sky-island" />);
    const [leaving, entering] = portraitLayers();
    expect(leaving?.getAttribute("src")).toBe(`${SPACE_NPC_PORTRAIT_ROOT}/npc-cafe-happy.webp`);
    expect(leaving?.getAttribute("aria-hidden")).toBe("true");
    expect(entering?.getAttribute("src")).toBe(`${SPACE_NPC_PORTRAIT_ROOT}/npc-cafe-thinking.webp`);
    expect(entering?.hasAttribute("data-entering")).toBe(true);
    act(() => { vi.advanceTimersByTime(SPACE_NPC_PORTRAIT_FADE_MS + 60); });
    expect(portraitLayers()).toHaveLength(1);
    expect(portraitLayers()[0]?.hasAttribute("data-entering")).toBe(false);
  });

  it("표정 파일을 내려받지 못하면 기본 초상화로 바꾸고 깨진 이미지는 아래 층에 남기지 않는다", async () => {
    render(<SpaceNpcPortrait skinKey="npc-cafe" expression="thinking" alt="린 · 카페 매니저" artStyle="sky-island" />);
    await vi.waitFor(() => expect(screen.getByRole("img", { name: "린 · 카페 매니저" }).getAttribute("src"))
      .toBe(`${SPACE_NPC_PORTRAIT_ROOT}/npc-cafe-thinking.webp`));
    fireEvent.error(screen.getByRole("img", { name: "린 · 카페 매니저" }));
    expect(portraitLayers()).toHaveLength(1);
    expect(screen.getByRole("img", { name: "린 · 카페 매니저" }).getAttribute("src")).toBe(`${SPACE_NPC_PORTRAIT_ROOT}/npc-cafe.webp`);
  });

  it("초상화 파일이 없는 NPC는 이름·역할을 대체 텍스트로 쓰는 절차 초상화를 그린다", () => {
    render(<SpaceNpcPortrait skinKey="npc-unknown" expression="happy" alt="새 NPC · 안내" artStyle="sky-island" />);
    expect(portraitLayers()).toHaveLength(0);
    expect(document.querySelector(".space-npc-portrait")?.getAttribute("data-expression")).toBe("procedural");
    expect(screen.getByRole("img", { name: "새 NPC · 안내" })).toBeTruthy();
  });
});
