import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StudioVrmPoser.tsx", import.meta.url), "utf8");

describe("Studio VRM poser accessibility boundary", () => {
  it("names file, search, state, expression, joint, and color controls", () => {
    expect(source).toContain('aria-label="VRM 캐릭터 파일 선택"');
    expect(source).toContain('aria-label="캐릭터 라이브러리 검색"');
    expect(source).toContain('aria-label="포즈 검색"');
    expect(source).toContain('aria-label="저장할 3D 캐릭터 상태 이름"');
    expect(source).toContain('aria-label={`${action.label} 표정 강도`}');
    expect(source).toContain('aria-label={`${label} 앞뒤 회전`}');
    expect(source).toContain('aria-label={`${label} 뒤틀기 회전`}');
    expect(source).toContain('aria-label={`${label} 안팎 회전`}');
    expect(source).toContain('aria-label={`${entry.label} 의상 색상`}');
    expect(source).toContain("aria-label={row.label}");
  });

  it("uses visible focus styling and label ownership for webcam options", () => {
    const librarySearchLine = source
      .split("\n")
      .find((line) => line.includes('placeholder="캐릭터 이름 검색..."'));
    const librarySearchClassLine = source
      .slice(source.indexOf(librarySearchLine ?? ""))
      .split("\n")
      .find((line) => line.includes('className="'));

    expect(librarySearchClassLine).toContain("focus-visible:outline");
    expect(source).not.toMatch(/(?:^|\s)(?:focus:)?outline-none(?![^"\n]*focus-visible:outline)/u);
    expect(source).toMatch(/<label[^>]*>[\s\S]*?거울 모드 \(좌우 반전\)[\s\S]*?trackingOptions\.mirrorMode[\s\S]*?<\/label>/u);
    expect(source).toMatch(/<label[^>]*>[\s\S]*?시선 고정 \(정면 바라보기\)[\s\S]*?trackingOptions\.gazeLock[\s\S]*?<\/label>/u);
    expect(source).toMatch(/<label[^>]*>[\s\S]*?손가락 추적 \(재시작 시 적용\)[\s\S]*?trackingOptions\.fingerTracking[\s\S]*?<\/label>/u);
  });

  it("blocks photo analysis while another poser transaction owns the scene", () => {
    expect(source).toContain(
      "disabled={!vrm || webcamActive || webcamLoading || isCapturing || isSharingPose || isThumbnailCapturing || idleAnimation}",
    );
  });
});
