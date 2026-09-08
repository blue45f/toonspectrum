import {
  ArrowRight,
  Clapperboard,
  Palette,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useId } from "react";

import {
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
  STUDIO_TOUCH_TARGET,
} from "../studio-panel-ui";

import type { ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

interface ProductionAction {
  readonly id: "director" | "recipe";
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly icon: LucideIcon;
  readonly onClick?: () => void;
  readonly onPreload?: () => void;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly accent?: boolean;
}

export interface StudioAiProductionLaunchpadProps {
  readonly imageConfigured: boolean;
  readonly textConfigured: boolean;
  readonly onOpenScenario?: () => void;
  readonly onOpenSuperSuite?: () => void;
  readonly onPreloadSuperSuite?: () => void;
  readonly scenarioDisabled?: boolean;
  readonly scenarioDisabledReason?: string;
}

function ActionCard({
  action,
  descriptionId,
}: {
  readonly action: ProductionAction;
  readonly descriptionId: string;
}): ReactElement {
  const Icon = action.icon;
  return (
    <button
      type="button"
      onClick={action.onClick}
      onMouseEnter={action.onPreload}
      onFocus={action.onPreload}
      onPointerDown={action.onPreload}
      disabled={action.disabled || !action.onClick}
      aria-describedby={descriptionId}
      title={action.disabled ? action.disabledReason : undefined}
      data-studio-ai-production-action={action.id}
      className={cn(
        "group flex min-h-[5.75rem] min-w-0 items-start gap-3 rounded-xl border p-3 text-left",
        STUDIO_EASE,
        STUDIO_FOCUS_RING,
        STUDIO_TOUCH_TARGET,
        action.accent
          ? "border-accent/45 bg-accent-soft/60 hover:bg-accent-soft"
          : "border-line bg-card/80 hover:border-line-strong hover:bg-raised",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <span
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-xl border",
          action.accent
            ? "border-accent/35 bg-accent text-on-accent"
            : "border-line bg-raised text-accent",
        )}
      >
        <Icon size={16} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-xs font-black leading-snug text-fg">
          {action.title}
        </strong>
        <span
          id={descriptionId}
          className="mt-1 block text-[0.62rem] leading-relaxed text-fg-3"
        >
          {action.description}
        </span>
        <span className="mt-2 inline-flex items-center gap-1 text-[0.6rem] font-semibold text-fg-2">
          {action.accent ? <ShieldCheck size={10} className="text-good" aria-hidden /> : null}
          {action.disabled && action.disabledReason
            ? action.disabledReason
            : action.status}
        </span>
      </span>
    </button>
  );
}

export function StudioAiProductionLaunchpad({
  imageConfigured,
  textConfigured,
  onOpenScenario,
  onOpenSuperSuite,
  onPreloadSuperSuite,
  scenarioDisabled = false,
  scenarioDisabledReason,
}: StudioAiProductionLaunchpadProps): ReactElement | null {
  const rawId = useId().replace(/:/gu, "");

  if (!onOpenScenario && !onOpenSuperSuite) return null;

  const actions: readonly ProductionAction[] = [
    {
      id: "director",
      title: "AI 코믹 디렉터",
      description:
        "이야기·작품 기준 → 컷 연출 → 선택 후보 제작 → 편집 가능한 Studio 원고",
      status: textConfigured
        ? imageConfigured
          ? "컷 구성과 이미지 후보 제작 가능"
          : "컷 구성 가능 · 이미지 연결 필요"
        : "텍스트 AI 연결 필요",
      icon: Clapperboard,
      onClick: onOpenScenario,
      disabled: scenarioDisabled || !onOpenScenario,
      disabledReason: scenarioDisabled
        ? scenarioDisabledReason ?? "현재 편집 상태에서는 사용할 수 없어요."
        : undefined,
      accent: true,
    },
    {
      id: "recipe",
      title: "화풍·연출 레시피 만들기",
      description: "선·채색·명암·팔레트와 콘티 지시를 재사용 가능한 레시피로 정리",
      status: "로컬 초안 작성 가능",
      icon: Palette,
      onClick: onOpenSuperSuite,
      onPreload: onPreloadSuperSuite,
    },
  ];

  return (
    <section
      aria-labelledby={`${rawId}-title`}
      data-studio-ai-production-launchpad="true"
      className="shrink-0 rounded-xl border border-line bg-panel/45 p-2.5"
    >
      <div className="mb-2 flex items-start gap-2 px-1">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Sparkles size={13} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 id={`${rawId}-title`} className="text-[0.68rem] font-black text-fg">
            제작 흐름으로 시작
          </h3>
          <p className="mt-0.5 text-[0.59rem] leading-relaxed text-fg-3">
            모델을 고르기 전에 만들고 싶은 결과와 현재 가진 재료에서 시작합니다.
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {actions.map((action) => (
          <ActionCard
            key={action.id}
            action={action}
            descriptionId={`${rawId}-${action.id}-description`}
          />
        ))}
      </div>
      <a
        href="/create/promo"
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "mt-2 flex min-h-11 items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg hover:bg-raised",
          STUDIO_EASE,
          STUDIO_FOCUS_RING,
        )}
      >
        컷 → 홍보영상·모션툰 만들기 (새 창)
        <ArrowRight size={14} aria-hidden />
      </a>
    </section>
  );
}
