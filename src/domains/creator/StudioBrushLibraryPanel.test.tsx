// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { studioBrushDynamicsPresetSettings } from "./studio-brush-dynamics";
import { MAX_BRUSHES } from "./studio-brush-library";
import { STUDIO_BRUSH_PACK_ACCEPT } from "./studio-brush-pack-format";
import { StudioBrushLibraryPanel } from "./StudioBrushLibraryPanel";

import type { StudioBrushSnapshot, StudioSavedBrush } from "./studio-brush-library";

const snapshot: StudioBrushSnapshot = {
  brushId: "pen",
  strokeWidth: 6,
  brushOpacity: 1,
  color: "#ff6600",
  stabilizer: 6,
  stabilizerMode: "adaptive",
  postCorrection: 4,
  preserveCorners: true,
  pressureCurve: 1,
      pressureMinSize: 0,
  useVelocityPressure: true,
  velocitySensitivity: 0.65,
  tiltEnabled: true,
  tipAngle: -30,
  tipRoundness: 0.24,
  brushDynamics: studioBrushDynamicsPresetSettings("ink-particle"),
  stampTuning: null,
};

const saved: StudioSavedBrush = {
  id: "saved-1",
  name: "주력 펜",
  createdAt: 1,
  updatedAt: 2,
  pinned: true,
  lastUsedAt: 3,
  ...snapshot,
};

afterEach(cleanup);

describe("StudioBrushLibraryPanel", () => {
  it("controlled 목록과 고정·복제·이름·내보내기·공유·삭제 액션을 렌더한다", () => {
    const html = renderToStaticMarkup(
      <StudioBrushLibraryPanel
        currentSnapshot={snapshot}
        brushes={[saved]}
        activeBrushId={saved.id}
        onBrushesChange={() => undefined}
        onApplyBrush={() => undefined}
        onBrushDeleted={() => undefined}
      />
    );
    expect(html).toContain('data-studio-brush-library-scope="saved"');
    expect(html).toContain('data-studio-brush-surface-role="user-library-management"');
    expect(html).toContain('aria-label="내 브러시"');
    expect(html).toContain("내 브러시 · 사용자 설정");
    expect(html).toContain("저장·가져오기·공유·재적용");
    expect(html).toContain(`1/${MAX_BRUSHES}`);
    expect(html).toContain(
      'aria-label="브러시 설정 · Photoshop ABR · libmypaint MYB · Krita KPP 가져오기"',
    );
    // MYB/KPP 파서가 있는데 진입점이 없던 상태를 되돌리지 못하게 accept 를 고정한다.
    expect(html).toContain(`accept="${STUDIO_BRUSH_PACK_ACCEPT}"`);
    for (const extension of [".json", ".abr", ".myb", ".kpp"]) {
      expect(STUDIO_BRUSH_PACK_ACCEPT).toContain(extension);
    }
    expect(html).toContain("주력 펜 고정 해제");
    expect(html).toContain("주력 펜 복제");
    expect(html).toContain("주력 펜 이름 변경");
    expect(html).toContain("주력 펜 내보내기");
    expect(html).toContain("주력 펜 브러시 공유");
    expect(html).toContain("주력 펜 브러시 삭제");
    expect(html).toContain("<details");
    expect(html).toContain("관리 · 덮어쓰기, 복제, 공유");
    expect(html).not.toContain("<details open");
    expect(html).toContain("grid-cols-3");
    expect(html).toContain("sm:grid-cols-6");
    expect(html).toContain('aria-label="주력 펜 브러시 적용, 펜(매끈), 6px, 100퍼센트"');
    expect(html).toContain('aria-pressed="true"');
  });

  it("모바일 조작 영역과 투명 색상용 명암 미리보기를 유지한다", () => {
    const html = renderToStaticMarkup(
      <StudioBrushLibraryPanel
        currentSnapshot={snapshot}
        brushes={[saved]}
        onBrushesChange={() => undefined}
        onApplyBrush={() => undefined}
        onBrushDeleted={() => undefined}
      />
    );
    expect(html).toContain("min-h-11");
    expect(html).toContain("size-11");
    expect(html).toContain("min-h-16");
    expect(html).toContain('role="group" aria-label="내 브러시 표시 방식"');
    expect(html).toContain('data-studio-saved-brush-view="stroke"');
    expect(html).toContain('data-studio-saved-brush-preview="solid"');
    expect(html).toContain('data-studio-saved-brush-preview-opacity="1"');
    expect(html).toContain('fill="#ff6600"');
    expect(html).toContain("oklch(0.9 0.008 70)");
  });

  it("저장한 프로 브러시는 런타임 펜이 아니라 원본 프리셋 이름과 획 스타일로 표시한다", () => {
    const proSaved: StudioSavedBrush = {
      ...saved,
      id: "saved-pro",
      name: "반짝임 장식",
      brushId: "ink-particle",
      sourcePresetId: "heart-stamp",
      sourcePresetName: "하트 도장",
    };
    const html = renderToStaticMarkup(
      <StudioBrushLibraryPanel
        currentSnapshot={snapshot}
        brushes={[proSaved]}
        onBrushesChange={() => undefined}
        onApplyBrush={() => undefined}
        onBrushDeleted={() => undefined}
      />
    );

    expect(html).toContain('data-studio-saved-brush-preview="glitter"');
    expect(html).toContain(
      'aria-label="반짝임 장식 브러시 적용, 하트 도장, 6px, 100퍼센트"'
    );
    expect(html).toContain("하트 도장 · 6px · 100%");
    expect(html).not.toContain("입자");
  });

  it("획과 이름 목록을 바꿔도 저장 브러시 적용·관리 계약을 유지한다", () => {
    const onApplyBrush = vi.fn();
    const { container } = render(
      <StudioBrushLibraryPanel
        currentSnapshot={snapshot}
        brushes={[saved]}
        onBrushesChange={vi.fn()}
        onApplyBrush={onApplyBrush}
        onBrushDeleted={vi.fn()}
      />
    );

    const list = () => container.querySelector<HTMLElement>("[data-studio-saved-brush-view]");
    expect(list()?.dataset.studioSavedBrushView).toBe("stroke");
    expect(screen.getByRole("button", { name: "저장 브러시 획 미리보기" }).getAttribute("aria-pressed"))
      .toBe("true");
    expect(container.querySelector("[data-studio-saved-brush-preview]")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "저장 브러시 이름 목록" }));
    expect(list()?.dataset.studioSavedBrushView).toBe("text");
    expect(screen.getByRole("button", { name: "저장 브러시 이름 목록" }).getAttribute("aria-pressed"))
      .toBe("true");
    expect(container.querySelector("[data-studio-saved-brush-preview]")).toBeNull();
    expect(container.querySelector('span[style*="background"]')).toBeTruthy();

    fireEvent.click(screen.getByRole("button", {
      name: "주력 펜 브러시 적용, 펜(매끈), 6px, 100퍼센트",
    }));
    expect(onApplyBrush).toHaveBeenCalledOnce();
    expect(onApplyBrush).toHaveBeenCalledWith(saved);
    expect(screen.getByText("관리 · 덮어쓰기, 복제, 공유")).toBeTruthy();
  });

  it("빈 상태는 모바일에서도 저장 브러시를 재사용할 수 있음을 안내한다", () => {
    const html = renderToStaticMarkup(
      <StudioBrushLibraryPanel
        currentSnapshot={snapshot}
        brushes={[]}
        onBrushesChange={() => undefined}
        onApplyBrush={() => undefined}
        onBrushDeleted={() => undefined}
      />
    );
    expect(html).toContain("모바일에서도 바로 꺼내 쓸 수 있어요");
  });
});
