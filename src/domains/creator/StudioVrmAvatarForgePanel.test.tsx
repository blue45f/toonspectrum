// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAvatarForgeState, type AvatarForgeState } from "./studio-vrm-avatar-forge";
import { StudioVrmAvatarForgePanel } from "./StudioVrmAvatarForgePanel";

afterEach(cleanup);

function renderPanel(overrides: {
  readonly state?: AvatarForgeState;
  readonly disabled?: boolean;
} = {}) {
  const onChange = vi.fn();
  const state = overrides.state ?? createAvatarForgeState("wave-diva");
  const view = render(
    <StudioVrmAvatarForgePanel
      state={state}
      disabled={overrides.disabled}
      detectedOriginalHairCount={2}
      onChange={onChange}
    />,
  );
  return { ...view, onChange, state };
}

describe("StudioVrmAvatarForgePanel body creator", () => {
  it("exposes a compact four-step creation flow and a dedicated body workspace", () => {
    renderPanel();
    const tablist = screen.getByRole("tablist", { name: "아바타 조형 단계" });
    const bodyTab = screen.getByRole("tab", { name: "체형" });

    expect(tablist.className).toContain("grid-cols-4");
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(bodyTab.className).toContain("min-w-0");

    fireEvent.click(bodyTab);

    expect(bodyTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "체형 실루엣 편집" })).toBeTruthy();
    expect(screen.getAllByRole("slider")).toHaveLength(5);
    expect(screen.getByText(/원본 메시를 다시 쓰지 않고/u)).toBeTruthy();
  });

  it("applies a deterministic body preset while preserving the existing face and hair", () => {
    const { onChange, state } = renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: "체형" }));
    fireEvent.click(screen.getByRole("button", { name: /^히어로 체형:/u }));

    expect(onChange).toHaveBeenCalledOnce();
    const next = onChange.mock.calls[0]?.[0] as AvatarForgeState;
    expect(next.bodyPresetId).toBe("hero");
    expect(next.presetId).toBeUndefined();
    expect(next.body).toEqual({
      shoulderWidth: 1.1,
      torsoLength: 1.03,
      hipWidth: 0.96,
      armLength: 1.04,
      legLength: 1.06,
    });
    expect(next.face).toEqual(state.face);
    expect(next.hair).toEqual(state.hair);
    expect(next.faceAccents).toEqual(state.faceAccents);
  });

  it("turns a preset into a direct edit when a body slider moves", () => {
    const hero = createAvatarForgeState("wave-diva");
    hero.bodyPresetId = "hero";
    hero.body = {
      shoulderWidth: 1.1,
      torsoLength: 1.03,
      hipWidth: 0.96,
      armLength: 1.04,
      legLength: 1.06,
    };
    const { onChange } = renderPanel({ state: hero });
    fireEvent.click(screen.getByRole("tab", { name: "체형" }));

    fireEvent.change(screen.getByRole("slider", { name: "어깨 너비" }), {
      target: { value: "1.04" },
    });

    const next = onChange.mock.calls[0]?.[0] as AvatarForgeState;
    expect(next.bodyPresetId).toBeUndefined();
    expect(next.presetId).toBeUndefined();
    expect(next.body.shoulderWidth).toBe(1.04);
    expect(next.hair).toEqual(hero.hair);
  });

  it("disables body recipes and sliders together when no VRM is loaded", () => {
    const { onChange } = renderPanel({ disabled: true });
    fireEvent.click(screen.getByRole("tab", { name: "체형" }));

    const hero = screen.getByRole("button", { name: /^히어로 체형:/u });
    expect((hero as HTMLButtonElement).disabled).toBe(true);
    for (const slider of screen.getAllByRole("slider")) {
      expect((slider as HTMLInputElement).disabled).toBe(true);
    }

    fireEvent.click(hero);
    expect(onChange).not.toHaveBeenCalled();
  });
});
