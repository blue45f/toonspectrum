import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { persistSession, SessionContext } from "../../src/compat/auth-session-store";
import { EMPTY_STUDIO_REVIEW_CAPTURE } from "../../src/domains/creator/review-capture/studio-review-capture-bridge";
import { StudioReviewCaptureDialog } from "../../src/domains/creator/review-capture/StudioReviewCaptureDialog";
import { studioReviewResolutionRequestFromLocation } from "../../src/domains/creator/review-resolution/studio-review-resolution-route";
import { reviewResolutionFixture } from "../../src/domains/creator/review-resolution/studio-review-resolution-test-fixture";
import { StudioPinnedReviewPanel } from "../../src/domains/creator/virtual-space/StudioPinnedReviewPanel";
import "../../src/styles/globals.css";

// Synthetic HTTP records only. No real capture, work, login, server receipt or approval
// is produced here. Actual dialog, route parser, panel, comparison and clients are used.
if (!import.meta.env.DEV) throw new Error("Review resolution fixture is development-only");
const fixture = reviewResolutionFixture();
persistSession({ user: { id: "actor", name: "Development fixture" } });
const host = document.getElementById("test-root");
if (!host) throw new Error("Missing fixture root");
function Fixture() {
  const [actor, setActor] = useState("actor"), [showCapture, setShowCapture] = useState(true);
  const request = studioReviewResolutionRequestFromLocation("work", location.search);
  return <SessionContext.Provider value={{ data: { user: { id: actor }, token: null }, ready: true, status: "authenticated", update: async () => null }}>
    <BrowserRouter><main className="mx-auto min-h-screen max-w-3xl space-y-4 p-4 text-fg">
      <h1 className="text-xl font-semibold">수정 검수본 → 원래 의견 확인</h1>
      <p className="text-sm text-fg-3">개발용 예시 데이터 · 실제 화면과 HTTP 계약 검증. 운영 작품이나 승인을 변경하지 않습니다.</p>
      {request ? <StudioPinnedReviewPanel subject={request.origin.subject} resolutionRequest={request} />
        : <StudioReviewCaptureDialog open={showCapture} origin={{ actorId: "actor", workId: "work", request: fixture.request.origin }}
          snapshot={{ ...EMPTY_STUDIO_REVIEW_CAPTURE, phase: "completed", subject: fixture.request.replacement }}
          onSave={() => undefined} onRetry={() => undefined} onClose={() => setShowCapture(false)} />}
      <button type="button" className="min-h-11 rounded-lg border border-line px-3" onClick={() => {
        persistSession({ user: { id: "other" } }); setActor("other");
      }}>예시 계정 전환</button>
      <script id="fixture-data" type="application/json">{JSON.stringify(fixture)}</script>
    </main></BrowserRouter>
  </SessionContext.Provider>;
}
createRoot(host).render(<Fixture />);
