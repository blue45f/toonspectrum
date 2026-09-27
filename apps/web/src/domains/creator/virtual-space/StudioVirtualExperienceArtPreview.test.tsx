// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StudioVirtualExperienceArtPreview } from "./StudioVirtualExperienceArtPreview";
import { studioCharacterAtlasGridFrames } from "./studio-virtual-space-character-atlas";
import { studioExperienceAtlas } from "./studio-virtual-space-experience-art";

afterEach(cleanup);
describe("StudioVirtualExperienceArtPreview", () => {
  it.each(["furniture", "landmarks"] as const)("%s 원본의 검수된 한 프레임만 표시한다", (kind) => {
    const frame = studioCharacterAtlasGridFrames(studioExperienceAtlas(kind, "ink"))[0];
    const view = render(<StudioVirtualExperienceArtPreview kind={kind} artStyle="ink" frame={0} />);
    const svg = view.container.querySelector("svg"), image = svg?.querySelector("image");
    expect(svg?.getAttribute("viewBox")).toBe(`${frame?.x} ${frame?.y} ${frame?.width} ${frame?.height}`);
    expect(image?.getAttribute("href")).toContain(`experience-v8/${kind}-ink.png`);
    expect(image?.getAttribute("width")).toBe("1254");
    expect(svg?.getAttribute("pointer-events")).toBe("none");
    expect(image?.getAttribute("pointer-events")).toBe("none");
    expect(image?.getAttribute("clip-path")).toBe(`url(#${svg?.querySelector("clipPath")?.id})`);
    expect(svg?.querySelector("clipPath rect")?.getAttribute("height")).toBe(String(frame?.height));
    expect(view.container.querySelector("img")).toBeNull();
  });
  it("범위 밖 프레임을 전체 시트로 보여주지 않는다", () => {
    const view = render(<StudioVirtualExperienceArtPreview kind="furniture" artStyle="retro" frame={16} />);
    expect(view.container.querySelector("image, img")).toBeNull();
  });
});
