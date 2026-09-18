import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowRight,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
  Workflow,
} from "lucide-react";
import { WEBTOON_PRODUCTION_STAGE_SUPPORT } from "@/shared/lib/webtoon-production-support";

function DotItems({ items }: { readonly items: readonly string[] }) {
  return (
    <ul className="space-y-1.5 text-xs leading-5 text-fg-2">
      {items.map((item) => <li key={item}>• {item}</li>)}
    </ul>
  );
}

export function WebtoonProductionSupportGuide({ onStartProject }: { readonly onStartProject: () => void }) {
  return (
    <section id="site-production-support" className="scroll-mt-24" aria-labelledby="site-production-support-title">
      <div className="flex max-w-4xl items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Workflow size={20} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-bold tracking-[.14em] text-accent">{translateCurrentStaticSourceText("domains.learn.WebtoonProductionSupportGuide", "en", "WORKFLOW → WORKSPACE")}</p>
          <h2 id="site-production-support-title" className="mt-2 text-2xl font-bold sm:text-3xl">
            {translateCurrentStaticSourceText("domains.learn.WebtoonProductionSupportGuide", "ko", "실제 제작 단계를 사이트의 작업공간과 연결합니다.")}</h2>
          <p className="mt-3 leading-7 text-fg-2">
            {translateCurrentStaticSourceText("domains.learn.WebtoonProductionSupportGuide", "ko", "단계 이름만 설명하지 않고, 어떤 자료를 받아 무엇을 확인하고 다음 담당자에게 무엇을 넘겨야 하는지까지 보여줍니다. 프로젝트를 만들면 같은 기준이 현재 작업공간에 맞춰 다시 나타납니다.")}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {WEBTOON_PRODUCTION_STAGE_SUPPORT.map((stage) => (
          <details key={stage.stageId} id={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.WebtoonProductionSupportGuide", "en", "episode-stage-{v0}"), { v0: String(stage.stageId) })} className="group scroll-mt-24 rounded-3xl border border-line bg-panel p-5 open:border-accent/35 open:shadow-sm">
            <summary className="cursor-pointer list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-sm font-black text-on-accent">{stage.order}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-bold">{stage.titleKo}</h3>
                  <p className="mt-1 text-xs leading-5 text-fg-3">{stage.inputKo}</p>
                </div>
                <span className="text-xl text-fg-3 transition-transform group-open:rotate-45" aria-hidden="true">+</span>
              </div>
            </summary>

            <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
              <div className="rounded-xl bg-canvas p-3">
                <p className="text-xs font-black text-fg">{translateCurrentStaticSourceText("domains.learn.WebtoonProductionSupportGuide", "ko", "입력")}</p>
                <p className="mt-1 text-xs leading-5 text-fg-2">{stage.inputKo}</p>
              </div>
              <div className="rounded-xl bg-canvas p-3">
                <p className="text-xs font-black text-fg">{translateCurrentStaticSourceText("domains.learn.WebtoonProductionSupportGuide", "ko", "다음 인계")}</p>
                <p className="mt-1 text-xs leading-5 text-fg-2">{stage.handoffKo}</p>
              </div>
            </div>

            <div className="mt-3 flex items-start gap-2 rounded-xl border border-warning/25 bg-warning-soft/10 p-3">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <p className="text-xs leading-5 text-fg-2"><strong className="text-warning">{translateCurrentStaticSourceText("domains.learn.WebtoonProductionSupportGuide", "ko", "늦게 발견할수록 비싼 문제 · ")}</strong>{stage.reworkRiskKo}</p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-canvas p-3">
                <div className="flex items-center gap-2"><Sparkles size={14} className="text-accent" aria-hidden="true" /><p className="text-xs font-black">{translateCurrentStaticSourceText("domains.learn.WebtoonProductionSupportGuide", "ko", "사이트가 줄여주는 반복 작업")}</p></div>
                <div className="mt-2"><DotItems items={stage.conveniencesKo} /></div>
              </div>
              <div className="rounded-xl border border-line bg-canvas p-3">
                <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-success" aria-hidden="true" /><p className="text-xs font-black">{translateCurrentStaticSourceText("domains.learn.WebtoonProductionSupportGuide", "ko", "다음 단계 전 확인")}</p></div>
                <div className="mt-2"><DotItems items={stage.readinessChecksKo} /></div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2" aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.WebtoonProductionSupportGuide", "ko", "{v0} 관련 기능"), { v0: String(stage.titleKo) })}>
              {stage.actions.map((action) => (
                <span key={action.id} className="rounded-full border border-accent/25 bg-accent-soft/30 px-3 py-1 text-xs font-bold text-accent">
                  {action.labelKo}
                </span>
              ))}
            </div>
          </details>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-accent/30 bg-accent-soft/20 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-bold text-fg">{translateCurrentStaticSourceText("domains.learn.WebtoonProductionSupportGuide", "ko", "프로젝트에서는 현재 화면에 맞는 단계만 자동으로 표시됩니다.")}</p>
          <p className="mt-1 text-sm leading-6 text-fg-2">{translateCurrentStaticSourceText("domains.learn.WebtoonProductionSupportGuide", "ko", "준비 체크는 보조 상태이며, 정식 승인·버전·납품 이력은 프로젝트의 기존 검토 기능에서 관리합니다.")}</p>
        </div>
        <button
          type="button"
          onClick={onStartProject}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-on-accent hover:bg-accent-2"
        >
          {translateCurrentStaticSourceText("domains.learn.WebtoonProductionSupportGuide", "ko", "내 제작 트랙 만들기")}<ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
