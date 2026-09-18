import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./StudioRolePersonalizationCenter.tsx", import.meta.url),
  "utf8",
);
const projectHome = readFileSync(
  new URL("./StudioProjectLibraryManagementPage.tsx", import.meta.url),
  "utf8",
);

describe("role personalization center contract", () => {
  it("is reachable from the active Studio project home", () => {
    expect(projectHome).toContain(
      'import { StudioRolePersonalizationCenter } from "./StudioRolePersonalizationCenter"',
    );
    expect(projectHome).toContain(
      "<StudioRolePersonalizationCenter locale={controller.locale} />",
    );
  });

  it("connects onboarding, project mode, real work, privacy and AI", () => {
    expect(source).toContain("completeOnboarding");
    expect(source).toContain("프로젝트별 직무 모드");
    expect(source).toContain("rankCreatorRoleWork");
    expect(source).toContain("creatorRoleChecklist");
    expect(source).toContain("creatorRoleNotificationSettings");
    expect(source).toContain("creatorRoleAiTools");
    expect(source).toContain("saveVisibility");
    expect(source).toContain("roleWorkspace");
  });

  it("does not start protected role-workspace sync for signed-out Studio visitors", () => {
    expect(source).toContain('const workspaceSyncEnabled = status === "authenticated";');
    expect(source.match(/workspaceSyncEnabled,/gu)).toHaveLength(2);
  });

  it("keeps recommendations advisory and permissions separate", () => {
    expect(source).toContain("recommendCreatorTeamRoles");
    expect(source).toContain("자동 배정하거나 접근 권한을 바꾸지 않습니다");
    expect(source).toContain("팀 접근 권한과 승인 권한은 변경하지 않습니다");
  });
});
