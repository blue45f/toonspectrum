// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppearanceDialogHost } from "./AppearanceDialogHost";
import { AppearanceSettings } from "./AppearanceSettings";
import { AppearanceTrigger } from "./AppearanceTrigger";

import { useAppearanceDialog } from "@/shared/lib/appearance-dialog-store";
import { setAppearanceScope, useTheme } from "@/shared/lib/theme";

vi.mock("@/shared/lib/i18n", () => ({ useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: "ko" }) }));
beforeEach(() => {
  useAppearanceDialog.getState().close();
  localStorage.clear();
  useTheme.setState({ preference: "dark", studioPreference: "inherit", storageAvailable: true });
  setAppearanceScope("site");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("appearance controls", () => {
  it("exposes grouped signature, classic and accessibility presets with independent Studio preferences", () => {
    render(<AppearanceSettings />);
    expect(screen.getAllByRole("radio")).toHaveLength(10);
    expect(screen.getByRole("heading", { name: "시그니처 테마" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "클래식 작업실" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "접근성" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "오로라" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "미드나이트" }));
    expect(useTheme.getState().preference).toBe("midnight");
    fireEvent.click(screen.getByRole("button", { name: "스튜디오" }));
    expect(screen.getAllByRole("radio")).toHaveLength(11);
    fireEvent.click(screen.getByRole("radio", { name: "페이퍼" }));
    expect(useTheme.getState().studioPreference).toBe("light");
    expect(useTheme.getState().preference).toBe("midnight");
    fireEvent.click(screen.getByRole("button", { name: "기본값 복원" }));
    expect(useTheme.getState().studioPreference).toBe("inherit");
    expect(useTheme.getState().preference).toBe("midnight");
  });
  it("survives a parent menu unmount and restores its launcher", async () => {
    function Fixture({ menu }: { menu: boolean }) {
      return <><button type="button" aria-controls="project-menu">프로젝트 센터</button>
        {menu && <div role="dialog" aria-label="프로젝트" id="project-menu"><AppearanceTrigger scope="studio" /></div>}
        <AppearanceDialogHost /></>;
    }
    const view = render(<Fixture menu />);
    const launcher = screen.getByRole("button", { name: "프로젝트 센터" });
    fireEvent.click(screen.getByRole("button", { name: "디자인 테마" }));
    view.rerender(<Fixture menu={false} />);
    expect(await screen.findByRole("dialog", { name: "디자인 테마" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "세피아" }));
    expect(useTheme.getState().studioPreference).toBe("sepia");
    fireEvent.click(screen.getByRole("button", { name: "테마 설정 닫기" }));
    await waitFor(() => expect(document.activeElement).toBe(launcher));
  });

  it("warns when preferences cannot be stored", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    render(<AppearanceSettings />);
    fireEvent.click(screen.getByRole("radio", { name: "세피아" }));
    expect(screen.getByRole("status").textContent).toContain("이번 세션");
  });
  it("opens a labeled dialog, applies a preset and returns keyboard focus", async () => {
    render(<><AppearanceTrigger scope="studio" /><AppearanceDialogHost /></>);
    const trigger = screen.getByRole("button", { name: "디자인 테마" });
    trigger.focus(); fireEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: "디자인 테마" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "그래파이트" }));
    expect(useTheme.getState().studioPreference).toBe("graphite");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "테마 설정 닫기" })); });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
