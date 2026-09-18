import { CheckCircle2, LayoutTemplate, X } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  createStudioTemplateHandoff,
  studioTemplateById,
  writeStudioTemplateHandoff,
} from "../studio-template-catalog";
import { StudioNewIntegratedPage as StudioProjectCreatePage } from "./StudioProjectCreatePage";
import "./studio-new-visual-first.css";
import "./studio-new-visual-gallery.css";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";


/** Preserve template intent while the existing new-project flow creates the document identity. */
export function StudioNewIntegratedPage() {
  useBilingualI18nRevision();
  const [searchParams] = useSearchParams();
  useI18n((state) => state.lang);
  const bt = useBilingual("StudioNewIntegratedPage");
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
                    <span className="break-words">{bt("템플릿 선택됨", "Template selected")}</span>
                  </p>
                  <p className="mt-1 break-words text-sm font-black text-fg">
                    {bt(template.titleKo, template.titleEn)}
                  </p>
                  <p className="mt-0.5 break-words text-xs leading-5 text-fg-2">
                    {bt(
                      `권장 작업공간: ${template.recommendedWorkspace} · 새 문서가 열리면 기본 구조를 적용합니다.`,
                      `Recommended workspace: ${template.recommendedWorkspace} · Defaults apply when the new document opens.`,
                    )}
                  </p>
                </div>
              </div>
              <Link
                href="/studio/new"
                className="inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 hover:text-fg sm:w-auto sm:shrink-0"
              >
                <X size={14} className="shrink-0" aria-hidden="true" />
                <span className="break-words">{bt("템플릿 없이 시작", "Start without template")}</span>
              </Link>
            </div>
          </Container>
        </div>
      ) : null}
      <StudioProjectCreatePage />
    </>
  );
}
