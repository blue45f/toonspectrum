import { useState } from "react";
import { createRoot } from "react-dom/client";

import { persistSession } from "../../src/domains/auth/public/session/auth-session-state";
import { StudioReviewExport } from "../../src/domains/creator/review-export/StudioReviewExport";
import { reviewProductionFixture } from "../../src/domains/creator/review-production/studio-review-production-test-fixture";
import "../../src/app/styles/globals.css";

if (!import.meta.env.DEV) throw new Error("Review export fixture is development-only");
const fixture = reviewProductionFixture().verified;
const approved = {
  ...fixture,
  review: {
    ...fixture.review,
    status: "approved" as const,
    decidedAt: "2026-09-20T02:00:00.000Z",
    decidedBy: "actor",
    openRequiredCommentCount: 0,
  },
};
const initialActor = new URLSearchParams(location.search).get("actor") === "other" ? "other" : "actor";
persistSession({ user: { id: initialActor, name: initialActor === "actor" ? "Synthetic review owner" : "Synthetic delivery recipient" }, token: null });
const host = document.getElementById("test-root");
if (!host) throw new Error("Missing fixture root");

function Harness() {
  const [actor, setActor] = useState(initialActor);
  const switchActor = () => {
    const next = actor === "actor" ? "other" : "actor";
    persistSession({ user: { id: next, name: next === "actor" ? "Synthetic review owner" : "Synthetic delivery recipient" }, token: null });
    setActor(next);
  };
  return <main className="mx-auto min-h-screen max-w-2xl space-y-4 p-4 text-fg" data-fixture-actor={actor}>
    <h1 className="text-xl font-semibold">승인된 검수본 원본 저장</h1>
    <p className="text-sm text-fg-3">개발용 승인·이미지 예시입니다. 실제 저장 버튼, HTTP 검증, 해시 검사와 ZIP Worker를 실행합니다.</p>
    <p role="status" className="text-sm">현재 예시 계정: {actor}</p>
    <StudioReviewExport verified={approved} />
    <button type="button" className="min-h-11 rounded-lg border border-line px-3" onClick={switchActor}>예시 계정 전환</button>
    <script id="fixture-data" type="application/json">{JSON.stringify(approved)}</script>
  </main>;
}

createRoot(host).render(<Harness />);
