import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./StudioDeferredSaveProjectCreatePage.tsx", import.meta.url),
  "utf8",
);

describe("Studio project start UX contract", () => {
  it("presents ToonStudio storage as the default and external drives as optional", () => {
    expect(source).toContain("ToonStudio 클라우드");
    expect(source).toContain("가져오기·백업 옵션");
    expect(source).toContain("외부 드라이브는 가져오기·백업 옵션");
    expect(source).not.toContain("저장 버튼을 처음 누르면 파일·Google Drive·Dropbox·OneDrive 중에서 고릅니다");
  });

  it("keeps the project start as a visible three-step flow", () => {
    expect(source).toContain("<StudioTaskFlow");
    expect(source).toContain("만들 작업 선택");
    expect(source).toContain("이름과 시작 형식");
    expect(source).toContain("자동 저장하며 시작");
  });

  it("explains why the primary action is disabled when a project name is missing", () => {
    expect(source).toContain("<DisabledReason id=\"studio-create-disabled-reason\"");
    expect(source).toContain("프로젝트 이름을 입력하면 시작할 수 있습니다");
    expect(source).toContain("aria-describedby={!titleReady ? \"studio-project-title-help studio-create-disabled-reason\" : undefined}");
  });

  it("preserves the current input and exposes a retry path after a creation error", () => {
    expect(source).toContain("<RecoverableActionNotice");
    expect(source).toContain("입력한 이름과 시작 형식은 그대로 유지되어 있습니다");
    expect(source).toContain("다시 시도");
  });

  it("summarizes the selected outcome before starting", () => {
    expect(source).toContain("<StudioTaskSummary");
    expect(source).toContain("시작할 작업");
    expect(source).toContain("selectedTemplateLabel");
  });

  it("uses the shared device-save trust state", () => {
    expect(source).toContain("<WorkflowTrustBadge state=\"device-saved\"");
  });

  it("guards narrow layouts from clipping long labels and actions", () => {
    expect(source).toContain("min-w-0");
    expect(source).toContain("break-words");
    expect(source).toContain("w-full min-w-0 sm:min-w-44 sm:w-auto");
  });
});