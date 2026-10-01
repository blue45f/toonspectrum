import { Check, Footprints, Hand, SmilePlus, X } from "lucide-react";
import { memo, useEffect, useRef } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export interface SpaceCoachProgress {
  readonly moved: boolean;
  readonly interacted: boolean;
  readonly emoted: boolean;
}

const STEP_ICONS = [Footprints, Hand, SmilePlus] as const;

/** 진행 신호로 현재 단계를 고른다. 모두 끝나면 3(완료)이다. */
function spaceCoachStep(progress: SpaceCoachProgress): 0 | 1 | 2 | 3 {
  if (!progress.moved) return 0;
  if (!progress.interacted) return 1;
  if (!progress.emoted) return 2;
  return 3;
}

/**
 * 첫 방문 비차단 3단계 안내. 포커스를 빼앗지 않고, 사용자가 실제로 걷고·상호작용하고·리액션하면
 * 자동으로 넘어간다. 닫거나 모두 마치면 다시 보이지 않는다(? 도움말에서 다시 볼 수 있다).
 */
export const SpaceOnboardingCoach = memo(function SpaceOnboardingCoach({ progress, touch, onComplete, onDismiss }: {
  readonly progress: SpaceCoachProgress;
  readonly touch: boolean;
  readonly onComplete: () => void;
  readonly onDismiss: () => void;
}) {
  const bt = useBilingual("SpaceOnboardingCoach");
  const step = spaceCoachStep(progress);
  const completed = useRef(false);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  useEffect(() => {
    if (step !== 3 || completed.current) return;
    completed.current = true;
    completeRef.current();
  }, [step]);
  if (step === 3) return null;
  const steps = [
    touch
      ? bt("조이스틱을 밀거나 바닥을 눌러 걸어요", "Drag the joystick or tap the floor to walk")
      : bt("WASD·방향키 또는 바닥 클릭으로 걸어요", "Walk with WASD, the arrow keys or a floor click"),
    touch
      ? bt("반짝이는 곳 가까이에서 상호작용 버튼을 눌러요", "Near a glowing spot, tap the interact button")
      : bt("반짝이는 곳 가까이에서 E를 눌러요", "Near a glowing spot, press E"),
    touch
      ? bt("리액션 버튼으로 인사해 보세요", "Say hello with the reaction button")
      : bt("1~9 키로 리액션을 보내요 · Z는 춤", "Send reactions with keys 1–9 · Z to dance"),
  ];
  const Icon = STEP_ICONS[step];
  return <section className="space-coach" aria-label={bt("처음 오셨나요? 3단계 안내", "First visit · 3-step guide")} data-space-interactive="true" data-coach-step={step + 1}>
    <span className="space-coach__icon" aria-hidden><Icon size={20} /></span>
    <div className="space-coach__body">
      <p className="space-coach__progress">{bt(`${step + 1} / 3 단계`, `Step ${step + 1} of 3`)}</p>
      <p className="space-coach__text" role="status">{steps[step]}</p>
      <ol className="space-coach__dots" aria-hidden>
        {steps.map((_, index) => <li key={index} data-state={index < step ? "done" : index === step ? "current" : "todo"}>
          {index < step ? <Check size={10} /> : null}
        </li>)}
      </ol>
    </div>
    <button type="button" className="space-icon-button" onClick={onDismiss} aria-label={bt("처음 안내 닫기", "Close the first-visit guide")}>
      <X size={16} aria-hidden />
    </button>
  </section>;
});
