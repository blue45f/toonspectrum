import { ArrowRight, PencilLine, Zap } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { createStudioProjectWithInitialDocument } from "../studio-project-creation";

/** A deliberate click creates a real, recoverable project; mounting/prefetching never does. */
export function StudioQuickStart({ locale }: { readonly locale: "ko" | "en" }) {
  const navigate = useNavigate();
  const starting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function start() {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = createStudioProjectWithInitialDocument(window.localStorage, {
        title: locale === "ko" ? "빠른 스케치" : "Quick sketch",
        kind: "illustration",
        templateId: "quick-sketch",
        primaryLocale: locale === "ko" ? "ko-KR" : "en-US",
      }, window);
      navigate(`${result.href}&uiMode=simple`, { replace: false });
    } catch {
      starting.current = false;
      setBusy(false);
      setError(locale === "ko"
        ? "이 브라우저에서 새 작업을 저장하지 못했어요. 저장 공간과 브라우저 설정을 확인한 뒤 다시 시도해 주세요. 기존 작업은 변경하지 않았습니다."
        : "This browser could not save a new project. Check available storage and browser settings, then retry. Existing work was not changed.");
    }
  }
  return (
    <section className="mt-6 border-y border-accent/30 bg-accent-soft/20 px-4 py-5 sm:px-6" aria-label={locale === "ko" ? "퀵모드" : "Quick mode"} data-studio-quick-start="true">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-black text-accent"><Zap size={15} aria-hidden="true" />{locale === "ko" ? "설정 없이, 바로 한 획" : "Skip setup. Make your first mark."}</p>
          <h2 className="mt-2 text-xl font-black text-fg">{locale === "ko" ? "일단 그려 보세요" : "Just start drawing"}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-fg-2">{locale === "ko" ? "이름·종류를 고를 필요 없이 펜과 빈 캔버스로 시작합니다. 작업은 내 작업에 남고, 전문 화면으로 언제든 전환할 수 있어요." : "Open a blank canvas with the pen ready—no name or type required. Find it in My work and switch to the full workspace anytime."}</p>
        </div>
        <button type="button" disabled={busy} onClick={start} className={buttonClass({ size: "lg", className: "min-h-12 shrink-0 gap-2" })}>
          <PencilLine size={18} aria-hidden="true" />{busy ? (locale === "ko" ? "캔버스 여는 중…" : "Opening canvas…") : (locale === "ko" ? "바로 그리기" : "Draw now")}<ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
    </section>
  );
}
