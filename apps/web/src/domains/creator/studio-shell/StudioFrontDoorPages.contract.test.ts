import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./StudioFrontDoorPages.tsx", import.meta.url),
  "utf8",
);
const projectHome = readFileSync(
  new URL("./StudioProjectLibraryManagementPage.tsx", import.meta.url),
  "utf8",
);
const projectStartPanel = readFileSync(
  new URL("./StudioProjectStartPanel.tsx", import.meta.url),
  "utf8",
);

describe("Studio front door UX contract", () => {
  it("keeps the project library home and integrates role and task-first panels", () => {
    expect(projectHome).toContain(
      'import { StudioProjectStartPanel } from "./StudioProjectStartPanel"',
    );
    expect(projectHome).toContain(
      'import { StudioRoleWorkspacePanel } from "./StudioRoleWorkspacePanel"',
    );

    const activeViewIndex = projectHome.indexOf('{controller.view === "active" ? (');
    const rolePanelIndex = projectHome.indexOf(
      "<StudioRoleWorkspacePanel",
      activeViewIndex,
    );
    const startPanelIndex = projectHome.indexOf(
      "<StudioProjectStartPanel",
      rolePanelIndex,
    );
    const activeViewEndIndex = projectHome.indexOf(") : null}", startPanelIndex);

    expect(activeViewIndex).toBeGreaterThanOrEqual(0);
    expect(rolePanelIndex).toBeGreaterThan(activeViewIndex);
    expect(startPanelIndex).toBeGreaterThan(rolePanelIndex);
    expect(activeViewEndIndex).toBeGreaterThan(startPanelIndex);
    expect(projectStartPanel).toContain("기존 프로젝트는 아래에서 바로 이어서 작업할 수 있습니다");
  });

  it("starts from what the user currently has instead of asking for expertise", () => {
    expect(projectStartPanel).toContain("지금 무엇을 가지고 있나요?");
    expect(projectStartPanel).toContain("아이디어만 있어요");
    expect(projectStartPanel).toContain("대본이나 콘티가 있어요");
    expect(projectStartPanel).toContain("그리던 파일이 있어요");
    expect(projectStartPanel).toContain("팀 프로젝트를 시작해요");
    expect(projectStartPanel).toContain("샘플로 먼저 둘러볼게요");
    expect(projectStartPanel).not.toContain("초보 모드");
    expect(projectStartPanel).not.toContain("전문가 모드");
  });

  it("connects every starting intent to a real product destination", () => {
    expect(projectStartPanel).toContain("/studio/new?kind=webtoon&template=webtoon-vertical");
    expect(projectStartPanel).toContain("/story-lab");
    expect(projectStartPanel).toContain("/studio/import");
    expect(projectStartPanel).toContain("/production");
    expect(projectStartPanel).toContain("/production/projects/sample-project/overview");
  });

  it("shows the complete project flow and save-trust language", () => {
    expect(projectStartPanel).toContain("<StudioTaskFlow");
    expect(projectStartPanel).toContain("2D·3D 제작");
    expect(projectStartPanel).toContain("협업");
    expect(projectStartPanel).toContain("검토");
    expect(projectStartPanel).toContain("연재");
    expect(projectStartPanel).toContain("<WorkflowTrustBadge state=\"device-saved\"");
  });

  it("does not silently flatten unsupported imported objects", () => {
    expect(source).toContain("지원하지 않는 객체는 몰래 평탄화하지 않습니다");
    expect(source).toContain("완전 보존, 편집 가능한 변환, 래스터 변환과 제외 항목");
    expect(source).toContain("원본 파일을 별도로 보관합니다");
  });

  it("keeps long labels and calls to action visible on narrow screens", () => {
    expect(source).toContain("min-w-0");
    expect(source).toContain("break-words");
    expect(source).toContain("w-full min-w-0");
    expect(projectStartPanel).toContain("min-w-0");
    expect(projectStartPanel).toContain("break-words");
    expect(source).not.toContain("truncate text-sm");
  });

  it("uses recoverable notices instead of passive explanatory panels", () => {
    expect(source).toContain("<RecoverableActionNotice");
    expect(source).toContain("기존 파일도 원본을 보존한 채 시작할 수 있습니다");
  });
});