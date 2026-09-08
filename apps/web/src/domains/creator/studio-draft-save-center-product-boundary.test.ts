import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const view = read("./studio-cuttoon-editor/StudioCuttoonEditorView.tsx");
const center = read("./StudioDraftSaveCenter.tsx");
const model = read("./studio-draft-save-center-model.ts");

describe("draft save center product boundary", () => {
  it("mounts one real save center in the editor render tree", () => {
    expect(view).toContain('import { StudioDraftSaveCenter } from "../StudioDraftSaveCenter"');
    expect(view.match(/<StudioDraftSaveCenter\b/gu)).toHaveLength(1);
    expect(view).toContain('s.studioMenubarContentHandlers.handleSave("draft")');
    expect(view).toContain("s.setCheckpointPanelOpen(true)");
    expect(view).toContain("s.studioMenubarContentHandlers.handleExportProject()");
  });

  it("does not introduce a second network or persistence authority", () => {
    expect(center).not.toContain("fetch(");
    expect(center).not.toContain("api.");
    expect(center).not.toContain("localStorage");
    expect(center).not.toContain("indexedDB");
    expect(center).not.toContain("navigator.locks");
    expect(center).toContain("onSaveDraft");
    expect(center).toContain("onExportBackup");
    expect(center).toContain("useStudioReliabilityStatus");
  });

  it("keeps device recovery, server revision and offline queue semantically distinct", () => {
    expect(center).toContain("이 기기");
    expect(center).toContain("서버 초안");
    expect(center).toContain('window.addEventListener("online", onOnline)');
    expect(center).toContain("setDeferredSave(true)");
    expect(model).toContain('phase = "local-risk"');
    expect(model).toContain('phase = "server-risk"');
    expect(model).toContain('phase = "offline"');
    expect(model).toContain('phase = "queued"');
    expect(model).toContain("서버 초안 revision");
  });

  it("keeps conflict recovery non-destructive and exposes existing version history", () => {
    expect(model).toContain("저장 충돌을 검토해 주세요");
    expect(center).toContain("버전·체크포인트");
    expect(center).toContain("자동 덮어쓰기 대신 기존 버전 비교·복원 흐름");
    expect(center).toContain('aria-live="polite"');
    expect(center).toContain('event.key !== "Escape"');
  });
});
