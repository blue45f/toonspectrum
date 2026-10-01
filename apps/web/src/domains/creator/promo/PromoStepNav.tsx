import { CheckCircle2, Circle, CircleDot, Clapperboard, Download, Film, Music, type LucideIcon } from "lucide-react";

import { PROMO_RECOMMENDED_PANELS, PROMO_STEP_ANCHOR, type PromoStepId, type PromoStepState, type PromoStepStatus } from "./promo-steps";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const STEP_ICON: Record<PromoStepId, LucideIcon> = {
  plan: Clapperboard,
  cuts: Film,
  sound: Music,
  export: Download,
};

const STATE_ICON: Record<PromoStepState, LucideIcon> = {
  done: CheckCircle2,
  current: CircleDot,
  todo: Circle,
  optional: Circle,
};

/**
 * 홍보영상 4단계 안내 — 지금 어디까지 했고 다음에 무엇을 하면 되는지 한 줄로 보여 주고,
 * 누르면 해당 카드로 이동한다. 상태는 아이콘·문구로도 전달해 색에만 의존하지 않는다.
 */
export function PromoStepNav({ steps, panelCount }: { steps: readonly PromoStepStatus[]; panelCount: number }) {
  const bt = useBilingual("StudioPromoPage");
  const title: Record<PromoStepId, string> = {
    plan: bt("영상 기획", "Plan"),
    cuts: bt("컷과 장면", "Panels & scenes"),
    sound: bt("음악·내레이션", "Music & narration"),
    export: bt("내보내기", "Export"),
  };
  const detail = (step: PromoStepStatus): string => {
    switch (step.id) {
      case "plan":
        return step.state === "done" ? bt("줄거리 작성됨", "Synopsis ready") : bt("줄거리를 쓰면 AI 콘티가 정확해져요", "A synopsis sharpens the AI storyboard");
      case "cuts":
        return step.state === "done"
          ? formatI18nTemplate(bt("{count}컷 준비됨", "{count} panels ready"), { count: panelCount })
          : formatI18nTemplate(bt("웹툰 컷 {min}~{max}장을 올려 주세요", "Add {min}–{max} webtoon panels"), PROMO_RECOMMENDED_PANELS);
      case "sound":
        return step.state === "done" ? bt("소리 연결됨", "Audio attached") : bt("선택 · 무음 저장도 가능", "Optional · silent export works");
      case "export":
        return step.state === "current" ? bt("영상·자막·썸네일 저장 가능", "Video, captions and thumbnail ready") : bt("컷을 추가하면 열려요", "Opens after adding panels");
    }
  };
  const stateLabel: Record<PromoStepState, string> = {
    done: bt("완료", "Done"),
    current: bt("지금 할 차례", "Up next"),
    todo: bt("대기", "Waiting"),
    optional: bt("선택", "Optional"),
  };

  return (
    <nav aria-label={bt("홍보영상 제작 단계", "Promo video steps")} className="promo-steps">
      <ol>
        {steps.map((step, index) => {
          const Icon = STEP_ICON[step.id];
          const StateIcon = STATE_ICON[step.state];
          return (
            <li key={step.id}>
              <a
                href={`#${PROMO_STEP_ANCHOR[step.id]}`}
                className={cn("promo-step-link", `promo-step-link--${step.state}`)}
                aria-current={step.state === "current" ? "step" : undefined}
              >
                <span className="promo-step-icon" aria-hidden>
                  <Icon size={18} />
                </span>
                <span className="promo-step-copy">
                  <span className="promo-step-title">
                    <span className="promo-step-num">{String(index + 1).padStart(2, "0")}</span>
                    {title[step.id]}
                  </span>
                  <span className="promo-step-detail">{detail(step)}</span>
                </span>
                <span className="promo-step-state">
                  <StateIcon size={14} aria-hidden />
                  {stateLabel[step.state]}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
