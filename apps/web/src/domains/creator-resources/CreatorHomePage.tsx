import { Navigate, useLocation } from "react-router-dom";
import { StudioWorkspacePage } from "../creator/workspace/StudioWorkspacePage";
import { creatorSectionFromHash } from "../marketing/creator-home-navigation";

/** One studio home; historical introduction anchors keep their documented destination. */
export function CreatorHomePage() {
  const { hash } = useLocation();
  if (creatorSectionFromHash(hash)) return <Navigate to={{ pathname: "/about/studio", hash }} replace />;
  return <StudioWorkspacePage />;
}
