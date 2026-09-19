import {
  getCurrentUiLocale,
  translateBilingualValueForLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { ArrowRight, PanelsTopLeft, PencilLine, Plus, Zap } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import Link from "@/compat/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { buildStudioModeLaunchHref, resolveStudioModeCreationPlan } from "../studio-mode-creation-plan";
import { createStudioProjectWithInitialDocument } from "../studio-project-creation";

const QUICK_STARTS = [
  {
    id: "webtoon",
    kind: "webtoon",
    templateId: "webtoon-vertical",
    icon: PanelsTopLeft,
    labelKo: "웹툰 시작하기",
    labelEn: "Start a webtoon",
    titleKo: "새 웹툰",
    titleEn: "New webtoon",
  },
  {
    id: "draw",
    kind: "illustration",
    templateId: "quick-sketch",
    icon: PencilLine,
    labelKo: "그림 시작하기",
    labelEn: "Start drawing",
    titleKo: "빠른 스케치",
    titleEn: "Quick sketch",
  },
] as const;

type QuickStart = (typeof QUICK_STARTS)[number];

/** A deliberate click creates a real, recoverable project; mounting/prefetching never does. */
export function StudioQuickStart({ locale }: { readonly locale: "ko" | "en" }) {
  useBilingualI18nRevision();
  const copy = (ko: string, en: string): string =>
    translateBilingualValueForLocale(
      locale,
      "domains.creator.studio.shell.StudioQuickStart",
      ko,
      en,
    );
  const navigate = useNavigate();
  const starting = useRef(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function start(item: QuickStart) {
    if (starting.current) return;
    starting.current = true;
    setBusyId(item.id);
    setError(null);
    try {
      const plan = resolveStudioModeCreationPlan(item.kind, item.templateId);
      const result = createStudioProjectWithInitialDocument(window.localStorage, {
        title: copy(item.titleKo, item.titleEn),
        kind: item.kind,
        templateId: item.templateId,
        primaryLocale: getCurrentUiLocale(),
        document: {
          kind: plan.document.kind,
          defaultWorkspace: plan.document.workspace,
          width: plan.document.width,
          height: plan.document.height,
          pageCount: plan.document.pageCount,
        },
      }, window);
      navigate(buildStudioModeLaunchHref(result, plan), { replace: false });
    } catch {
      starting.current = false;
      setBusyId(null);
      setError(copy("이 브라우저에서 새 작업을 저장하지 못했어요. 저장 공간과 브라우저 설정을 확인한 뒤 다시 시도해 주세요. 기존 작업은 변경하지 않았습니다.", "This browser could not save a new project. Check available storage and browser settings, then retry. Existing work was not changed."));
    }
  }

  return (
    <section
      id="quick-draw"
      className="mt-6 rounded-2xl border border-accent/30 bg-accent-soft/20 px-4 py-5 sm:px-6"
      aria-label={copy("빠른 시작", "Quick start")}
      data-studio-quick-start="true"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-black text-accent">
            <Zap size={15} aria-hidden="true" />
            {copy("설정 없이 시작", "Start without setup")}
          </p>
          <h2 className="mt-2 text-xl font-black text-fg">
            {copy("바로 시작하기", "Start right away")}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-fg-2">
            {translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioQuickStart", "웹툰은 컷·말풍선 중심 작업공간으로, 그림은 브러시·레이어 중심 작업공간으로 바로 엽니다.", "Webtoons open panel-and-balloon first; drawings open brush-and-layer first.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_STARTS.map((item) => {
            const Icon = item.icon;
            const busy = busyId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={busyId !== null}
                onClick={() => start(item)}
                className={buttonClass({
                  variant: item.id === "webtoon" ? "solid" : "outline",
                  size: "lg",
                  className: "min-h-12 shrink-0 gap-2",
                })}
              >
                <Icon size={18} aria-hidden="true" />
                {busy ? (copy("여는 중…", "Opening…")) : copy(item.labelKo, item.labelEn)}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            );
          })}
          <Link href="/studio/new" className={buttonClass({ variant: "quiet", size: "lg", className: "min-h-12 gap-2" })}>
            <Plus size={17} aria-hidden="true" />
            {copy("다른 작업 만들기", "More project types")}
          </Link>
        </div>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
    </section>
  );
}
