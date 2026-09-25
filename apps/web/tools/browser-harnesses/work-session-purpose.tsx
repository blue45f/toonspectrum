import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";

import { studioWorkSessionApi } from "../../src/domains/creator/work-session/studio-work-session-client";
import { StudioWorkSessionController } from "../../src/domains/creator/work-session/studio-work-session-controller";
import { StudioSessionWorkflowPanel } from "../../src/domains/creator/work-session/StudioSessionWorkflowPanel";

import type { StudioSessionPreviewRequest } from "../../src/domains/creator/work-session/StudioWorkSessionPreview";
import "../../src/app/styles/globals.css";

declare global { interface Window { __STUDIO_PURPOSE_TEST__: { workId: string; sessionId: string; actorId: string } } }
function Fixture() {
  const fixture = window.__STUDIO_PURPOSE_TEST__;
  const [inspection, setInspection] = useState<StudioSessionPreviewRequest | null>(null);
  const controller = useMemo(() => new StudioWorkSessionController(fixture.workId, fixture.actorId, studioWorkSessionApi,
    sessionStorage, () => document.visibilityState !== "hidden"), [fixture.workId, fixture.actorId]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    controller.select(fixture.sessionId);
    const refresh = setInterval(() => { void controller.refresh(); }, 10000);
    return () => { clearInterval(refresh); controller.dispose(); };
  }, [controller, fixture.sessionId]);
  return <main className="mx-auto max-w-5xl space-y-4 p-3 text-fg">
    <h1 className="text-xl font-bold">작업 세션 · 테스트 데이터베이스 연결</h1>
    <p className="text-xs">실제 repository와 격리된 PostgreSQL로 기록합니다. 사용자 신원과 이미지 저장소는 테스트 fixture이며 운영 로그인이 아닙니다.</p>
    <button className="min-h-11 rounded border border-line px-3" type="button" onClick={() => { void controller.refresh(); }}>서버 기록 다시 읽기</button>
    <p role="status">{state.phase} {state.reason}</p>
    {state.view ? <StudioSessionWorkflowPanel view={state.view} actorId={fixture.actorId} controller={controller}
      busy={state.phase !== "ready" || state.pending} saving={state.phase === "saving" || state.pending}
      name={(id) => id === fixture.actorId ? "나" : "다른 참여자"} onInspect={setInspection} /> : null}
    {inspection ? <output aria-label="명시적으로 선택한 원본">{inspection.source.pageId} {inspection.source.frameId}</output> : null}
  </main>;
}
const root = document.getElementById("root"); if (!root || !window.__STUDIO_PURPOSE_TEST__) throw new Error("Missing isolated test bootstrap");
createRoot(root).render(<Fixture />);
