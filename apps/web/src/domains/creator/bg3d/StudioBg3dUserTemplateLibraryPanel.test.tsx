// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import {
  StudioBg3dUserTemplateLibraryPanel,
  type StudioBg3dUserTemplateLibraryPanelProps,
} from "./StudioBg3dUserTemplateLibraryPanel";

const ENTRY = {
  id: "template-a",
  name: "저장 템플릿",
  createdAt: 1,
  document: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  commercialUse: true,
} as const;

function renderPanel(
  overrides: Partial<StudioBg3dUserTemplateLibraryPanelProps> = {},
) {
  const callbacks = {
    onSave: vi.fn(),
    onApply: vi.fn(),
    onDelete: vi.fn(),
    onRetry: vi.fn(),
  };
  render(
    <StudioBg3dUserTemplateLibraryPanel
      entries={[ENTRY]}
      status="ready"
      notice={null}
      isSaving={false}
      applyingTemplateId={null}
      saveDisabled={false}
      applyDisabled={false}
      {...callbacks}
      {...overrides}
    />,
  );
  return callbacks;
}

describe("StudioBg3dUserTemplateLibraryPanel", () => {
  it("renders saved templates on the template surface and dispatches every action", () => {
    const callbacks = renderPanel();

    fireEvent.click(screen.getByRole("button", {
      name: "현재 장면을 내 템플릿으로 저장",
    }));
    fireEvent.click(screen.getByRole("button", { name: "저장 템플릿 적용" }));
    fireEvent.click(screen.getByRole("button", {
      name: "저장 템플릿 템플릿 삭제",
    }));

    expect(callbacks.onSave).toHaveBeenCalledTimes(1);
    expect(callbacks.onApply).toHaveBeenCalledWith(ENTRY);
    expect(callbacks.onDelete).toHaveBeenCalledWith("template-a");
  });

  it("surfaces migration failures with an explicit retry action", () => {
    const callbacks = renderPanel({
      entries: [],
      status: "error",
      notice: {
        tone: "error",
        message: "기존 IndexedDB 템플릿 이전에 실패했습니다.",
      },
    });

    expect(screen.getByRole("alert").textContent).toContain(
      "기존 IndexedDB 템플릿 이전에 실패했습니다.",
    );
    expect(screen.getByRole("button", {
      name: "현재 장면을 내 템플릿으로 저장",
    }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(callbacks.onRetry).toHaveBeenCalledTimes(1);
  });

  it("announces successful migration and keeps an empty library understandable", () => {
    const { rerender } = render(
      <StudioBg3dUserTemplateLibraryPanel
        entries={[]}
        status="ready"
        notice={{ tone: "success", message: "기존 템플릿 2개를 이전했습니다." }}
        isSaving={false}
        applyingTemplateId={null}
        saveDisabled
        applyDisabled={false}
        onSave={vi.fn()}
        onApply={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "기존 템플릿 2개를 이전했습니다.",
    );
    expect(screen.getByText("저장된 템플릿이 없습니다.")).toBeTruthy();

    rerender(
      <StudioBg3dUserTemplateLibraryPanel
        entries={[]}
        status="loading"
        notice={null}
        isSaving={false}
        applyingTemplateId={null}
        saveDisabled
        applyDisabled
        onSave={vi.fn()}
        onApply={vi.fn()}
        onDelete={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "템플릿을 불러오는 중입니다.",
    );
  });
});
