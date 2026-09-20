// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreatorExperienceModeSwitch } from "./CreatorExperienceModeSwitch";

const state = vi.hoisted(() => ({ mode: "classic", setMode: vi.fn() }));
vi.mock("@/shared/lib/creator-experience-mode", () => ({ useCreatorExperienceMode: (selector: (value: typeof state) => unknown) => selector(state) }));
vi.mock("@/shared/lib/i18n", () => ({ useI18n: (selector: (value: { lang: string }) => unknown) => selector({ lang: "ko" }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("workspace view switching remains directly operable", () => {
  it("does not put a duplicate interactive tooltip over the neighbouring view button", () => {
    render(<CreatorExperienceModeSwitch />);
    expect(screen.getByRole("group").getAttribute("data-app-tooltip-exclude")).toBe("true");
    expect(screen.getByRole("button", { name: "공간 보기" }).hasAttribute("title")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "공간 보기" }));
    expect(state.setMode).toHaveBeenCalledWith("virtual-studio");
  });
  it("keeps explicit accessible names when the compact alternate view is icon-only", () => {
    render(<CreatorExperienceModeSwitch compact />);
    expect(screen.getByRole("button", { name: "목록 보기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "공간 보기" })).toBeTruthy();
  });
});
