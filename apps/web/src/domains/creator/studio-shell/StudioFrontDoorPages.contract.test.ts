import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./StudioFrontDoorPages.tsx", import.meta.url),
  "utf8",
);

describe("Studio front door UX contract", () => {
  it("starts from what the user currently has instead of asking for expertise", () => {
    expect(source).toContain("지금 무엇을 가지고 있나요?");
    expect(source).toContain("아이디어만 있어요");
    expect(source).toContain("대본이나 콘티가 있어요");
    expect(source).toContain("그리던 파일이 있어요");
    expect(source).toContain("팀 프로젝트를 시작해요");
    expect(source).toContain("샘플로 먼저 둘러볼게요");
    expect(source).not.toContain("초보 모드");
    expect(source).not.toContain("전문가 모드");
  });

  it("connects every starting intent to a real product destination", () => {
    expect(source).toContain("/studio/new?kind=webtoon&template=webtoon-vertical");
    expect(source).toContain("/story-lab");
    expect(source).toContain("/studio/import");
    expect(source).toContain("/production");
    expect(source).toContain("/production/projects/sample-project/overview");
  });

  it("shows the complete project flow and save-trust language", () => {
    expect(source).toContain("<StudioTaskFlow");
    expect(source).toContain("2D·3D 제작");
    expect(source).toContain("협업");
    expect(source).toContain("검토");
    expect(source).toContain("연재");
    expect(source).toContain("<WorkflowTrustBadge state=\"device-saved\"");
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
    expect(source).not.toContain("truncate text-sm");
  });

  it("uses recoverable notices instead of passive explanatory panels", () => {
    expect(source).toContain("<RecoverableActionNotice");
    expect(source).toContain("기존 파일도 원본을 보존한 채 시작할 수 있습니다");
  });
});