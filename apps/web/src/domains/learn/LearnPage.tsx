import { useLocation } from "react-router-dom";

import { LearnPage as LearnContent } from "./LearnContent";
import { LearningRecordsPage } from "./LearningRecordsPage";

import "./learning-enhancements.css";

/** Public lazy entry; curriculum content and record management share the same document-local store. */
export function LearnPage() {
  const { pathname } = useLocation();
  if (pathname === "/learn/records" || pathname === "/learn/records/") {
    return <LearningRecordsPage />;
  }
  return <LearnContent />;
}
