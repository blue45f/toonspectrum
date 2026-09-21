import { createStudioWorkSession } from "@toonspectrum/studio-project-model/work-session";
import { useState } from "react";
import { createRoot } from "react-dom/client";

import { StudioSessionClosingDraft } from "../../src/domains/creator/work-session/StudioSessionClosingDraft";
import { StudioWorkSessionEntry } from "../../src/domains/creator/work-session/StudioWorkSessionEntry";
import "../../src/styles/globals.css";

const original = createStudioWorkSession({ id: "fixture-session", operationId: "fixture-create", title: "리딩 마무리", purpose: "첫 장면 시선 검토", kind: "reading",
  input: { schemaVersion: 1, workId: "fixture-work", projectId: "fixture-project", artifactId: "fixture-artifact", reviewId: "fixture-review", revisionId: "fixture-pin", rootGraphHash: "a".repeat(64) }, invitedUserIds: [] },
{ userId: "fixture-host", canEdit: true, canComment: true }, "2026-09-21T00:00:00.000Z");
function Fixture() {
  const [session, setSession] = useState(original), [summary, setSummary] = useState("");
  const [applied, setApplied] = useState(0), [workId, setWorkId] = useState("fixture-work-a");
  return <main className="mx-auto max-w-4xl space-y-4 p-4 text-fg">
    <h1 className="text-xl font-bold">작업 세션 복구·종료 초안</h1>
    <p className="text-sm">로컬 UI fixture입니다. 서버 데이터·사용자 신원·승인을 만들지 않습니다.</p>
    <StudioWorkSessionEntry workId={workId} />
    <button className="min-h-11 rounded border border-line px-3" onClick={() => setWorkId(workId === "fixture-work-a" ? "fixture-work-b" : "fixture-work-a")}>다른 작품</button>
    <StudioSessionClosingDraft session={session} currentSummary={summary} busy={false} onApply={(text) => { setSummary(text); setApplied((n) => n + 1); }} />
    <label className="block text-sm">종료 입력<textarea className="mt-1 min-h-32 w-full rounded-lg border border-line bg-card p-2" value={summary} onChange={(event) => setSummary(event.target.value)} /></label>
    <button className="min-h-11 rounded border border-line px-3" onClick={() => setSession({ ...session, version: session.version + 1 })}>다른 참여자 기록 수신</button>
    <output className="block" aria-label="로컬 초안 적용 횟수">{applied}</output>
  </main>;
}
const root = document.getElementById("root"); if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<Fixture />);
