// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceCustomizationPanel } from "./StudioVirtualSpaceCustomizationPanel";
import {
  DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION,
  studioVirtualDecorationPreset,
  type StudioVirtualDecorationState,
} from "./studio-virtual-space-customization";
import { useState } from "react";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";

// 배치·테마 검증은 정상 빈 목록을 사용하고 HTTP 계약은 client 테스트가 소유한다.
vi.mock("./studio-virtual-custom-furniture-client", async (importOriginal) => ({
  ...await importOriginal<typeof import("./studio-virtual-custom-furniture-client")>(),
  listStudioVirtualCustomFurniture: vi.fn(async () => []),
}));

describe("StudioVirtualSpaceCustomizationPanel", () => {
  it("현재 테마의 가구 원본을 목록과 지도에 함께 반영하며 기존 배치를 유지한다", () => {
    const world = { ...studioVirtualPlaceWorldManifest("skyport", true), colliders: [], props: [], portals: [], npcs: [], interactions: [], interactionSlots: [] };
    const decorations: StudioVirtualDecorationState = { ...studioVirtualDecorationPreset("minimal"), layoutWidth: 960, layoutHeight: 640,
      placements: [{ id: "bench-a", type: "bench", x: 400, y: 320, rotation: 0, scale: 1 }] };
    const props = { nickname: "작가 이름", character: DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION, decorations, world,
      selfPoint: { x: 80, y: 100 }, onNickname: vi.fn(), onCharacter: vi.fn(), onDecorations: vi.fn() };
    const view = render(<StudioVirtualSpaceCustomizationPanel {...props} artStyle="neon" />);
    const assertTheme = (theme: string) => {
      const preview = screen.getByRole("button", { name: /분수/ }).querySelector(".studio-vspace-customization-decor-preview image");
      expect(preview?.getAttribute("href")).toContain(`experience-v8/furniture-${theme}.png`);
      const image = screen.getByRole("group", { name: "가구 배치 지도" }).querySelector("image");
      expect(image?.getAttribute("href")).toContain(`experience-v8/furniture-${theme}.png`);
      expect(image?.closest("svg")?.getAttribute("preserveAspectRatio")).toBe("none");
    };
    assertTheme("neon");
    fireEvent.change(screen.getByRole("combobox", { name: "편집할 가구" }), { target: { value: "bench-a" } });
    view.rerender(<StudioVirtualSpaceCustomizationPanel {...props} artStyle="ink" />);
    assertTheme("ink");
    expect(screen.getByText(/X 400 \/ Y 320 · 0°/)).toBeTruthy();
    expect(props.onDecorations).not.toHaveBeenCalled();
  });

  it("shows ImageGen-backed district and decor previews and updates the selected district", () => {
    const onDecorations = vi.fn();
    render(<StudioVirtualSpaceCustomizationPanel
      nickname="희준 작가"
      character={DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION}
      decorations={studioVirtualDecorationPreset("minimal")}
      selfPoint={{ x: 780, y: 700 }}
      onNickname={vi.fn()}
      onCharacter={vi.fn()}
      onDecorations={onDecorations}
    />);

    const district = screen.getByRole("button", { name: /리뷰 폭포/ });
    expect((district.querySelector(".studio-vspace-customization-district-preview") as HTMLElement).style.backgroundImage)
      .toContain("district-preview-sheet.webp");
    fireEvent.click(district);
    expect(onDecorations).toHaveBeenCalledWith(expect.objectContaining({ districtKey: "review-falls" }));

    const fountain = screen.getByRole("button", { name: /분수/ });
    expect(fountain.querySelector(".studio-vspace-customization-decor-preview image")?.getAttribute("href"))
      .toContain("experience-v8/furniture.png");
    fireEvent.click(fountain);
    expect(onDecorations).toHaveBeenLastCalledWith(expect.objectContaining({
      placements: [expect.objectContaining({ type: "fountain" })],
    }));
  });

  it("validates and commits a public nickname", () => {
    const onNickname = vi.fn();
    render(<StudioVirtualSpaceCustomizationPanel
      nickname="희준 작가"
      character={DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION}
      decorations={studioVirtualDecorationPreset("minimal")}
      selfPoint={{ x: 780, y: 700 }}
      onNickname={onNickname}
      onCharacter={vi.fn()}
      onDecorations={vi.fn()}
    />);

    fireEvent.change(screen.getByRole("textbox", { name: "공개 이름" }), { target: { value: "희준 스튜디오" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(onNickname).toHaveBeenCalledWith("희준 스튜디오");
  });

  it("선택한 가구를 이동·회전하고 실행 취소·다시 실행한다", () => {
    const world = { ...studioVirtualPlaceWorldManifest("skyport", true), colliders: [], props: [], portals: [], npcs: [], interactions: [], interactionSlots: [] };
    function Harness() {
      const [decorations, setDecorations] = useState<StudioVirtualDecorationState>({ ...studioVirtualDecorationPreset("minimal"), layoutWidth: 960, layoutHeight: 640,
        placements: [{ id: "bench-a", type: "bench" as const, x: 400, y: 320, rotation: 0 as 0 | 90 | 180 | 270, scale: 1 }] });
      return <StudioVirtualSpaceCustomizationPanel nickname="작가 이름" character={DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION}
        decorations={decorations} selfPoint={{ x: 80, y: 100 }} world={world} onNickname={vi.fn()} onCharacter={vi.fn()}
        onDecorations={setDecorations} />;
    }
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox", { name: "편집할 가구" }), { target: { value: "bench-a" } });
    fireEvent.click(screen.getByRole("button", { name: "가구 오른쪽" }));
    expect(screen.getByText(/X 416 \/ Y 320/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "가구 90도 회전" }));
    expect(screen.getByText(/X 416 \/ Y 320 · 90°/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "배치 실행 취소" }));
    expect(screen.getByText(/X 416 \/ Y 320 · 0°/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "배치 다시 실행" }));
    expect(screen.getByText(/X 416 \/ Y 320 · 90°/)).toBeTruthy();
  });

  it("가구의 이전 위치로 걸어간 뒤 실행 취소해도 플레이어를 가두지 않는다", () => {
    const world = { ...studioVirtualPlaceWorldManifest("skyport", true), colliders: [], props: [], portals: [], npcs: [], interactions: [], interactionSlots: [] };
    const decorations: StudioVirtualDecorationState = { ...studioVirtualDecorationPreset("minimal"), layoutWidth: 960, layoutHeight: 640,
      placements: [{ id: "bench-a", type: "bench", x: 400, y: 320, rotation: 0, scale: 1 }] };
    const onDecorations = vi.fn();
    const props = { nickname: "작가 이름", character: DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION, decorations, world,
      selfPoint: { x: 80, y: 100 }, onNickname: vi.fn(), onCharacter: vi.fn(), onDecorations };
    const view = render(<StudioVirtualSpaceCustomizationPanel {...props} />);
    fireEvent.change(screen.getByRole("combobox", { name: "편집할 가구" }), { target: { value: "bench-a" } });
    fireEvent.click(screen.getByRole("button", { name: "가구 오른쪽" }));
    const moved: StudioVirtualDecorationState = onDecorations.mock.calls[0]?.[0];
    expect(moved).toBeDefined();
    onDecorations.mockClear();
    view.rerender(<StudioVirtualSpaceCustomizationPanel {...props} decorations={moved} selfPoint={{ x: 381, y: 310 }} />);
    fireEvent.click(screen.getByRole("button", { name: "배치 실행 취소" }));
    expect(onDecorations).not.toHaveBeenCalled();
    expect(screen.getByText(/현재 위치/u, { selector: '[role="status"]' }).textContent).toContain("현재 위치");
    view.rerender(<StudioVirtualSpaceCustomizationPanel {...props} decorations={moved} />);
    fireEvent.click(screen.getByRole("button", { name: "배치 실행 취소" }));
    expect(onDecorations).toHaveBeenCalledWith(expect.objectContaining({ placements: [expect.objectContaining({ x: 400 })] }));
  });

  it("같은 월드 ID의 구조가 바뀌면 이전 배치 기록을 폐기한다", () => {
    const world = { ...studioVirtualPlaceWorldManifest("skyport", true), colliders: [], props: [], portals: [], npcs: [], interactions: [], interactionSlots: [] };
    const decorations: StudioVirtualDecorationState = { ...studioVirtualDecorationPreset("minimal"), layoutWidth: 960, layoutHeight: 640,
      placements: [{ id: "bench-a", type: "bench", x: 400, y: 320, rotation: 0, scale: 1 }] };
    const onDecorations = vi.fn();
    const props = { nickname: "작가 이름", character: DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION, decorations, world,
      selfPoint: { x: 80, y: 100 }, onNickname: vi.fn(), onCharacter: vi.fn(), onDecorations };
    const view = render(<StudioVirtualSpaceCustomizationPanel {...props} />);
    fireEvent.change(screen.getByRole("combobox", { name: "편집할 가구" }), { target: { value: "bench-a" } });
    fireEvent.click(screen.getByRole("button", { name: "가구 오른쪽" }));
    const moved: StudioVirtualDecorationState = onDecorations.mock.calls[0]?.[0];
    onDecorations.mockClear();
    view.rerender(<StudioVirtualSpaceCustomizationPanel {...props} decorations={moved} world={{ ...world, colliders: [{ x: 360, y: 300, width: 40, height: 30 }] }} />);
    expect(screen.getByRole("button", { name: "배치 실행 취소" }).hasAttribute("disabled")).toBe(true);
    expect(onDecorations).not.toHaveBeenCalled();
  });
});
