// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StudioBg3dProfessionalWorkspace } from "./StudioBg3dProfessionalWorkspace";
import {
  DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT,
  STUDIO_BG3D_PROFESSIONAL_WORKSPACE_STORAGE_KEY,
  normalizeStudioBg3dProfessionalWorkspaceLayout,
  readStudioBg3dProfessionalWorkspaceLayout,
  setStudioBg3dWorkspacePanelWidth,
} from "./studio-bg3d-professional-workspace-layout";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("Studio BG3D professional workspace layout", () => {
  it("normalizes corrupt or excessive persisted values", () => {
    expect(normalizeStudioBg3dProfessionalWorkspaceLayout(null)).toEqual(
      DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT,
    );
    expect(normalizeStudioBg3dProfessionalWorkspaceLayout({
      version: 99,
      outlinerWidth: 9999,
      inspectorWidth: -50,
    })).toEqual({ version: 1, outlinerWidth: 420, inspectorWidth: 320 });
  });

  it("restores a valid saved layout and clamps subsequent panel changes", () => {
    window.localStorage.setItem(
      STUDIO_BG3D_PROFESSIONAL_WORKSPACE_STORAGE_KEY,
      JSON.stringify({ version: 1, outlinerWidth: 312, inspectorWidth: 448 }),
    );
    const restored = readStudioBg3dProfessionalWorkspaceLayout(window.localStorage);
    expect(restored).toEqual({ version: 1, outlinerWidth: 312, inspectorWidth: 448 });
    expect(setStudioBg3dWorkspacePanelWidth(restored, "outliner", 100)).toEqual({
      version: 1,
      outlinerWidth: 240,
      inspectorWidth: 448,
    });
  });

  it("supports keyboard resizing, reset, and durable preferences", async () => {
    render(
      <StudioBg3dProfessionalWorkspace
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

    await waitFor(() => {
      expect(JSON.parse(
        window.localStorage.getItem(STUDIO_BG3D_PROFESSIONAL_WORKSPACE_STORAGE_KEY) ?? "null",
      )).toEqual({ version: 1, outlinerWidth: 296, inspectorWidth: 392 });
    });

    fireEvent.doubleClick(outlinerSeparator);
    fireEvent.doubleClick(inspectorSeparator);
    expect(outlinerSeparator.getAttribute("aria-valuenow")).toBe("280");
    expect(inspectorSeparator.getAttribute("aria-valuenow")).toBe("360");
  });
});
