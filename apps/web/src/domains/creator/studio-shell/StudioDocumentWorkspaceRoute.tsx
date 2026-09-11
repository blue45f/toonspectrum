import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";

import { parseStudioDocumentLocation } from "../studio-document-workspace";

function localeFromLanguage(language: string): "ko" | "en" {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

/**
 * Canonical document URLs own project/document/workspace identity, while the established editor
 * keeps rendering and persistence authority. Until that editor consumes canonical document URLs
 * directly, this route performs one explicit, lossless bridge instead of falling through to an
 * unrelated Studio wildcard screen.
 */
export function StudioDocumentWorkspaceRoute() {
  const location = useLocation();
  const language = useI18n((state) => state.lang);
  const locale = localeFromLanguage(language);
  const resolution = parseStudioDocumentLocation({
    pathname: location.pathname,
    search: location.search,
  });

  if (resolution.kind === "document") {
    return <Navigate to={resolution.legacyEditorHref} replace />;
  }

  if (resolution.kind === "not-document") {
    return <Navigate to="/studio" replace />;
  }

  return (
    <Container size="wide" className="py-10">
      <main
        className="mx-auto max-w-2xl rounded-3xl border border-danger/35 bg-card p-6 shadow-sm sm:p-8"
        role="alert"
      >
        <span className="grid size-11 place-items-center rounded-xl bg-danger-soft/25 text-danger">
          <AlertTriangle size={21} aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-xl font-black text-fg">
          {locale === "ko" ? "문서 주소를 안전하게 열 수 없어요." : "This document address cannot be opened safely."}
        </h1>
        <p className="mt-2 text-sm leading-6 text-fg-3">
          {locale === "ko"
            ? "프로젝트와 원고는 변경하지 않았습니다. 주소의 문서·작업공간 정보를 확인하거나 내 작업에서 다시 열어 주세요."
            : "No project or manuscript data was changed. Check the document and workspace address, or reopen it from My work."}
        </p>
        <p className="mt-3 rounded-xl border border-line bg-panel/60 px-3 py-2 text-xs font-mono text-fg-3">
          {resolution.errorCode}
        </p>
        <Link href="/studio" className={buttonClass({ className: "mt-5 gap-2" })}>
          <ArrowLeft size={15} aria-hidden="true" />
          {locale === "ko" ? "내 작업으로" : "Back to My work"}
        </Link>
      </main>
    </Container>
  );
}
