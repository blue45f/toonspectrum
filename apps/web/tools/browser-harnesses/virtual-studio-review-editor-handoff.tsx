import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { persistSession } from "../../src/domains/auth/public/session/auth-session-state";
import { studioReviewEditorHref } from "../../src/domains/creator/review-handoff/studio-review-editor-route";
import { reviewEditorFixture } from "../../src/domains/creator/review-handoff/studio-review-editor-test-fixture";
import { StudioReviewEditorHandoffMount } from "../../src/domains/creator/review-handoff/StudioReviewEditorHandoffMount";
import { selectStudioEditorCommentTarget, type StudioEditorCommentSelection } from "../../src/domains/creator/studio-comment-editor-selection";
import { useStudioMutationAuthorityRuntime } from "../../src/domains/creator/studio-cuttoon-editor/runtime/useStudioMutationAuthorityRuntime";
import { studioReviewCaptureContentDigest } from "../../src/domains/creator/virtual-space/studio-virtual-space-review-producer";
import "../../src/app/styles/globals.css";

// Development-only synthetic document. Real Host authority/projection/selection adapters and
// HTTP parsers run here, but this is not the full Konva editor or a production-authenticated work.
if (!import.meta.env.DEV) throw new Error("Review handoff fixture is development-only");
const seed = reviewEditorFixture(() => "a".repeat(64));
const digest = await studioReviewCaptureContentDigest(seed.saved.document.doc);
const fixture = reviewEditorFixture(() => digest);
persistSession({ user: { id: "actor", name: "Development fixture" } });
const host = document.getElementById("test-root");
if (!host) throw new Error("Missing fixture root");

function Fixture() {
  const authority = useStudioMutationAuthorityRuntime({ collaborationDocumentLocked: false,
    remixId: null, reportError: () => {}, studioAuthUserId: "actor", workId: "work" });
  const [pageId, setPageId] = useState("p1"), pageIdRef = useRef("p1");
  const [selection, setSelection] = useState<StudioEditorCommentSelection | null>(null);
  const [dirty, setDirty] = useState(false), rejectPage = useRef(false);
  const drawingRef = useRef<unknown>(null), pendingStrokeCommitsRef = useRef<unknown>(null);
  const bindings = { ...authority, studioAuthUserId: "actor", workId: "work", available: true,
    drawingRef, pendingStrokeCommitsRef, getSnapshot: () => fixture.snapshot,
    canvasWidth: 800, isDurableMask: () => false,
    save: async () => { throw new Error("Handoff must never save"); },
    captureAll: async () => { throw new Error("Handoff must never capture"); },
  };
  return <main className="mx-auto min-h-screen max-w-3xl space-y-4 p-4 pb-52 text-fg">
    <h1 className="text-xl font-semibold">검수 의견 위치 · 개발용 HTTP fixture</h1>
    <p className="text-sm text-fg-3">예시 원고와 실제 선택 어댑터를 검증합니다. 전체 편집기나 운영 서버의 검증은 아닙니다.</p>
    <p id="page-state">현재 페이지: {pageId}</p>
    <output id="selection-state">{JSON.stringify(selection)}</output>
    <output id="document-generation">{authority.captureStudioMutationTicket().documentGeneration}</output>
    <div className="flex flex-wrap gap-3">
      <button type="button" className="min-h-11 rounded-lg border px-3" onClick={() => {
        fixture.snapshot.title = "Unsaved local change"; authority.markStudioDocumentChanged(); setDirty(true);
      }}>로컬 수정</button>
      <button type="button" className="min-h-11 rounded-lg border px-3" onClick={() => { rejectPage.current = true; }}>페이지 이동 거부</button>
      <button type="button" className="min-h-11 rounded-lg border px-3" onClick={() => { pendingStrokeCommitsRef.current = {}; }}>획 저장 대기</button>
    </div>
    {dirty && <p>저장되지 않은 변경</p>}
    <div className="rounded-xl border p-5" data-selected={selection?.elementId ?? ""}>
      <p>예시 페이지 {pageId === "p1" ? "1" : "2"}</p>
      {pageId === "p2" && <div className="mt-3 rounded-lg border-2 p-8" style={{ borderColor: selection?.elementId === "cut-2" ? "#b766e1" : "#888" }}>두 번째 페이지의 컷</div>}
    </div>
    <script id="fixture-data" type="application/json">{JSON.stringify({ request: fixture.request, authority: fixture.authority, saved: fixture.saved })}</script>
    <StudioReviewEditorHandoffMount bindings={bindings} navigation={{
      search: studioReviewEditorHref(fixture.request).split("?")[1]!,
      getCurrentPageId: () => pageIdRef.current, hasActivePointer: () => false,
      select: (target, current) => selectStudioEditorCommentTarget(target, {
        getPages: () => fixture.snapshot.pagesList, getMasterElements: () => fixture.snapshot.master?.elements ?? [],
        getCurrentPageId: () => pageIdRef.current,
        changePage: (id) => {
          if (rejectPage.current) return false;
          // Same accepted Host page command semantics: synchronous ref, then React state;
          // a view change does not call markStudioDocumentChanged.
          pageIdRef.current = id; fixture.snapshot.currentPageId = id; setPageId(id); return true;
        },
        applySelection: setSelection, onMissing: () => {},
      }, current),
    }} />
  </main>;
}
createRoot(host).render(<Fixture />);
