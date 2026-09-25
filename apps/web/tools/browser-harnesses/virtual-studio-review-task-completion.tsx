import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { persistSession, SessionContext } from "../../src/domains/auth/public/session/auth-session-store";
import { reviewProductionFixture } from "../../src/domains/creator/review-production/studio-review-production-test-fixture";
import { completionFixture } from "../../src/domains/creator/review-task-completion/studio-review-task-completion-fixture";
import { StudioReviewTaskCompletion } from "../../src/domains/creator/review-task-completion/StudioReviewTaskCompletion";
import "../../src/app/styles/globals.css";

// Synthetic records only. Browser acceptance intercepts all server requests. This runs the
// actual form, controller, authenticated client and response parsers, not a production work.
if (!import.meta.env.DEV) throw new Error("Review production fixture is development-only");
let fixture = reviewProductionFixture();
const completion = completionFixture();
completion.context.reference.subject = fixture.request.subject;
completion.completed.reference.subject = fixture.request.subject;
completion.completed.evidence!.receipt.reference.subject = fixture.request.subject;
fixture = { ...fixture, authority: { ...fixture.authority, workspace: { ...fixture.authority.workspace, document: { ...fixture.authority.workspace.document, tasks: fixture.authority.workspace.document.tasks.map((task) =>
  task.id === "task" ? { ...task, reviewRef: { ...fixture.request, handoffId: "handoff" } } : task) } } } };
persistSession({ user: { id: "actor", name: "Development fixture" } });
const host = document.getElementById("test-root");
if (!host) throw new Error("Missing fixture root");
function Fixture() {
  const [actor, setActor] = useState("actor");
  return <SessionContext.Provider value={{ data: { user: { id: actor }, token: null }, ready: true, status: "authenticated", update: async () => null }}>
    <BrowserRouter><main className="mx-auto min-h-screen max-w-3xl space-y-4 p-4 text-fg">
      <h1 className="text-xl font-semibold">해결된 검수 의견 → 작업 완료</h1>
      <p className="text-sm text-fg-3">개발용 예시 데이터로 실제 연결 화면과 HTTP 계약을 검증합니다. 운영 작품을 변경하지 않습니다.</p>
      <article className="rounded-xl border border-line p-4"><h2 className="font-semibold">저장된 검수 의견</h2>
        <p className="my-3">{fixture.authority.comment.body}</p>
        <StudioReviewTaskCompletion request={fixture.request} />
      </article>
      <button type="button" className="min-h-11 rounded-lg border border-line px-3" onClick={() => {
        persistSession({ user: { id: "other" } }); setActor("other");
      }}>예시 계정 전환</button>
      <script id="fixture-data" type="application/json">{JSON.stringify({ fixture, completion })}</script>
    </main></BrowserRouter>
  </SessionContext.Provider>;
}
createRoot(host).render(<Fixture />);
