// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AVATAR_FORGE_HAIR_STYLE_OPTIONS, createAvatarForgeState } from "./studio-vrm-avatar-forge";
import {
  countStudioVrmAvatarForgeChanges,
  describeStudioVrmAvatarForgeState,
  StudioVrmAvatarForgePreview,
} from "./StudioVrmAvatarForgePreview";

describe("StudioVrmAvatarForgePreview", () => {
  it("renders deterministic visual metadata for a real recipe", () => {
    const state = createAvatarForgeState("wave-diva");
    render(<StudioVrmAvatarForgePreview state={state} label="웨이브 디바 미리보기" />);

    const preview = screen.getByRole("img", { name: "웨이브 디바 미리보기" });
    expect(preview.getAttribute("data-forge-preview")).toBe("true");
    expect(preview.getAttribute("data-hair-style")).toBe(state.hair.style);
    expect(preview.querySelectorAll("path").length).toBeGreaterThan(4);
  });

  it("describes and counts only visible authoring changes", () => {
    const baseline = createAvatarForgeState();
    const changed = createAvatarForgeState();
    changed.face = { ...changed.face, headWidth: 1.1 };
    changed.hair = { ...changed.hair, style: "bob", baseColor: "#112233" };

    const summary = describeStudioVrmAvatarForgeState(changed, baseline);
    expect(summary.face).toContain("둥근");
    expect(summary.hair).toBe("보브");
    expect(summary.changedControls).toBe(countStudioVrmAvatarForgeChanges(changed, baseline));
    expect(summary.changedControls).toBeGreaterThanOrEqual(3);
  });

  it("keeps the hairless option actually hairless even when a bang preset is selected", () => {
    const state = createAvatarForgeState();
    state.hair = { ...state.hair, style: "none", bangStyle: "full" };
    render(<StudioVrmAvatarForgePreview state={state} label="헤어 없음 미리보기" />);

    const preview = screen.getByRole("img", { name: "헤어 없음 미리보기" });
    expect(preview.querySelector('[data-forge-hair-back="true"] path')).toBeNull();
    expect(preview.querySelector('[data-forge-hair-front="true"]')).toBeNull();
  });

  it("uses genuinely different silhouettes for short and pixie cuts", () => {
    const shortState = createAvatarForgeState();
    shortState.hair = { ...shortState.hair, style: "short" };
    const pixieState = createAvatarForgeState();
    pixieState.hair = { ...pixieState.hair, style: "pixie" };

    const { rerender } = render(<StudioVrmAvatarForgePreview state={shortState} label="숏 미리보기" />);
    const shortPath = screen.getByRole("img", { name: "숏 미리보기" })
      .querySelector('[data-forge-hair-back="true"] path')?.getAttribute("d");
    rerender(<StudioVrmAvatarForgePreview state={pixieState} label="픽시 미리보기" />);
    const pixiePath = screen.getByRole("img", { name: "픽시 미리보기" })
      .querySelector('[data-forge-hair-back="true"] path')?.getAttribute("d");

    expect(shortPath).toBeTruthy();
    expect(pixiePath).toBeTruthy();
    expect(shortPath).not.toBe(pixiePath);
  });
});


describe("StudioVrmAvatarForgePreview hair catalogue quality", () => {
  it("renders hair-none without residual bangs or shine", () => {
    const state = createAvatarForgeState();
    state.hair = { ...state.hair, style: "none", bangStyle: "full" };
    const { container } = render(<StudioVrmAvatarForgePreview state={state} showBody={false} />);
    expect(container.querySelector('[data-hair-layer="back"]')).toBeNull();
    expect(container.querySelector('[data-hair-layer="bangs"]')).toBeNull();
    expect(container.querySelector('[data-hair-layer="shine"]')).toBeNull();
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("18 0 124 138");
  });

  it("gives every named hair style a distinct silhouette signature", () => {
    const signatures = new Set<string>();
    for (const option of AVATAR_FORGE_HAIR_STYLE_OPTIONS) {
      if (option.id === "none") continue;
      const state = createAvatarForgeState();
      state.hair = { ...state.hair, style: option.id, bangStyle: "none" };
      const { container, unmount } = render(<StudioVrmAvatarForgePreview state={state} showBody={false} />);
      const back = container.querySelector('[data-hair-layer="back"]');
      const signature = Array.from(back?.querySelectorAll("path, circle, ellipse") ?? [])
        .map((node) => `${node.tagName}:${node.getAttribute("d") ?? node.getAttribute("cx") ?? ""}:${node.getAttribute("cy") ?? ""}`)
        .join("|");
      expect(signature, option.id).not.toBe("");
      expect(signatures.has(signature), option.id).toBe(false);
      signatures.add(signature);
      unmount();
    }
  });
});
