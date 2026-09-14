import { Brush, LayoutTemplate, PanelsTopLeft, Zap } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { createStudioProjectWithInitialDocument } from "../studio-project-creation";

const STARTS = [
  { kind: "illustration", templateId: "quick-sketch", icon: Brush, ko: "바로 그리기", en: "Draw now", titleKo: "빠른 스케치", titleEn: "Quick sketch" },
  { kind: "webtoon", templateId: "webtoon-vertical", icon: PanelsTopLeft, ko: "웹툰 바로 열기", en: "Open webtoon", titleKo: "새 웹툰", titleEn: "New webtoon" },
  { kind: "design", templateId: "design-social", icon: LayoutTemplate, ko: "디자인 바로 열기", en: "Open design", titleKo: "새 디자인", titleEn: "New design" },
] as const;
type Start = (typeof STARTS)[number];

/** Create an isolated, reopenable document; never overwrite the shared draft slot. */
export function StudioQuickCreateActions({ locale }: { readonly locale: "ko" | "en" }) {
  const navigate = useNavigate();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = (start: Start) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const created = createStudioProjectWithInitialDocument(window.localStorage, {
        kind: start.kind,
        templateId: start.templateId,
        title: locale === "ko" ? start.titleKo : start.titleEn,
        primaryLocale: locale === "ko" ? "ko-KR" : "en-US",
      }, window);
      const href = start.kind === "illustration" ? `${created.href}&quick=1` : created.href;
      navigate(href);
    } catch {
      busyRef.current = false;
      setBusy(false);
      setError(locale === "ko"
        ? "새 작업을 저장하지 못했어요. 저장 공간과 사이트 저장 권한을 확인해 주세요. 기존 그림은 변경하지 않았습니다."
        : "Could not save a new document. Check available storage and site storage permissions. Existing artwork was not changed.");
    }
  };
  return (
    <section className="mt-6 rounded-2xl border border-accent/30 bg-accent-soft/20 p-4 sm:p-5" aria-label={locale === "ko" ? "퀵모드" : "Quick mode"}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-black text-fg">
            <Zap size={17} aria-hidden="true" />
            {locale === "ko" ? "설정 없이, 바로 그리세요" : "Skip setup. Start creating."}
          </h2>
          <p className="mt-1 text-xs leading-5 text-fg-2">{locale === "ko"
            ? "이름·템플릿 입력 없이 시작해요. 새 작업은 내 작업에 추가되고, 작업환경은 나중에 바꿀 수 있어요."
            : "No name or template form. A new document is added to My work; change the workspace whenever needed."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {STARTS.map((start) => {
            const Icon = start.icon;
            return (
              <button key={start.kind} type="button" disabled={busy} onClick={() => open(start)}
                className={buttonClass({ variant: start.kind === "illustration" ? "solid" : "outline", className: "min-h-11 gap-2" })}>
                <Icon size={17} aria-hidden="true" />{locale === "ko" ? start.ko : start.en}
              </button>
            );
          })}
        </div>
      </div>
      {busy ? <p role="status" className="mt-2 text-xs text-fg-2">{locale === "ko" ? "캔버스를 준비하고 있어요…" : "Preparing your canvas…"}</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm font-semibold text-danger">{error}</p> : null}
    </section>
  );
}
