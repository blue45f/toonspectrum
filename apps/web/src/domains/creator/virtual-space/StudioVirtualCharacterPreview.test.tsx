// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StudioVirtualCharacterPreview } from "./StudioVirtualCharacterPreview";
import { studioCharacterPreviewFrame } from "./studio-virtual-space-character-preview";
import { studioCharacterStaticAsset } from "./studio-virtual-space-character-assets";
import { studioCharacterAtlasGridFrames } from "./studio-virtual-space-character-atlas";
import { createStudioThemeCharacterSkin } from "./studio-virtual-space-character-theme-art";
import type { StudioCharacterSkin } from "./studio-virtual-space-character-skins";

afterEach(cleanup);
const theme = createStudioThemeCharacterSkin({ artStyle: "neon", labelKo: "네온 작가", labelEn: "Neon artist",
  textureUrl: "/assets/test/theme.png", width: 1537, height: 1025,
  frames: Array.from({ length: 32 }, () => ({ originX: .47, originY: .92, displayHeightRatio: .88 })) });

describe("StudioVirtualCharacterPreview", () => {
  it("작화가 균등 셀 경계를 넘으면 검수된 원본 영역을 머리와 발까지 보존한다", () => {
    const frames = studioCharacterAtlasGridFrames({ slicing: "rounded-grid", width: 1536, height: 1024, columns: 8, rows: 4 })
      .map((frame) => frame.index === 8 ? { index: 8, x: 4, y: 249, width: 181, height: 269 } : frame);
    const skin = createStudioThemeCharacterSkin({ artStyle: "pastel", labelKo: "파스텔 작가", labelEn: "Pastel artist",
      textureUrl: "/assets/test/hand-drawn.png", width: 1536, height: 1024,
      atlas: { slicing: "explicit-frames", width: 1536, height: 1024, columns: 8, rows: 4, frames },
      frames: Array.from({ length: 32 }, () => ({ originX: .5, originY: .94, displayHeightRatio: 1 })) });
    render(<StudioVirtualCharacterPreview skin={skin} facing="right" alt="파스텔 작가" />);
    const preview = screen.getByRole("img", { name: "파스텔 작가" });
    expect(preview.getAttribute("viewBox")).toBe("4 249 181 269");
    expect(["x", "y", "width", "height"].map((key) => preview.querySelector("clipPath rect")?.getAttribute(key)))
      .toEqual(["4", "249", "181", "269"]);
  });

  it.each([ ["down", 0, "0 0 192 256"], ["right", 8, "0 256 192 257"],
    ["left", 16, "0 513 192 256"], ["up", 24, "0 769 192 256"] ] as const)
  ("%s 방향은 나머지 픽셀을 포함한 원본 한 셀만 표시한다", (facing, index, bounds) => {
    const view = render(<StudioVirtualCharacterPreview skin={theme} facing={facing} alt="선택한 작가" />);
    const preview = screen.getByRole("img", { name: "선택한 작가" });
    expect(preview.tagName).toBe("svg");
    expect(preview.getAttribute("viewBox")).toBe(bounds);
    expect(preview.getAttribute("data-character-frame")).toBe(String(index));
    const image = preview.querySelector("image");
    expect(image?.getAttribute("href")).toBe(theme.directional.down);
    expect(image?.getAttribute("width")).toBe("1537");
    expect(image?.getAttribute("height")).toBe("1025");
    const clip = preview.querySelector("clipPath");
    expect(image?.getAttribute("clip-path")).toBe(`url(#${clip?.id})`);
    expect(["x", "y", "width", "height"].map((key) => clip?.querySelector("rect")?.getAttribute(key)).join(" ")).toBe(bounds);
    expect(view.container.querySelector("img")).toBeNull();
  });

  it("홀수 원본의 마지막 셀도 원본 끝까지 보존하고 손상된 프레임은 전체 시트로 노출하지 않는다", () => {
    const asset = studioCharacterStaticAsset(theme, "up");
    expect(studioCharacterPreviewFrame({ ...asset, frame: 31 })).toEqual({ index: 31, x: 1345, y: 769, width: 192, height: 256 });
    expect(studioCharacterPreviewFrame({ ...asset, frame: 32 })).toBeNull();
    expect(studioCharacterPreviewFrame({ ...asset, frameWidth: 192 })).toBeNull();
    const invalid = { ...theme, idleFrames: undefined };
    const view = render(<StudioVirtualCharacterPreview skin={invalid} />);
    expect(view.container.querySelector("[data-character-invalid=true]")).not.toBeNull();
    expect(view.container.querySelector("image, img")).toBeNull();
  });

  it("기존 단일 이미지와 상태 이미지는 원래 URL을 유지한다", () => {
    const old: StudioCharacterSkin = { key: "legacy", labelKo: "작가", labelEn: "Artist",
      directional: { down: "/down.png", right: "/right.png", left: "/left.png", up: "/up.png" }, state: { draw: "/draw.png" } };
    const view = render(<StudioVirtualCharacterPreview skin={old} facing="right" alt="기존 작가" />);
    expect(screen.getByRole("img", { name: "기존 작가" }).getAttribute("src")).toBe("/right.png");
    view.rerender(<StudioVirtualCharacterPreview skin={old} motion="draw" alt="기존 작가" />);
    expect(screen.getByRole("img", { name: "기존 작가" }).getAttribute("src")).toBe("/draw.png");
  });

  it("기존 2×2 atlas의 검수된 바깥 여백을 다음 셀로 오인하지 않는다", () => {
    expect(studioCharacterPreviewFrame({ key: "old-atlas", url: "/old.png", type: "spritesheet", frame: 3,
      frameWidth: 627, frameHeight: 480, atlas: { width: 1255, height: 960, remainder: { right: 1, bottom: 0, maxAlpha: 0, nonzeroAlphaPixels: 0 } } }))
      .toEqual({ index: 3, x: 627, y: 480, width: 627, height: 480 });
  });
});
