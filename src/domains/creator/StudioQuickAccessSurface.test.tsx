// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_STUDIO_QUICK_ACCESS_STATE,
  type StudioQuickAccessState,
} from "./studio-quick-access";
import {
  buildStudioQuickAccessCommandCatalog,
} from "./studio-quick-access-integration";
import { StudioQuickAccessSurface } from "./StudioQuickAccessSurface";

const CATALOG = buildStudioQuickAccessCommandCatalog({
  undo: true,
  redo: true,
  save: true,
  pen: true,
  eraser: true,
  fill: true,
  eyedropper: true,
  select: true,
  transform: false,
  "fit-canvas": true,
  properties: true,
  duplicate: false,
  delete: false,
  "bring-front": false,
  "add-bubble": true,
  "quick-mask": false,
  "wet-mix": false,
  "dodge-burn": false,
});

afterEach(cleanup);

function SurfaceHarness({
  isMobile,
  onExecute = () => undefined,
}: {
  isMobile: boolean;
  onExecute?: (commandId: string, setId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<StudioQuickAccessState>(
    DEFAULT_STUDIO_QUICK_ACCESS_STATE,
  );
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        빠른 액세스 열기
      </button>
      {open ? (
        <StudioQuickAccessSurface
          state={state}
          catalog={CATALOG}
          isMobile={isMobile}
          onStateChange={setState}
          onExecute={onExecute}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

describe("StudioQuickAccessSurface", () => {
  it("keeps desktop non-modal and restores launcher focus after close", async () => {
    render(<SurfaceHarness isMobile={false} />);
    const launcher = screen.getByRole("button", {
      name: "빠른 액세스 열기",
    });
    launcher.focus();
    fireEvent.click(launcher);

    const surface = screen.getByRole("dialog", {
      name: "빠른 액세스 팔레트",
    });
    expect(surface.getAttribute("aria-modal")).toBeNull();
    expect(surface.getAttribute("data-mobile")).toBe("false");
    expect(surface.className).toContain("top-[4.75rem]");
    expect(
      screen.queryByRole("button", { name: "빠른 액세스 닫기" }),
    ).toBeNull();

    await waitFor(() => {
      expect(document.activeElement?.getAttribute("aria-label")).toBe(
        "되돌리기 실행",
      );
    });
    fireEvent.click(screen.getByRole("button", {
      name: "빠른 액세스 팔레트 닫기",
    }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(launcher);
  });

  it("uses a bounded mobile sheet, backdrop dismissal, and one trusted executor", () => {
    const onExecute = vi.fn();
    render(<SurfaceHarness isMobile onExecute={onExecute} />);
    fireEvent.click(screen.getByRole("button", {
      name: "빠른 액세스 열기",
    }));

    const surface = screen.getByRole("dialog", {
      name: "빠른 액세스 팔레트",
    });
    expect(surface.getAttribute("aria-modal")).toBe("true");
    expect(surface.getAttribute("data-mobile")).toBe("true");
    expect(surface.className).toContain("h-[min(78dvh,44rem)]");
    expect(surface.className).toContain("max-h-[calc(100dvh-4rem)]");

    fireEvent.click(screen.getByRole("button", { name: "펜 실행" }));
    expect(onExecute).toHaveBeenCalledWith(
      "pen",
      DEFAULT_STUDIO_QUICK_ACCESS_STATE.activeSetId,
    );

    fireEvent.pointerDown(screen.getByRole("button", {
      name: "빠른 액세스 닫기",
    }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lets inner customization consume Escape before closing the surface", () => {
    render(<SurfaceHarness isMobile={false} />);
    fireEvent.click(screen.getByRole("button", {
      name: "빠른 액세스 열기",
    }));
    fireEvent.click(screen.getByRole("button", {
      name: "빠른 액세스 편집",
    }));

    const search = screen.getByRole("searchbox", {
      name: "추가할 빠른 액세스 명령 검색",
    });
    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.getByRole("dialog", {
      name: "빠른 액세스 팔레트",
    })).toBeTruthy();

    fireEvent.keyDown(screen.getByRole("dialog", {
      name: "빠른 액세스 팔레트",
    }), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes with the same Shift+Q chord inside its shortcut boundary", () => {
    render(<SurfaceHarness isMobile={false} />);
    fireEvent.click(screen.getByRole("button", {
      name: "빠른 액세스 열기",
    }));

    fireEvent.keyDown(screen.getByRole("dialog", {
      name: "빠른 액세스 팔레트",
    }), {
      code: "KeyQ",
      key: "Q",
      shiftKey: true,
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps Shift+Q available as text while the command search field is focused", () => {
    render(<SurfaceHarness isMobile={false} />);
    fireEvent.click(screen.getByRole("button", {
      name: "빠른 액세스 열기",
    }));
    fireEvent.click(screen.getByRole("button", {
      name: "빠른 액세스 편집",
    }));
    const search = screen.getByRole("searchbox", {
      name: "추가할 빠른 액세스 명령 검색",
    });

    fireEvent.keyDown(search, {
      code: "KeyQ",
      key: "Q",
      shiftKey: true,
    });

    expect(screen.getByRole("dialog", {
      name: "빠른 액세스 팔레트",
    })).toBeTruthy();
  });
});
