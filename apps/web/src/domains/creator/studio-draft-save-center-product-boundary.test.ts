import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const view = read("./studio-cuttoon-editor/StudioCuttoonEditorView.tsx");
const adapter = read("./StudioDraftSaveCenter.tsx");
const implementation = read("./StudioDraftSaveCenterImpl.tsx");
const center = `${adapter}\n${implementation}`;
const model = read("./studio-draft-save-center-model.ts");
const outbox = read("./studio-draft-save-outbox.ts");

describe("draft save center product boundary", () => {
  it("mounts one real save center in the editor render tree", () => {
    expect(view).toContain('import { StudioDraftSaveCenter } from "../StudioDraftSaveCenter"');
    expect(view.match(/<StudioDraftSaveCenter\b/gu)).toHaveLength(1);
    expect(view).toContain('s.studioMenubarContentHandlers.handleSave("draft")');
    expect(view).toContain("s.onContinuePendingSave()");
    expect(view).toContain("s.setCheckpointPanelOpen(true)");
    expect(view).toContain("s.studioMenubarContentHandlers.handleExportProject()");
  });

  it("wires hydration, pending intent and local recovery receipts from the live session", () => {
    expect(view).toContain("workHydrated={s.workHydrated}");
    expect(view).toContain("workHydrationFailed={s.workHydrationFailed}");
    expect(view).toContain("pendingSaveIntent={s.pendingSaveIntent}");
    expect(view).toContain("localCheckpointCount={s.checkpoints?.length ?? 0}");
    expect(view).toContain('key={s.effectiveWorkId ?? s.workId ?? "new-work"}');
  });

  it("does not introduce a second document-content or network authority", () => {
    expect(center).not.toContain("fetch(");
    expect(center).not.toContain("api.");
    expect(center).not.toContain("localStorage");
    expect(center).not.toContain("indexedDB");
    expect(center).not.toContain("navigator.locks");
    expect(center).toContain("sessionStorage");
    expect(center).toContain("onSaveDraft");
    expect(center).toContain("onContinuePendingSave");
    expect(center).toContain("onExportBackup");
    expect(center).toContain("useStudioReliabilityStatus");
  });

  it("keeps the reload outbox content-free, document-scoped and bounded", () => {
    expect(outbox).toContain("STUDIO_DRAFT_SAVE_OUTBOX_TTL_MS");
    expect(outbox).toContain("serverRevisionAtQueue");
    expect(outbox).toContain("hadServerDocumentAtQueue");
    expect(outbox).toContain("encodeURIComponent(normalized)");
    expect(outbox).toContain("parseStudioDraftSaveOutboxEntry");
    expect(outbox).not.toContain("readonly pages");
    expect(outbox).not.toContain("readonly title");
    expect(outbox).not.toContain("readonly content");
    expect(outbox).not.toContain("readonly assets");
  });

  it("retains a cleared receipt until save acknowledgement and coalesces duplicate requests", () => {
    expect(adapter).toContain("consumeRecentlyClearedStudioDraftSaveOutbox");
    expect(adapter).toContain("saveInFlightRef");
    expect(adapter).toContain("writeStudioDraftSaveOutbox");
    expect(adapter).toContain("clearStudioDraftSaveOutbox");
    expect(adapter).toContain("serverRevisionLoading");
    expect(adapter).toContain("serverRevisionError");
    expect(outbox).toContain("queueMicrotask");
    expect(outbox).toContain("cancelledSentinel");
  });

  it("keeps device recovery, server revision and offline queue semantically distinct", () => {
    expect(center).toContain("이 기기");
    expect(center).toContain("서버 초안");
    expect(center).toContain("기기 체크포인트");
    expect(center).toContain('window.addEventListener("online", onOnline)');
    expect(center).toContain("setDeferredSave(true)");
    expect(center).toContain("readStudioDraftSaveOutbox");
    expect(center).toContain("isStudioDraftSaveOutboxSatisfied");
    expect(center).toContain('autosaveDocumentLeadership?.role === "follower"');
    expect(model).toContain('phase = "local-risk"');
    expect(model).toContain('phase = "server-risk"');
    expect(model).toContain('phase = "offline"');
    expect(model).toContain('phase = "queued"');
    expect(model).toContain("서버 초안 revision");
  });

  it("blocks pre-hydration overwrite and resumes the exact pending draft intent", () => {
    expect(model).toContain('phase = "load-risk"');
    expect(model).toContain('phase = "loading"');
    expect(model).toContain('phase = "metadata-required"');
    expect(model).toContain('primaryAction: StudioDraftSavePrimaryAction');
    expect(model).toContain("빈 문서로 덮어쓰지 않고");
    expect(center).toContain('pendingSaveIntent === "draft"');
    expect(center).toContain('model.primaryAction === "metadata"');
  });

  it("keeps conflict recovery non-destructive and exposes existing version history", () => {
    expect(model).toContain("저장 충돌을 검토해 주세요");
    expect(model).toContain("actionableServerConflict");
    expect(center).toContain("버전·체크포인트");
    expect(center).toContain("자동 덮어쓰기 대신 버전 비교·복원 흐름");
    expect(center).toContain('aria-live="polite"');
    expect(center).toContain('event.key !== "Escape"');
  });
});
