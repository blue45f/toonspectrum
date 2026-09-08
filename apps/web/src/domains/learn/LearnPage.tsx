import { Link, useLocation } from "react-router-dom";

import { LearnPage as LearnContent } from "./LearnContent";
import { LearningHome, LearningPathPage } from "./LearningHome";
import { LearningRecordsPage } from "./LearningRecordsPage";

import "./learning-enhancements.css";

function LearningRecordShortcut() {
  return (
    <aside className="learn-record-shortcut" lang="ko" aria-label="학습 기록 관리">
      <Link to="/learn/records">내 학습 기록 · 백업 / 복원 →</Link>
    </aside>
  );
}

/** Public lazy entry; the enhanced home and legacy lesson routes share the same document-local store. */
export function LearnPage() {
  const { pathname } = useLocation();
  if (pathname === "/learn/records" || pathname === "/learn/records/") {
    return <LearningRecordsPage />;
  }

  const isHome = pathname === "/learn" || pathname === "/learn/";
  const pathMatch = pathname.match(/^\/learn\/paths\/([^/]+)\/?$/u);
  return (
    <>
      <LearningRecordShortcut />
      {isHome ? <LearningHome /> : pathMatch ? <LearningPathPage pathId={pathMatch[1]} /> : <LearnContent />}
    </>
  );
}
