import { Navigate, useParams } from "react-router-dom";

import {
  createStudioTemplateHandoff,
  studioTemplateById,
  writeStudioTemplateHandoff,
} from "../studio-template-catalog";

function draftId(templateId: string): string {
  const random = globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 12)
    ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `template-${templateId}-${random}`.slice(0, 150);
}

/** Create a fresh document identity before entering the immersive editor. */
export function StudioTemplateStartRoute() {
  const { templateId = "" } = useParams<{ templateId: string }>();
  const template = studioTemplateById(templateId);
  if (!template) return <Navigate to="/studio/templates" replace />;

  if (typeof window !== "undefined") {
    writeStudioTemplateHandoff(
      window.localStorage,
      createStudioTemplateHandoff(template.id),
    );
  }
  const params = new URLSearchParams({
    template: template.id,
    workspace: template.recommendedWorkspace,
  });
  params.sort();
  return (
    <Navigate
      to={`/studio/draft/${encodeURIComponent(draftId(template.id))}?${params.toString()}`}
      replace
    />
  );
}
