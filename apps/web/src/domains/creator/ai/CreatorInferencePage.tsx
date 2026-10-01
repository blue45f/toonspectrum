import { Navigate, useLocation } from "react-router-dom";

import { AI_HUB_PATH, AI_RUNTIME_ANCHOR } from "./ai-studio-hub";

/**
 * Compatibility route retained for old bookmarks. The managed inference page and
 * the personal runtime page described the same external-runtime product with
 * different terminology, so all traffic now lands on the runtime section of the AI hub.
 */
export function CreatorInferencePage() {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  search.set("source", "legacy-ai-runtime");
  return <Navigate replace to={`${AI_HUB_PATH}?${search.toString()}#${AI_RUNTIME_ANCHOR}`} />;
}
