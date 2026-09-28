// 테스트 전용 진입점. 운영 빌드에 포함하지 않으며 모든 API는 Playwright가 차단·대체한다.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { AdminMemberTestAccountPanel } from "../apps/web/src/domains/admin/AdminMembersPage";
import { FanPostReplySection } from "../apps/web/src/domains/community/components/fan-cafe-reply-section";
import { ReviewReplies } from "../apps/web/src/domains/community/components/review-replies";
import { useApp } from "../apps/web/src/shared/lib/store";
import "../apps/web/src/app/styles/globals.css";

useApp.getState().setSessionIdentity("member-a", null);
function Harness() {
  const userId = useApp((state) => state.userId);
  const [flag, setFlag] = useState(false);
  const operator = new URLSearchParams(location.search).get("viewer") === "operator";
  return <main className="mx-auto max-w-4xl space-y-8 p-4">
    <h1 className="text-xl font-bold">커뮤니티 검증 · 합성 데이터</h1>
    <p className="text-sm text-fg-2">운영 계정 생성·게시글 저장 없이 브라우저 동작을 확인하는 화면입니다.</p>
    <button className="min-h-11 rounded-lg border border-line px-4" onClick={() => useApp.getState().setSessionIdentity(userId === "member-a" ? "member-b" : "member-a", null)}>검증 계정 전환</button>
    <section aria-label="팬카페 댓글 검증"><h2 className="mb-3 text-lg font-semibold">팬카페 댓글</h2><FanPostReplySection postId="fixture-post" /></section>
    <section aria-label="리뷰 답글 검증"><h2 className="mb-3 text-lg font-semibold">리뷰 답글</h2><ReviewReplies reviewId="fixture-review" /></section>
    <AdminMemberTestAccountPanel actorId="fixture-admin" targetId="member-a" targetName="검증 작성자" value={flag} canManage={!operator}
      onUpdated={(_id, value) => setFlag(value)} />
  </main>;
}
const root = document.getElementById("root");
if (!root) throw new Error("커뮤니티 검증 화면의 마운트 위치를 찾지 못했습니다.");
createRoot(root).render(<BrowserRouter><Harness /></BrowserRouter>);
