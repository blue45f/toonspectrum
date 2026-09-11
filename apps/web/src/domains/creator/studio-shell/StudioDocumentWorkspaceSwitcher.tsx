import { PanelsTopLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useI18n } from "@/shared/lib/i18n";

import {
  STUDIO_DOCUMENT_WORKSPACES,
  parseStudioDocumentLocation,
  studioDocumentHref,
  studioDocumentWorkspaceById,
  type StudioDocumentWorkspaceId,
} from "../studio-document-workspace";

const WORKSPACE_FAMILIES = [
  { id: "visual", ko: "그리기·이미지", en: "Drawing & image" },
  { id: "layout", ko: "디자인·발표", en: "Design & presentation" },
  { id: "story", ko: "스토리·콘티", en: "Story & storyboard" },
  { id: "spatial", ko: "3D", en: "3D" },
  { id: "time", ko: "애니메이션·오디오", en: "Animation & audio" },
  { id: "delivery", ko: "현지화·검토", en: "Localization & review" },
] as const;

function localeFromLanguage(language: string): "ko" | "en" {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

/**
 * Changes only the document workspace projection. Project/document identity, focus, language,
 * version, collaboration room and every unrelated query value remain on the canonical URL.
 */
export function StudioDocumentWorkspaceSwitcher() {
  const location = useLocation();
  const navigate = useNavigate();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const resolution = parseStudioDocumentLocation({
    pathname: location.pathname,
    search: location.search,
  });

  if (resolution.kind !== "document") return null;

  const current = studioDocumentWorkspaceById(resolution.workspace);
  const changeWorkspace = (workspace: StudioDocumentWorkspaceId) => {
    if (workspace === resolution.workspace) return;
    const nextHref = studioDocumentHref({
      projectId: resolution.projectId,
      documentId: resolution.documentId,
      draftId: resolution.draftId,
      workspace,
      focus: resolution.focus,
      language: resolution.language,
      version: resolution.version,
      search: location.search,
    });
    navigate(nextHref, { state: location.state });
  };

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-2 z-[120] w-[min(92vw,28rem)] -translate-x-1/2 print:hidden"
      data-studio-document-workspace-switcher={resolution.workspace}
    >
      <div className="pointer-events-auto flex min-h-11 items-center gap-2 rounded-2xl border border-line bg-card/95 p-1.5 shadow-lg backdrop-blur-xl">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <PanelsTopLeft size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <label htmlFor="studio-document-workspace" className="sr-only">
            {locale === "ko" ? "문서 작업공간" : "Document workspace"}
          </label>
          <select
            id="studio-document-workspace"
            aria-label={locale === "ko" ? "문서 작업공간" : "Document workspace"}
            className="min-h-8 w-full cursor-pointer rounded-xl border-0 bg-transparent px-2 text-sm font-black text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            value={resolution.workspace}
            title={locale === "ko" ? current.descriptionKo : current.descriptionEn}
            onChange={(event) => changeWorkspace(event.target.value as StudioDocumentWorkspaceId)}
          >
            {WORKSPACE_FAMILIES.map((family) => (
              <optgroup key={family.id} label={locale === "ko" ? family.ko : family.en}>
                {STUDIO_DOCUMENT_WORKSPACES
                  .filter((workspace) => workspace.family === family.id)
                  .map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {locale === "ko" ? workspace.labelKo : workspace.labelEn}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <p className="hidden truncate px-2 text-[0.62rem] font-medium text-fg-3 sm:block">
            {locale === "ko" ? current.descriptionKo : current.descriptionEn}
          </p>
        </div>
      </div>
    </div>
  );
}
