import { Navigate, useLocation } from "react-router-dom";

/**
 * Compatibility route retained for old bookmarks. The managed inference page and
 * the personal runtime page described the same external-runtime product with
 * different terminology, so all traffic now enters one Developer Preview.
 */
export function CreatorInferencePage() {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  search.set("source", "legacy-ai-runtime");
  return <Navigate replace to={`/studio/ai-lab?${search.toString()}`} />;
}
