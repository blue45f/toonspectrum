import { createRoot } from "react-dom/client";

import { persistSession } from "../../src/compat/auth-session-state";
import { StudioReviewExport } from "../../src/domains/creator/review-export/StudioReviewExport";
import { reviewProductionFixture } from "../../src/domains/creator/review-production/studio-review-production-test-fixture";
import "../../src/styles/globals.css";

if (!import.meta.env.DEV) throw new Error("Review export fixture is development-only");
const fixture = reviewProductionFixture().verified;
const approved = { ...fixture, review: { ...fixture.review, status: "approved" as const,
  decidedAt: "2026-09-20T02:00:00.000Z", decidedBy: "actor", openRequiredCommentCount: 0 } };
persistSession({ user: { id: "actor", name: "Synthetic review owner" }, token: null });
const host = document.getElementById("test-root");
if (!host) throw new Error("Missing fixture root");
createRoot(host).render(<main className="mx-auto min-h-screen max-w-2xl space-y-4 p-4 text-fg">
  <h1 className="text-xl font-semibold">승인된 검수본 원본 저장</h1>
  <p className="text-sm text-fg-3">개발용 승인·이미지 예시입니다. 실제 저장 버튼, HTTP 검증, 해시 검사와 ZIP Worker를 실행합니다.</p>
  <StudioReviewExport verified={approved} />
  <button type="button" className="min-h-11 rounded-lg border border-line px-3" onClick={() => persistSession({ user: { id: "other" }, token: null })}>예시 계정 전환</button>
  <script id="fixture-data" type="application/json">{JSON.stringify(approved)}</script>
</main>);
