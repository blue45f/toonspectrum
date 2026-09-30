/**
 * 가상 스튜디오 게임필 설정 UI
 *
 * 화면 흔들림 on/off, 파티클 밀도, 모션 강도 슬라이더를 제공한다.
 * OS reduced-motion이 켜져 있으면(자동 연동 시) 효과를 자동으로 끄고
 * 안내 문구를 보여준다.
 *
 * 10초 룰: 핵심 토글 2개만 전면에 두고, 세부 슬라이더는
 * "세부 조정" 토글로 접어둔다.
 */

import { useState } from "react";
import { ChevronDown, SlidersHorizontal, Sparkles } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  resolveStudioGameFeel,
  type StudioVirtualGameFeelPreference,
} from "./studio-virtual-space-game-feel-preference";
import { useStudioPrefersReducedMotion } from "./studio-virtual-space-reduced-motion";

export interface StudioVirtualSpaceGameFeelSettingsProps {
  readonly value: StudioVirtualGameFeelPreference;
  readonly onChange: (value: StudioVirtualGameFeelPreference) => void;
}

/** iOS 스타일 스위치 토글 행. */
function GameFeelToggle({
  checked,
  disabled,
  onChange,
  title,
  hint,
}: {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly title: string;
  readonly hint: string;
}) {
  return (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control -- 라벨이 input을 감싸고 title/hint 텍스트를 포함해 접근 가능한 이름을 가짐. 규칙이 JSX 표현식을 정적으로 인식하지 못함.
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border p-3",
        "transition-colors motion-reduce:transition-none",
        checked
          ? "border-violet-300 bg-violet-50/70 dark:border-violet-700 dark:bg-violet-950/40"
          : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full",
          "transition-colors motion-reduce:transition-none",
          checked ? "bg-violet-600" : "bg-neutral-300 dark:bg-neutral-600",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-violet-600",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow",
            "transition-transform motion-reduce:transition-none",
            checked && "translate-x-5",
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">{hint}</span>
      </span>
    </label>
  );
}

/** 강도 슬라이더 행. */
function GameFeelSlider({
  id,
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  /** 0~1 강도. */
  readonly value: number;
  readonly disabled?: boolean;
  readonly onChange: (value: number) => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200 bg-neutral-50/60 p-3",
        "dark:border-neutral-700 dark:bg-neutral-800/40",
        disabled && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {label}
        </label>
        <output
          htmlFor={id}
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
            "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200",
          )}
        >
          {percent}%
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        aria-label={label}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        className="mt-1 w-full accent-violet-600"
      />
      <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">{hint}</p>
    </div>
  );
}

export function StudioVirtualSpaceGameFeelSettings({ value, onChange }: StudioVirtualSpaceGameFeelSettingsProps) {
  const bt = useBilingual("domains.creator.virtual-space.StudioVirtualSpaceGameFeelSettings");
  const osReducedMotion = useStudioPrefersReducedMotion();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const patch = (next: Partial<Omit<StudioVirtualGameFeelPreference, "version">>) =>
    onChange({ ...value, ...next, version: 1 });

  const effective = resolveStudioGameFeel(value, osReducedMotion);
  const reducedByOs = effective.reducedMotion;

  return (
    <section
      aria-labelledby="studio-game-feel-title"
      className={cn(
        "w-full overflow-hidden rounded-xl border border-neutral-200 bg-white",
        "dark:border-neutral-800 dark:bg-neutral-900",
      )}
    >
      <div
        className={cn(
          "bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-500",
          "px-4 py-3",
        )}
      >
        <h2 id="studio-game-feel-title" className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <Sparkles size={16} aria-hidden="true" />
          {bt("게임필 설정", "Game feel settings")}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-white/85">
          {bt(
            "이동·충돌·상호작용에 생동감을 주는 효과를 조절합니다. 이 설정은 이 브라우저에만 저장됩니다.",
            "Tune the effects that give movement, collisions and interactions their lively feel. Stored in this browser only.",
          )}
        </p>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {reducedByOs && (
          <p
            role="status"
            className={cn(
              "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800",
              "dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
            )}
          >
            {bt(
              "기기의 '모션 감소' 설정이 켜져 있어 모든 효과가 자동으로 꺼졌습니다.",
              "Motion effects are off because your device's Reduce Motion setting is on.",
            )}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <GameFeelToggle
            checked={value.screenShake}
            disabled={reducedByOs}
            onChange={(checked) => patch({ screenShake: checked })}
            title={bt("화면 흔들림", "Screen shake")}
            hint={bt(
              "벽·가구에 세게 부딪힐 때 화면이 살짝 흔들립니다.",
              "The screen shakes slightly on hard collisions with walls and furniture.",
            )}
          />
          <GameFeelToggle
            checked={value.followOsReducedMotion}
            onChange={(checked) => patch({ followOsReducedMotion: checked })}
            title={bt("기기의 모션 감소 설정 따르기", "Follow device Reduce Motion")}
            hint={bt(
              "켬: 기기 설정이 모션 감소면 모든 게임필 효과를 자동으로 끕니다.",
              "On: automatically turns off all game feel effects when the device requests reduced motion.",
            )}
          />
        </div>

        <div>
          <button
            type="button"
            aria-expanded={advancedOpen}
            aria-controls="studio-game-feel-advanced"
            onClick={() => setAdvancedOpen((open) => !open)}
            className={cn(
              "inline-flex w-full items-center justify-between gap-2 rounded-xl border border-dashed px-3 py-2.5 text-sm font-medium",
              "border-neutral-300 text-neutral-700 hover:border-violet-400 hover:text-violet-700",
              "dark:border-neutral-700 dark:text-neutral-200 dark:hover:border-violet-600 dark:hover:text-violet-300",
              "transition-colors motion-reduce:transition-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600",
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              <SlidersHorizontal size={16} aria-hidden="true" />
              {bt("세부 조정", "Advanced tweaks")}
            </span>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={cn("transition-transform motion-reduce:transition-none", advancedOpen && "rotate-180")}
            />
          </button>
          {advancedOpen ? (
            <div
              id="studio-game-feel-advanced"
              className="mt-2 flex flex-col gap-2 animate-fade-up motion-reduce:animate-none"
            >
              <GameFeelSlider
                id="studio-game-feel-particle-density"
                label={bt("파티클 밀도", "Particle density")}
                hint={bt(
                  "발밑 먼지·반딧불이·착지 파티클의 양을 조절합니다.",
                  "Controls how many dust, firefly and impact particles appear.",
                )}
                value={value.particleDensity}
                disabled={reducedByOs}
                onChange={(particleDensity) => patch({ particleDensity })}
              />
              <GameFeelSlider
                id="studio-game-feel-motion-intensity"
                label={bt("모션 강도", "Motion intensity")}
                hint={bt(
                  "스쿼시&스트레치·흔들림·물결 같은 움직임 효과의 세기를 조절합니다.",
                  "Scales squash & stretch, wobble and sway style motion effects.",
                )}
                value={value.motionIntensity}
                disabled={reducedByOs}
                onChange={(motionIntensity) => patch({ motionIntensity })}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default StudioVirtualSpaceGameFeelSettings;
