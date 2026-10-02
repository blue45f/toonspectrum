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
const personalizePanels = readFileSync(
  new URL("./StudioLibraryPersonalizePanels.tsx", import.meta.url),
  "utf8",
);

describe("Studio front door UX contract", () => {
  it("keeps the project library home and integrates role and task-first panels", () => {
    // 접힌 설정 묶음은 첫 화면 경로에서 분리하되, 활성 홈에서는 항상 도달 가능해야 한다.
    expect(projectHome).toContain('import("./StudioLibraryPersonalizePanels")');
    expect(projectHome).toContain(
      '{controller.view === "active" ? <StudioLibraryPersonalizeDetails locale={controller.locale} /> : null}',
    );
    expect(personalizePanels).toContain(
      'import { StudioProjectStartPanel } from "./StudioProjectStartPanel"',
    );
    expect(personalizePanels).toContain(
      'import { StudioRoleWorkspacePanel } from "./StudioRoleWorkspacePanel"',
    );

    const rolePanelIndex = personalizePanels.indexOf("<StudioRoleWorkspacePanel");
    const startPanelIndex = personalizePanels.indexOf("<StudioProjectStartPanel", rolePanelIndex);

    expect(rolePanelIndex).toBeGreaterThanOrEqual(0);
    expect(startPanelIndex).toBeGreaterThan(rolePanelIndex);
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
    // 원본 보존 약속은 가져오기 페이지의 복구 가능 안내가 맡는다.
    expect(source).toContain("원본 파일을 별도로 보관합니다");
  });

  it("keeps a single studio home surface instead of a duplicate front-door home", () => {
    // 홈은 프로젝트 라이브러리+로비 하나로 단일화됐다. 이 파일에는 실제 라우트가 쓰는
    // 가져오기·소재 페이지만 남고, 중복 홈·새 작품 표면은 되살아나지 않는다.
    expect(source).not.toContain("export function StudioHomePage");
    expect(source).not.toContain("export function StudioNewPage");
    expect(source).toContain("export function StudioImportPage");
    expect(source).toContain("export function StudioAssetsPage");
  });
});