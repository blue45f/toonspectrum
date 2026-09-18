// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StudioBg3dProfessionalWorkspace } from "./StudioBg3dProfessionalWorkspace";
import {
  DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT,
  STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LEGACY_STORAGE_KEY,
  normalizeStudioBg3dProfessionalWorkspaceLayout,
  readStudioBg3dProfessionalWorkspaceLayout,
  setStudioBg3dWorkspacePanelWidth,
  studioBg3dProfessionalWorkspaceStorageKey,
} from "./studio-bg3d-professional-workspace-layout";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("Studio BG3D professional workspace layout", () => {
  it("normalizes corrupt values and migrates v1 widths", () => {
    expect(normalizeStudioBg3dProfessionalWorkspaceLayout(null)).toEqual(
      DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT,
    );
    expect(normalizeStudioBg3dProfessionalWorkspaceLayout({
      version: 1,
      outlinerWidth: 9999,
      inspectorWidth: -50,
    })).toEqual({
      version: 2,
      outlinerWidth: 420,
      inspectorWidth: 320,
      outlinerVisible: true,
      inspectorVisible: true,
      dockOrder: "outliner-viewport-inspector",
      preset: "custom",
    });
  });

  it("restores legacy settings into a project-scoped v2 workspace", () => {
    window.localStorage.setItem(
      STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LEGACY_STORAGE_KEY,
      JSON.stringify({ version: 1, outlinerWidth: 312, inspectorWidth: 448 }),
    );
    const restored = readStudioBg3dProfessionalWorkspaceLayout(
      window.localStorage,
      "project-a",
    );
    expect(restored).toMatchObject({
      version: 2,
      outlinerWidth: 312,
      inspectorWidth: 448,
      preset: "custom",
    });
    expect(setStudioBg3dWorkspacePanelWidth(restored, "outliner", 100)).toMatchObject({
      outlinerWidth: 240,
      inspectorWidth: 448,
      preset: "custom",
    });
  });

  it("supports keyboard resize, dock controls, presets, and scoped persistence", async () => {
    render(
      <StudioBg3dProfessionalWorkspace
        scopeKey="project-a:scene-1"
        outliner={<div>장면 계층</div>}
        viewport={<main>뷰포트</main>}
        inspector={<aside>속성</aside>}
      />,
    );

    const outlinerSeparator = screen.getByRole("separator", { name: "장면 계층 패널 너비" });
    const inspectorSeparator = screen.getByRole("separator", { name: "속성 패널 너비" });
    expect(outlinerSeparator.getAttribute("aria-valuenow")).toBe("280");
    expect(inspectorSeparator.getAttribute("aria-valuenow")).toBe("360");

    fireEvent.keyDown(outlinerSeparator, { key: "ArrowRight" });
    fireEvent.keyDown(inspectorSeparator, { key: "ArrowLeft", shiftKey: true });
    expect(outlinerSeparator.getAttribute("aria-valuenow")).toBe("296");
    expect(inspectorSeparator.getAttribute("aria-valuenow")).toBe("392");

    fireEvent.click(screen.getByRole("button", { name: "좌우 바꾸기" }));
    fireEvent.click(screen.getByRole("button", { name: "계층" }));
    expect(screen.queryByRole("separator", { name: "장면 계층 패널 너비" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "캐릭터" }));
    expect(screen.getByRole("button", { name: "캐릭터" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("separator", { name: "장면 계층 패널 너비" })).toHaveAttribute(
      "aria-valuenow",
      "260",
    );
    expect(screen.getByRole("separator", { name: "속성 패널 너비" })).toHaveAttribute(
      "aria-valuenow",
      "440",
    );

    await waitFor(() => {
      const serialized = window.localStorage.getItem(
        studioBg3dProfessionalWorkspaceStorageKey("project-a:scene-1"),
      );
      expect(serialized).not.toBeNull();
      expect(JSON.parse(serialized ?? "null")).toMatchObject({
        version: 2,
        preset: "character",
        outlinerWidth: 260,
        inspectorWidth: 440,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "집중" }));
    expect(screen.queryByRole("separator")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "기본 배치" }));
    expect(screen.getAllByRole("separator")).toHaveLength(2);
  });
});
