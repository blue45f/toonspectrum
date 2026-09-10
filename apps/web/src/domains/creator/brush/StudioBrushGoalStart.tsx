import {
  Droplets,
  Feather,
  Grid3X3,
  PenLine,
  Sparkles,
} from "lucide-react";

import type { StudioBrushDynamicsPresetId } from "./studio-brush-dynamics";

export type StudioBrushGoalSection = "response" | "tip" | "engines";

export interface StudioBrushGoalStartProps {
  readonly activePresetId: StudioBrushDynamicsPresetId | null;
  readonly activeSection: string;
  readonly onSelectPreset: (presetId: StudioBrushDynamicsPresetId) => void;
  readonly onOpenSection: (section: StudioBrushGoalSection) => void;
}

const GOALS = Object.freeze([
  {
    id: "clean-line",
    label: "깔끔한 선화",
    description: "필압과 보정을 먼저 맞춰 흔들림 없는 선을 만듭니다.",
    presetId: "ink-particle",
    section: "response",
    Icon: Sparkles,
  },
  {
    id: "ink-pencil",
    label: "잉크 · 연필 질감",
    description: "마른 재료 프리셋과 펜촉 형상으로 자연스러운 결을 다듬습니다.",
    presetId: "dry-media",
    section: "tip",
    Icon: Feather,
  },
  {
    id: "soft-painting",
    label: "부드러운 채색",
    description: "에어브러시 도포량과 속도 반응으로 매끄러운 면을 쌓습니다.",
    presetId: "airbrush",
    section: "response",
    Icon: Droplets,
  },
  {
    id: "pattern-scatter",
    label: "패턴 · 산포 효과",
    description: "입자 기반 시작값에서 전문 엔진 조합으로 반복 무늬를 설계합니다.",
    presetId: "ink-particle",
    section: "engines",
    Icon: Grid3X3,
  },
  {
    id: "graphic-outline",
    label: "그래픽 외곽선",
    description: "입자 펜의 펜촉 비율을 조절해 또렷한 윤곽을 만듭니다.",
    presetId: "ink-particle",
    section: "tip",
    Icon: PenLine,
  },
] as const satisfies readonly {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly presetId: StudioBrushDynamicsPresetId;
  readonly section: StudioBrushGoalSection;
  readonly Icon: typeof Sparkles;
}[]);

export function StudioBrushGoalStart({
  activePresetId,
  activeSection,
  onSelectPreset,
  onOpenSection,
}: StudioBrushGoalStartProps) {
  return (
    <section
      aria-labelledby="studio-brush-goal-start-title"
      data-studio-brush-goal-start="true"
      className="shrink-0 border-b border-line bg-card/35 px-3 py-3 sm:px-4"
    >
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h3
            id="studio-brush-goal-start-title"
            className="text-xs font-bold text-fg"
          >
            어떤 결과를 만들고 싶나요?
          </h3>
          <p className="mt-0.5 text-[0.64rem] leading-relaxed text-fg-3">
            결과를 고르면 검증된 시작 프리셋과 가장 관련 있는 세부 설정을 함께 엽니다.
          </p>
        </div>
        <span className="hidden shrink-0 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-accent sm:inline">
          Goal start
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] sm:grid sm:grid-cols-5 sm:overflow-visible sm:pb-0">
        {GOALS.map(({ id, label, description, presetId, section, Icon }) => {
          const active = activePresetId === presetId && activeSection === section;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              data-brush-goal={id}
              onClick={() => {
                onSelectPreset(presetId);
                onOpenSection(section);
              }}
              className={[
                "group min-h-[5.25rem] min-w-[10.25rem] rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-w-0",
                active
                  ? "border-accent/65 bg-accent-soft text-fg shadow-[inset_0_0_0_1px_oklch(var(--accent)/0.12)]"
                  : "border-line bg-panel/75 text-fg-2 hover:border-accent/40 hover:bg-raised",
              ].join(" ")}
            >
              <span className="flex items-center gap-2">
                <span
                  className={[
                    "grid size-7 shrink-0 place-items-center rounded-lg",
                    active
                      ? "bg-accent text-on-accent"
                      : "bg-card text-fg-3 group-hover:text-accent",
                  ].join(" ")}
                >
                  <Icon size={14} aria-hidden />
                </span>
                <span className="text-[0.7rem] font-bold leading-tight">{label}</span>
              </span>
              <span className="mt-1.5 block text-[0.61rem] leading-relaxed text-fg-3">
                {description}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
