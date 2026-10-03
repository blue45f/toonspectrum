// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SpaceNpcPortrait } from "./SpaceNpcPortrait";

afterEach(cleanup);

function portraitRoot() {
  return document.querySelector(".space-npc-portrait");
}

function portraitArt() {
  return document.querySelector(".space-npc-portrait__bust");
}

describe("NPC 대화 초상화는 본인 스프라이트 흉상이다", () => {
  it("npc-concierge는 네이티브 원본의 정면 프레임을 흉상 viewBox로 잘라 보여 준다", () => {
    render(<SpaceNpcPortrait skinKey="npc-concierge" expression="happy" alt="모아 · 컨시어지" artStyle="webtoon" />);
    const art = screen.getByRole("img", { name: "모아 · 컨시어지" });
    expect(art.tagName).toBe("svg");
    // 정면 프레임(78,13,134,204)의 상단 4%~58% — 월드 스프라이트와 같은 얼굴이다.
    expect(art.getAttribute("viewBox")).toBe("78 21.16 134 110.16");
    expect(art.getAttribute("data-character-crop")).toBe("bust");
    expect(art.querySelector("image")?.getAttribute("href")).toBe("/assets/virtual-studio/experience-v8/npc-concierge.png");
    expect(portraitRoot()?.getAttribute("data-expression")).toBe("happy");
    expect(document.querySelector("[src*='portraits-v1']")).toBeNull();
  });

  it("표정이 바뀌어도 아트는 그대로고 data-expression 몸짓 신호만 바뀐다", () => {
    const view = render(<SpaceNpcPortrait skinKey="npc-concierge" expression="happy" alt="모아 · 컨시어지" artStyle="webtoon" />);
    const before = portraitArt()?.getAttribute("viewBox");
    view.rerender(<SpaceNpcPortrait skinKey="npc-concierge" expression="thinking" alt="모아 · 컨시어지" artStyle="webtoon" />);
    expect(portraitRoot()?.getAttribute("data-expression")).toBe("thinking");
    expect(portraitArt()?.getAttribute("viewBox")).toBe(before);
    expect(document.querySelectorAll(".space-npc-portrait__bust")).toHaveLength(1);
  });

  it("npc-artist는 일러스트가 아니라 본인 정면 스프라이트 이미지를 흉상 크롭으로 보여 준다", () => {
    render(<SpaceNpcPortrait skinKey="npc-artist" expression="default" alt="하루 · 아틀리에 메이트" artStyle="webtoon" />);
    const art = screen.getByRole("img", { name: "하루 · 아틀리에 메이트" });
    expect(art.tagName).toBe("IMG");
    expect(art.getAttribute("src")).toBe("/assets/virtual-studio/style-packs-v5/webtoon/npcs/npc-artist-direction-down.webp");
    expect(art.getAttribute("data-character-crop")).toBe("bust");
    expect(art.getAttribute("src")).not.toContain("portraits-v1");
  });

  it("모르는 skinKey도 첫 캐스트의 본인 아트로 폴백 렌더한다", () => {
    render(<SpaceNpcPortrait skinKey="npc-unknown" expression="happy" alt="새 NPC · 안내" artStyle="webtoon" />);
    const art = screen.getByRole("img", { name: "새 NPC · 안내" });
    expect(art.getAttribute("viewBox")).toBe("78 21.16 134 110.16");
    expect(portraitRoot()?.getAttribute("data-expression")).toBe("happy");
  });

  it("근접 스트립 크기(sm)에서도 같은 흉상 아트를 쓴다", () => {
    render(<SpaceNpcPortrait skinKey="npc-concierge" expression="default" alt="" artStyle="webtoon" size="sm" />);
    expect(portraitRoot()?.getAttribute("data-size")).toBe("sm");
    expect(portraitArt()?.getAttribute("viewBox")).toBe("78 21.16 134 110.16");
  });
});
