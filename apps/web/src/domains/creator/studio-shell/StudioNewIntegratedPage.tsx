import { CheckCircle2, LayoutTemplate, X } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { useT } from "@/shared/lib/i18n";
import {
  defineBilingualText,
  formatI18nTemplate,
  translateBilingualText,
} from "@/shared/lib/i18n-bilingual-copy";

import {
  createStudioTemplateHandoff,
  studioTemplateById,
  writeStudioTemplateHandoff,
} from "../studio-template-catalog";
import { StudioNewIntegratedPage as StudioProjectCreatePage } from "./StudioProjectCreatePage";
import "./studio-new-visual-first.css";
import "./studio-new-visual-gallery.css";

const COPY = {
  templateSelected: defineBilingualText("studioNewIntegrated", "templateSelected", "템플릿 선택됨", "Template selected"),
  recommendedWorkspace: defineBilingualText(
    "studioNewIntegrated",
    "recommendedWorkspace",
    "권장 작업공간: {workspace} · 새 문서가 열리면 기본 구조를 적용합니다.",
    "Recommended workspace: {workspace} · Defaults apply when the new document opens.",
  ),
  startWithoutTemplate: defineBilingualText(
    "studioNewIntegrated",
    "startWithoutTemplate",
    "템플릿 없이 시작",
    "Start without template",
  ),
} as const;

/** Preserve template intent while the existing new-project flow creates the document identity. */
export function StudioNewIntegratedPage() {
  const [searchParams] = useSearchParams();
  const t = useT();
  const template = studioTemplateById(searchParams.get("template"));

  useEffect(() => {
    if (!template || typeof window === "undefined") return;
    writeStudioTemplateHandoff(
      window.localStorage,
      createStudioTemplateHandoff(template.id),
    );
  }, [template]);

  return (
    <>
      {template ? (
        <div className="min-w-0 border-b border-accent/25 bg-accent-soft/35">
          <Container size="wide" className="min-w-0 py-3">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-accent shadow-sm">
                  <LayoutTemplate size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-black text-accent">
                    <CheckCircle2 size={14} className="shrink-0" aria-hidden="true" />
                    <span className="break-words">{t(COPY.templateSelected)}</span>
                  </p>
                  <p className="mt-1 break-words text-sm font-black text-fg">
                    {translateBilingualText(t, "studioNewIntegrated.templateTitle", { ko: template.titleKo, en: template.titleEn })}
                  </p>
                  <p className="mt-0.5 break-words text-xs leading-5 text-fg-2">
                    {formatI18nTemplate(t(COPY.recommendedWorkspace), { workspace: template.recommendedWorkspace })}
                  </p>
                </div>
              </div>
              <Link
                href="/studio/new"
                className="inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 hover:text-fg sm:w-auto sm:shrink-0"
              >
                <X size={14} className="shrink-0" aria-hidden="true" />
                <span className="break-words">{t(COPY.startWithoutTemplate)}</span>
              </Link>
            </div>
          </Container>
        </div>
      ) : null}
      <StudioProjectCreatePage />
    </>
  );
}
