import { Folder, Pencil } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  StudioAppMenubar,
  StudioDockButton,
  StudioEdgeRailButton,
  StudioMenuPopoverHeader,
  StudioMenuSubtabs,
  StudioQuickActionsBar,
  StudioRailToolButton,
  StudioStatusBar,
  StudioToolBelt,
  StudioToolbarDivider,
  StudioToolbarCluster,
  StudioVerticalToolRail,
} from "./studio-chrome-ui";

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
    expect(html).toContain("rounded-lg");
    expect(html).toContain("border-line");
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
    expect(html).toContain("min-h-9");
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

  it("keeps mobile dock targets at least 44px and marks active state", () => {
    const html = renderToStaticMarkup(
      <StudioDockButton icon={Pencil} label="펜" active />
    );
    expect(html).toContain("min-h-11");
    expect(html).toContain("bg-accent");
    expect(html).toContain("text-on-accent");
    expect(html).toContain("펜");
  });

  it("renders Magma-style vertical tool rail, quick actions, and status bar", () => {
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
    expect(html).toContain("100%");
  });
});
