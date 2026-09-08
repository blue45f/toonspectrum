import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioWorkspaceInterchangeDialog } from "./StudioWorkspaceInterchangeDialog";
import { DEFAULT_STUDIO_WORKSPACE_STATE } from "./studio-workspaces";

const persisted = { status: "persisted", failure: null } as const;

function renderDialog(
  initialOpen = true,
  persistence: {
    status: "persisted" | "session-only";
    failure: null | "write-failed";
  } = persisted,
): string {
  return renderToStaticMarkup(
    <StudioWorkspaceInterchangeDialog
      initialOpen={initialOpen}
      state={DEFAULT_STUDIO_WORKSPACE_STATE}
      liveLayout={DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout}
      persistence={persistence}
      onStateChange={() => persistence}
      onApplyLayout={() => undefined}
    />,
  );
}

describe("StudioWorkspaceInterchangeDialog", () => {
  it("renders an accessible review-first export surface", () => {
    const html = renderDialog();

    expect(html).toContain('data-testid="studio-workspace-interchange-dialog"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('data-studio-shortcut-boundary="true"');
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("작업공간 가져오기·내보내기");
    expect(html).toContain("현재 배치만");
    expect(html).toContain("저장본 모두");
    expect(html).toContain("JSON 파일 다운로드");
    expect(html).toContain("JSON 복사");
    expect(html).toContain("작품, 프로젝트, 계정, AI 설정은 포함하지 않습니다.");
    expect(html).toContain("JSON은 64KB로 제한됩니다.");
    expect(html).toContain("기기 저장");
  });

  it("stays mounted but hidden until the intent trigger opens it", () => {
    const html = renderDialog(false, {
      status: "session-only",
      failure: "write-failed",
    });

    expect(html).toContain('data-testid="studio-workspace-interchange-dialog"');
    expect(html.match(/hidden=""/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("세션 전용");
  });

  it("uses one bounded preview-before-commit path for files and clipboard JSON", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./StudioWorkspaceInterchangeDialog.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain('accept=".json,application/json"');
    expect(source).toContain("file.size > STUDIO_WORKSPACE_INTERCHANGE_MAX_BYTES");
    expect(source).toContain("navigator.clipboard?.readText");
    expect(source).toContain("decodeStudioWorkspaceInterchange(text)");
    expect(source).toContain("planStudioWorkspaceInterchangeForState(");
    expect(source).toContain("applyStudioWorkspaceInterchangePlanToState(");
    expect(source).toContain("includeQuickAccess: false");
    expect(source).not.toContain("useMemo");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });

  it("makes destructive apply and ownership changes explicit", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./StudioWorkspaceInterchangeDialog.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain('dirty && importAction === "add-and-apply"');
    expect(source).toContain("requiresDiscardConfirmation && !discardConfirmed");
    expect(source).toContain("현재 저장 전 배치 변경을 버리고 바로 적용");
    expect(source).toContain('saveResult.failure === "owner-mismatch"');
    expect(source).toContain("가져오기는 저장했지만 화면 전환에 실패했습니다.");
    expect(source).toContain("기기별 오버라이드는 교체 대상에는 유지");
    expect(source).toContain("별도 빠른 액세스 세트는 전역 저장 영역이라 건너뜁니다.");
  });

  it("contains keyboard tab navigation, focus trapping, and focus restoration", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./StudioWorkspaceInterchangeDialog.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("trapFocus(event, dialogRef.current)");
    expect(source).toContain("onKeyDownCapture={handleDialogKeyDown}");
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain('event.key === "ArrowRight"');
    expect(source).toContain('event.key === "ArrowLeft"');
    expect(source).toContain('event.key === "Home"');
    expect(source).toContain('event.key === "End"');
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain("previousFocus?.focus({ preventScroll: true })");
  });
});
