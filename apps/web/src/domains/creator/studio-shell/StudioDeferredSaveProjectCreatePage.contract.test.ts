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

  it("explains why the primary action is disabled when a project name is missing", () => {
    expect(source).toContain("studio-project-title-help");
    expect(source).toContain("프로젝트 이름을 입력하면 시작할 수 있습니다");
    expect(source).toContain("aria-describedby={!titleReady ? \"studio-project-title-help\" : undefined}");
  });

  it("uses the shared device-save trust state", () => {
    expect(source).toContain("<WorkflowTrustBadge state=\"device-saved\"");
  });
});
