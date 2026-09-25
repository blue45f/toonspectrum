import { useState } from "react";
import { createRoot } from "react-dom/client";

import { persistSession } from "../../src/domains/auth/public/session/auth-session-state";
import { SessionContext } from "../../src/domains/auth/public/session/auth-session-store";
import { createEmptyProductionWorkspace, type ProductionWorkspace } from "../../src/domains/creator/studio-production/studio-production-workspace-runtime";
import { StudioProductionTaskBoard } from "../../src/domains/creator/studio-production/StudioProductionTaskBoard";
import { StudioReviewDraftShelf } from "../../src/domains/creator/virtual-space/StudioReviewDraftShelf";
import "../../src/app/styles/globals.css";

// Dev-only synthetic identity. The browser verifier blocks every API request.
// This exercises the actual component and SQLite/OPFS storage, not server authentication.
persistSession({ user: { id: "fixture-artist" }, token: null });
function Fixture() {
  const [workspace, setWorkspace] = useState<ProductionWorkspace>(() => ({ ...createEmptyProductionWorkspace("work:blueprint-fixture", "2026-09-21T00:00:00Z"), tasks: [
    { id: "task-a", title: "선화 테스트", owner: "테스트 작가", due: "2026-09-21", status: "doing", progress: 20, stage: "lineart" },
    { id: "task-b", title: "식자 테스트", owner: "테스트 식자", due: "2026-09-22", status: "todo", progress: 0, stage: "lettering", dependencyIds: ["task-a"] },
  ] }));
  const [body, setBody] = useState(""), [busy, setBusy] = useState(false), [saved, setSaved] = useState(0);
  return <main className="mx-auto max-w-5xl space-y-5 p-4 text-fg">
    <h1 className="text-xl font-bold">제작·개인 검수 초안 실동작 확인</h1>
    <p className="text-xs">합성 원고와 기기 저장소 테스트입니다. 운영 로그인·승인·서버 저장을 대신하지 않습니다.</p>
    <button type="button" className="min-h-11 rounded-lg border px-3" onClick={() => setWorkspace((current) => ({ ...current, revision: current.revision + 1, tasks: current.tasks.map((task) => task.id === "task-a" ? { ...task, owner: "원격 변경 담당자" } : task) }))}>동시 변경 재현</button>
    <StudioProductionTaskBoard workspace={workspace} canEdit canApprove={false} canPublish={false} onCommit={async (update) => { setWorkspace((current) => update(current)); }} />
    <section className="rounded-xl border border-line p-4" aria-label="개인 초안 테스트">
      <label className="text-sm">테스트 의견<textarea className="mt-2 block w-full rounded-lg border border-line bg-panel p-3" value={body} disabled={busy} onChange={(event) => setBody(event.target.value)} /></label>
      <p className="text-xs" data-local-draft-confirmation={saved}>기기 저장 확인 {saved}</p>
      <StudioReviewDraftShelf scope={{ actorId: "fixture-artist", subject: { schemaVersion: 1, workId: "work-fixture", projectId: "graph-fixture", artifactId: "artifact-fixture", reviewId: "review-fixture", revisionId: "revision-fixture", rootGraphHash: "a".repeat(64) } }}
        compose={body.trim() ? { body, severity: "note", assigneeIds: [], anchor: { kind: "artifact", artifactId: "artifact-fixture", revisionId: "revision-fixture", scope: { projectId: "graph-fixture" } } } : null}
        disabled={busy} onBusy={setBusy} onStored={() => { setBody(""); setSaved((value) => value + 1); }} onPublished={() => { throw new Error("Publication is not part of this local-storage fixture"); }} />
    </section>
  </main>;
}
const host = document.getElementById("root");
if (!host) throw new Error("Fixture root is missing");
createRoot(host).render(<SessionContext.Provider value={{ data: { user: { id: "fixture-artist", name: "Fixture", email: null, image: null, role: "creator" }, token: null }, ready: true, status: "authenticated", update: async () => null }}><Fixture /></SessionContext.Provider>);
