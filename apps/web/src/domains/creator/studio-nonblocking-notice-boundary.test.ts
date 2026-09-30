import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const captureHostSource = readFileSync(
  new URL("./bg3d/studio-bg3d-editor-capture-host.ts", import.meta.url),
  "utf8",
);
const sceneAssistantSource = readFileSync(
  new URL("./bg3d/StudioBg3dSceneAssistantWorkspace.tsx", import.meta.url),
  "utf8",
);
const actionFooterSource = readFileSync(
  new URL("./bg3d/StudioBg3dActionFooter.tsx", import.meta.url),
  "utf8",
);
const archiveRuntimeSource = readFileSync(
  new URL("./studio-project-archive-orchestration-runtime.ts", import.meta.url),
  "utf8",
);
const archiveIntentSource = readFileSync(
  new URL("./useStudioProjectArchiveOrchestration.ts", import.meta.url),
  "utf8",
);

/** 브라우저 기본 blocking 다이얼로그(alert/confirm/prompt)가 사용자 흐름을 막지 못하도록 막는다. */
function assertNoBlockingDialogs(source: string) {
  expect(source).not.toMatch(/(?:window|globalThis)\.alert\s*\(/u);
  expect(source).not.toMatch(/(?<![\w$.])alert\s*\(/u);
}

describe("creator non-blocking notice boundary", () => {
  it("3D 소재 라이브러리 저장 흐름을 네이티브 다이얼로그로 막지 않는다", () => {
    assertNoBlockingDialogs(captureHostSource);
    // 성공 안내는 setNotice 계열 상태로, 에러는 기존 setError 패턴을 유지한다.
    expect(captureHostSource).toContain("setLibrarySaveNotice(");
    expect(captureHostSource).toContain("setError(");
    // 하드코딩 한글 대신 현재 로케일로 해소되는 i18n 카피를 사용한다.
    expect(captureHostSource).toContain("translateBilingualPair(");
    expect(captureHostSource).not.toContain("window.alert(");
    // 간편 모드와 정밀 모드 모두 성공 배너를 role="status" 로 노출한다.
    expect(sceneAssistantSource).toContain("h.librarySaveNotice");
    expect(sceneAssistantSource).toContain('role="status"');
    expect(actionFooterSource).toContain("saveNotice");
    expect(actionFooterSource).toContain('role="status"');
  });

  it("프로젝트 불러오기 흐름을 네이티브 다이얼로그로 막지 않는다", () => {
    assertNoBlockingDialogs(archiveRuntimeSource);
    assertNoBlockingDialogs(archiveIntentSource);
    // 성공/에러 모두 setProjectArchiveStatus notice 로, 기존 tone 변형(good/warn/bad)을 활용한다.
    expect(archiveRuntimeSource).toContain("setProjectArchiveStatus({");
    expect(archiveRuntimeSource).toContain('tone: "good"');
    expect(archiveRuntimeSource).toContain('tone: "bad"');
    expect(archiveRuntimeSource).toContain("translateBilingualPair(");
    // intent 컨트롤러의 도구 로드 실패도 notice 로 전환한다.
    expect(archiveIntentSource).toContain("setProjectArchiveStatus({ tone: \"bad\"");
    expect(archiveIntentSource).toContain("translateBilingualPair(");
  });
});
