import { LayoutDashboard, Sparkles } from "lucide-react";

import { useI18n } from "@/shared/lib/i18n";
import {
  useCreatorExperienceMode,
  type CreatorExperienceMode,
} from "@/shared/lib/creator-experience-mode";

const OPTIONS: readonly { mode: CreatorExperienceMode; ko: string; en: string; icon: typeof Sparkles }[] = [
  { mode: "classic", ko: "목록 보기", en: "List view", icon: LayoutDashboard },
  { mode: "virtual-studio", ko: "공간 보기", en: "Space view", icon: Sparkles },
];

export function CreatorExperienceModeSwitch({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  const mode = useCreatorExperienceMode((state) => state.mode);
  const setMode = useCreatorExperienceMode((state) => state.setMode);

  return (
    <div
      className={"inline-flex items-center gap-1 rounded-full border border-line bg-panel/90 p-1  " + className}
      role="group"
      aria-label={korean ? "스튜디오 보기" : "Studio view"}
      data-creator-experience-switch="true"
    >
      {OPTIONS.map(({ mode: option, ko, en, icon: Icon }) => (
        <button
          key={option}
          type="button"
          aria-pressed={mode === option}
          onClick={() => setMode(option)}
          className={
            "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition " +
            (mode === option
              ? "bg-accent text-on-accent "
              : "text-fg-2 hover:bg-raised hover:text-fg")
          }
          title={korean ? ko : en}
        >
          <Icon size={14} aria-hidden="true" />
          {!compact || mode === option ? <span>{korean ? ko : en}</span> : null}
        </button>
      ))}
    </div>
  );
}
