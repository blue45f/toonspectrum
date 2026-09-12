import { CheckCircle2, LayoutTemplate, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  STUDIO_TEMPLATE_HANDOFF_KEY,
  defaultStudioTemplateValues,
  readStudioTemplateHandoff,
  studioTemplateById,
} from "../studio-template-catalog";
import { updateStudioProjectFeatureSuite } from "../studio-project-feature-suite-store";
import { buttonClass } from "@/shared/components/ui/button-utils";

const STUDIO_TEMPLATE_APPLIED_EVENT = "toonspectrum:studio-template-applied";

function currentProjectIdentity(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const studioIndex = segments.indexOf("studio");
  if (studioIndex < 0) return "draft";
  const scope = segments[studioIndex + 1];
  const identity = segments[studioIndex + 2];
  if ((scope === "work" || scope === "draft") && identity) {
    try {
      return decodeURIComponent(identity);
    } catch {
      return identity;
    }
  }
  return "draft";
}

function appliedStoryBeats(templateId: string) {
  if (templateId === "webtoon-four-panel") {
    return [
      {
        id: "beat:template:setup",
        sceneId: "scene:template:four-panel",
        order: 0,
        kind: "setup" as const,
        summary: "상황과 인물을 빠르게 소개합니다.",
        dialogue: "",
        characterIds: ["character:lead"],
        locationId: "location:opening",
      },
      {
        id: "beat:template:development",
        sceneId: "scene:template:four-panel",
        order: 1,
        kind: "action" as const,
        summary: "문제가 커지거나 기대를 만듭니다.",
        dialogue: "",
        characterIds: ["character:lead"],
        locationId: "location:opening",
      },
      {
        id: "beat:template:twist",
        sceneId: "scene:template:four-panel",
        order: 2,
        kind: "reveal" as const,
        summary: "예상하지 못한 정보나 반전을 보여 줍니다.",
        dialogue: "",
        characterIds: ["character:lead"],
        locationId: "location:opening",
      },
      {
        id: "beat:template:payoff",
        sceneId: "scene:template:four-panel",
        order: 3,
        kind: "reaction" as const,
        summary: "마지막 반응이나 결론으로 마무리합니다.",
        dialogue: "",
        characterIds: ["character:lead"],
        locationId: "location:opening",
      },
    ];
  }
  if (templateId === "storyboard-animatic") {
    return [
      {
        id: "beat:template:opening",
        sceneId: "scene:template:opening",
        order: 0,
        kind: "setup" as const,
        summary: "공간과 주요 인물을 보여 주는 첫 장면",
        dialogue: "",
        characterIds: ["character:lead"],
        locationId: "location:opening",
      },
      {
        id: "beat:template:action",
        sceneId: "scene:template:action",
        order: 1,
        kind: "action" as const,
        summary: "핵심 행동과 카메라 이동을 계획하는 장면",
        dialogue: "",
        characterIds: ["character:lead"],
        locationId: "location:opening",
      },
      {
        id: "beat:template:closing",
        sceneId: "scene:template:closing",
        order: 2,
        kind: "transition" as const,
        summary: "다음 시퀀스로 이어지는 마무리 장면",
        dialogue: "",
        characterIds: [],
        locationId: "location:opening",
      },
    ];
  }
  return null;
}

/**
 * Consumes a short-lived template handoff only in the new document runtime. The host updates the
 * project feature suite and emits one semantic event so canvas-specific adapters can add their own
 * layer structure without introducing another template authority.
 */
export function StudioTemplateHandoffHost() {
  const [appliedTitle, setAppliedTitle] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const handoff = useMemo(() => {
    if (typeof window === "undefined") return null;
    return readStudioTemplateHandoff(window.localStorage);
  }, []);

  useEffect(() => {
    if (!handoff || typeof window === "undefined") return;
    const template = studioTemplateById(handoff.templateId);
    if (!template) {
      window.localStorage.removeItem(STUDIO_TEMPLATE_HANDOFF_KEY);
      return;
    }
    const projectId = currentProjectIdentity(window.location.pathname);
    const storyBeats = appliedStoryBeats(template.id);
    updateStudioProjectFeatureSuite(
      window.localStorage,
      projectId,
      (current) => ({
        ...current,
        storyBeats: storyBeats ?? current.storyBeats,
        design: {
          ...current.design,
          template: template.definition,
          values: defaultStudioTemplateValues(template),
        },
      }),
      window,
    );
    window.dispatchEvent(new CustomEvent(STUDIO_TEMPLATE_APPLIED_EVENT, {
      detail: Object.freeze({
        projectId,
        templateId: template.id,
        workspace: template.recommendedWorkspace,
        definition: template.definition,
        values: defaultStudioTemplateValues(template),
      }),
    }));
    window.localStorage.removeItem(STUDIO_TEMPLATE_HANDOFF_KEY);
    setAppliedTitle(template.titleKo);
  }, [handoff]);

  if (!appliedTitle || dismissed) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[70] flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-2xl border border-success/30 bg-card/95 p-3 shadow-xl backdrop-blur">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-success-soft/20 text-success">
          <LayoutTemplate size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-black text-success">
            <CheckCircle2 size={14} aria-hidden="true" /> 템플릿 적용됨
          </p>
          <p className="mt-1 text-sm font-bold text-fg">{appliedTitle}</p>
          <p className="mt-1 text-xs leading-5 text-fg-3">
            새 문서에 기본 구조와 편집 가능한 항목을 준비했습니다. 이미지와 외부 에셋은 사용 전에 권리를 다시 확인합니다.
          </p>
        </div>
        <button
          type="button"
          aria-label="템플릿 적용 안내 닫기"
          onClick={() => setDismissed(true)}
          className={buttonClass({ variant: "quiet", size: "icon", className: "shrink-0" })}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export { STUDIO_TEMPLATE_APPLIED_EVENT };
