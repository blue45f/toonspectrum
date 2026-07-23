// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Folder, Pencil } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioAppMenubar,
  StudioDockButton,
  type StudioDockButtonProps,
  StudioDockNavButton,
  StudioEdgeRailButton,
  StudioHudPill,
  StudioKbdBadge,
  StudioMenuPopoverHeader,
  StudioMenuSubtabs,
  StudioQuickActionsBar,
  StudioRailToolButton,
  type StudioRailToolButtonProps,
  StudioStatusBar,
  StudioFloatingToolPopover,
  StudioToolBelt,
  StudioToolIdentity,
  StudioToolbarDivider,
  StudioToolbarCluster,
  StudioVerticalToolRail,
} from "./studio-chrome-ui";
import {
  STUDIO_DUAL_COLOR_WELL_HINTS,
  StudioDualColorWell,
} from "./StudioDualColorWell";

afterEach(cleanup);

describe("studio chrome UI", () => {
  it("renders labeled toolbar dividers for competitor-style tool groups", () => {
    const html = renderToStaticMarkup(<StudioToolbarDivider label="도구" />);
    expect(html).toContain('role="separator"');
    expect(html).toContain("aria-label=\"도구\"");
    expect(html).toContain("도구");
    expect(html).toContain("uppercase");
  });

  it("groups toolbar clusters with accessible labels and draw-app shell frame", () => {
    const html = renderToStaticMarkup(
      <StudioToolbarCluster label="그리기 도구">
        <button type="button">펜</button>
      </StudioToolbarCluster>
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="그리기 도구"');
    expect(html).toContain("rounded-xl");
    expect(html).toContain("border-line");
    // 스크롤 벨트 안에서 클러스터는 고유 폭을 유지해야 한다 — max-w-full 캡은
    // 뷰포트보다 넓은 클러스터의 꼬리 버튼을 다음 클러스터 밑에 깔았다(320px 회귀).
    expect(html).not.toContain("max-w-full");
  });

  it("floating tool popover is a portal host (closed renders nothing)", () => {
    expect(renderToStaticMarkup(<StudioFloatingToolPopover open={false}>x</StudioFloatingToolPopover>)).toBe("");
    expect(typeof StudioFloatingToolPopover).toBe("function");
  });

  it("renders a full tool-belt rail for the immersive draw-app shell", () => {
    const html = renderToStaticMarkup(
      <StudioToolBelt>
        <button type="button">펜</button>
      </StudioToolBelt>
    );
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('data-studio-tool-belt="true"');
    expect(html).toContain("스튜디오 도구");
    expect(html).toContain("sticky");
    expect(html).toContain("flex-nowrap");
  });

  it("renders a compact app menubar for canvas-max chrome", () => {
    const html = renderToStaticMarkup(
      <StudioAppMenubar>
        <span>스튜디오</span>
      </StudioAppMenubar>
    );
    expect(html).toContain('data-studio-app-menubar="true"');
    expect(html).toContain("h-11");
    expect(html).toContain("스튜디오");
  });

  it("renders edge rail buttons for collapsed docks", () => {
    const html = renderToStaticMarkup(
      <StudioEdgeRailButton side="left" label="페이지" icon={Folder} onClick={() => {}} />
    );
    expect(html).toContain('data-studio-edge-rail="left"');
    expect(html).toContain("페이지");
    expect(html).toContain("페이지 펼치기");
  });

  it("renders menu popover header and subtabs with icons", () => {
    const onSelect = vi.fn();
    const html = renderToStaticMarkup(
      <>
        <StudioMenuPopoverHeader icon={Folder} title="에셋" description="템플릿과 효과" />
        <StudioMenuSubtabs
          activeId="template"
          onSelect={onSelect}
          items={[
            { id: "template", label: "템플릿", icon: Folder },
            { id: "pen", label: "펜", icon: Pencil },
          ]}
        />
      </>
    );
    expect(html).toContain("에셋");
    expect(html).toContain("템플릿과 효과");
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("템플릿");
    expect(html).toContain("text-on-accent");
  });

  it("keeps mobile dock targets at least 44px in both axes and marks active state", () => {
    const html = renderToStaticMarkup(
      <StudioDockButton icon={Pencil} label="펜" active />
    );
    expect(html).toContain("min-h-11");
    expect(html).toContain("min-w-11");
    expect(html).toContain("bg-accent");
    expect(html).toContain("text-on-accent");
    expect(html).toContain("펜");
  });

  it("offers motion-coach intent targets on mobile dock controls", () => {
    const html = renderToStaticMarkup(
      <StudioDockButton
        icon={Pencil}
        label="펜"
        hintShortcut="B"
        hintDescription="필압과 보정이 적용되는 자유선을 그립니다."
      />
    );
    expect(html).toContain('data-studio-tool-hint-target="true"');
    expect(html).toContain("min-w-11 flex-1");
    expect(html).toContain("min-h-11");
  });

  it("rejects cross-family preview props on reusable chrome controls", () => {
    const compileTimeInvalidChromeProps = (): void => {
      // @ts-expect-error pause is not a shape preview variant.
      const invalidDock: StudioDockButtonProps = {
        label: "도형",
        hintPreview: "shape",
        hintPreviewVariant: "pause",
      };
      const invalidRail: StudioRailToolButtonProps = {
        icon: Pencil,
        label: "올가미",
        hintPreview: "lasso",
        // @ts-expect-error zoom-in is not a lasso preview variant.
        hintPreviewVariant: "zoom-in",
      };
      expect(invalidDock).toBeUndefined();
      expect(invalidRail).toBeUndefined();
    };

    expect(compileTimeInvalidChromeProps).toBeTypeOf("function");
  });

  it("keeps secondary mobile navigation targets at least 44px in both axes", () => {
    const html = renderToStaticMarkup(
      <StudioDockNavButton icon={Folder} label="페이지" />
    );
    expect(html).toContain("min-h-11");
    expect(html).toContain("min-w-11");
  });

  it("keeps disabled dock and rail coaches focusable without duplicate native titles", () => {
    const html = renderToStaticMarkup(
      <>
        <StudioDockButton
          icon={Pencil}
          label="펜"
          disabled
          title="편집 잠금을 먼저 해제하세요"
          hintDescription="필압과 보정이 적용되는 자유선을 그립니다."
        />
        <StudioRailToolButton
          icon={Pencil}
          label="픽셀 펜 (P)"
          description="1픽셀 선을 그립니다."
          disabled
          unavailableReason="이미지 레이어를 먼저 선택하세요."
        />
      </>
    );
    expect(html.match(/data-studio-tool-hint-unavailable="true"/g)).toHaveLength(2);
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(html.match(/tabindex="0"/g)).toHaveLength(2);
    expect(html).toContain("min-w-11 flex-1");
    expect(html).not.toContain('title="편집 잠금을 먼저 해제하세요"');
  });

  it("renders the vertical tool rail, quick actions, and status bar", () => {
    const html = renderToStaticMarkup(
      <>
        <StudioVerticalToolRail>
          <StudioRailToolButton icon={Pencil} label="펜 (B)" active grouped />
        </StudioVerticalToolRail>
        <StudioQuickActionsBar>
          <button type="button">undo</button>
        </StudioQuickActionsBar>
        <StudioStatusBar>
          <span>100%</span>
        </StudioStatusBar>
      </>
    );
    expect(html).toContain('data-studio-tool-rail="true"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain('aria-label="펜 (B)"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-studio-quick-actions="true"');
    expect(html).toContain('data-studio-status-bar="true"');
    expect(html).toContain(
      'role="group" aria-label="캔버스 상태 및 보기" data-studio-status-bar="true"'
    );
    expect(html).not.toContain('role="status"');
    expect(html).toContain("flex-nowrap");
    expect(html).toContain("overflow-x-auto");
    expect(html).not.toContain("flex-wrap");
    expect(html).toContain("100%");
  });

  it("renders CSP/Photopea dual color well with recent swatches and swap", () => {
    const html = renderToStaticMarkup(
      <StudioDualColorWell
        primary="#c45c26"
        secondary="#2a2118"
        recent={["#c45c26", "#1a1410"]}
        onPrimaryChange={() => {}}
        onSecondaryChange={() => {}}
        onSwap={() => {}}
      />
    );
    expect(html).toContain('data-studio-dual-color-well="true"');
    expect(html).toContain('data-studio-color-stack="true"');
    expect(html).toContain('data-studio-color-swap="true"');
    expect(html).toContain('role="group"');
    expect(html).toContain("주 색 선택 · 현재 #c45c26");
    expect(html).toContain("보조 색 선택 · 현재 #2a2118");
    expect(html).toContain("최근 색 1 #c45c26 · 현재 주 색");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-keyshortcuts="X"');
    expect(html.match(/data-studio-tool-hint-target="true"/gu)).toHaveLength(3);
    expect(html).not.toContain("title=");
  });

  it("assigns distinct semantic previews to primary, secondary, and swap guidance", () => {
    expect(STUDIO_DUAL_COLOR_WELL_HINTS.primary).toMatchObject({
      preview: "color-palette",
      previewVariant: "primary-color",
    });
    expect(STUDIO_DUAL_COLOR_WELL_HINTS.secondary).toMatchObject({
      preview: "color-palette",
      previewVariant: "secondary-color",
    });
    expect(STUDIO_DUAL_COLOR_WELL_HINTS.swap).toMatchObject({
      shortcut: "X",
      preview: "color-palette",
      previewVariant: "swap-colors",
    });
  });

  it("keeps recent colors, both color inputs, and swap keyboard-operable", () => {
    const onPrimaryChange = vi.fn();
    const onSecondaryChange = vi.fn();
    const onSwap = vi.fn();
    const { container } = render(
      <StudioDualColorWell
        primary="#c45c26"
        secondary="#2a2118"
        recent={["#c45c26", "#1a1410"]}
        onPrimaryChange={onPrimaryChange}
        onSecondaryChange={onSecondaryChange}
        onSwap={onSwap}
      />
    );

    const activeRecent = screen.getByRole("button", {
      name: "최근 색 1 #c45c26 · 현재 주 색",
    });
    const nextRecent = screen.getByRole("button", {
      name: "최근 색 2 #1a1410 · 주 색으로 적용",
    });
    expect(activeRecent.getAttribute("aria-pressed")).toBe("true");
    expect(nextRecent.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(nextRecent);
    expect(onPrimaryChange).toHaveBeenCalledWith("#1a1410");

    fireEvent.change(screen.getByLabelText("주 색 선택 · 현재 #c45c26"), {
      target: { value: "#334455" },
    });
    fireEvent.change(screen.getByLabelText("보조 색 선택 · 현재 #2a2118"), {
      target: { value: "#556677" },
    });
    expect(onPrimaryChange).toHaveBeenLastCalledWith("#334455");
    expect(onSecondaryChange).toHaveBeenCalledWith("#556677");

    fireEvent.click(screen.getByRole("button", { name: "주 색과 보조 색 교체" }));
    expect(onSwap).toHaveBeenCalledOnce();
    expect(container.querySelectorAll("[title]")).toHaveLength(0);
  });

  it("renders shared kbd badge for menu/HUD shortcuts", () => {
    const html = renderToStaticMarkup(<StudioKbdBadge>⌘S</StudioKbdBadge>);
    expect(html).toContain('data-studio-kbd="true"');
    expect(html).toContain("⌘S");
  });

  it("renders Krita/Pixlr tool identity (icon-first) and Concepts/Ibis HUD pills", () => {
    const html = renderToStaticMarkup(
      <>
        <StudioToolIdentity icon={Pencil} title="펜(매끈)" detail="6px · 100%" shortcut="B" />
        <StudioHudPill accent title="배율">
          100%
        </StudioHudPill>
      </>
    );
    expect(html).toContain('data-studio-tool-identity="true"');
    expect(html).toContain('data-studio-tool-identity-icon-first="true"');
    // Title is aria/tooltip; metrics stay visible
    expect(html).toContain("펜(매끈)");
    expect(html).toContain("6px · 100%");
    expect(html).toContain("B");
    expect(html).toContain('data-studio-hud-pill="true"');
    expect(html).toContain("shrink-0");
    expect(html).toContain("whitespace-nowrap");
    expect(html).toContain("100%");
  });
});
