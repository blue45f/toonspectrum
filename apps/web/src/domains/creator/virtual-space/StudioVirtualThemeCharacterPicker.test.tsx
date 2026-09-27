// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualThemeCharacterPicker } from "./StudioVirtualThemeCharacterPicker";
import { STUDIO_CHARACTER_SKINS } from "./studio-virtual-space-character-skins";

afterEach(cleanup);

describe("StudioVirtualThemeCharacterPicker", () => {
  it("6개 테마를 명시적으로 선택하며 추천 테마가 바뀌어도 기존 캐릭터를 유지한다", () => {
    const onSelect = vi.fn();
    const neonIndex = STUDIO_CHARACTER_SKINS.findIndex((skin) => skin.nativeArtStyle === "neon");
    const neonLabel = STUDIO_CHARACTER_SKINS[neonIndex]?.labelKo;
    const webtoonLabel = STUDIO_CHARACTER_SKINS.find((skin) => skin.nativeArtStyle === "webtoon")?.labelKo;
    expect(neonIndex).toBeGreaterThan(4);
    const view = render(<StudioVirtualThemeCharacterPicker artStyle="neon" avatarIndex={0} onSelect={onSelect} />);
    expect(screen.getAllByRole("button")).toHaveLength(6);
    const neon = screen.getByRole("button", { name: `${neonLabel} 테마 캐릭터 선택` });
    expect(within(neon).getByText("현재 테마와 어울려요")).toBeTruthy();
    expect(screen.queryByRole("button", { pressed: true })).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(neon);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(neonIndex);
    view.rerender(<StudioVirtualThemeCharacterPicker artStyle="webtoon" avatarIndex={neonIndex} onSelect={onSelect} />);
    expect(screen.getByRole("button", { pressed: true })).toBe(neon);
    expect(within(neon).queryByText("현재 테마와 어울려요")).toBeNull();
    expect(within(screen.getByRole("button", { name: `${webtoonLabel} 테마 캐릭터 선택` })).getByText("현재 테마와 어울려요")).toBeTruthy();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(view.container.querySelectorAll("svg[data-character-frame='0']")).toHaveLength(6);
    expect(view.container.querySelector("img")).toBeNull();
  });
});
