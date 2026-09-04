import { Eye, EyeOff, Gauge, MousePointer2 } from "lucide-react";
import { useEffect } from "react";

import { useStudioLiveCollaboration } from "./studio-live-collaboration-context";
import {
  resolveStudioLiveCursorIntervalMs,
  resolveStudioLiveCursorLimit,
  updateStudioLiveCollaborationPreferences,
  useStudioLiveCollaborationPreferences,
  type StudioLiveCursorQuality,
  type StudioLiveCursorVisibility,
} from "./studio-live-collaboration-preferences";

import { cn } from "@/lib/utils";

const VISIBILITY_OPTIONS: readonly {
  value: StudioLiveCursorVisibility;
  label: string;
}[] = [
  { value: "all", label: "모두" },
  { value: "active", label: "활성" },
  { value: "drawing", label: "그리는 중" },
  { value: "hidden", label: "숨김" },
];

const QUALITY_OPTIONS: readonly {
  value: StudioLiveCursorQuality;
  label: string;
}[] = [
  { value: "auto", label: "자동" },
  { value: "smooth", label: "부드럽게" },
  { value: "balanced", label: "균형" },
  { value: "data-saver", label: "데이터 절약" },
];

export function StudioLiveCollaborationPreferences() {
  const live = useStudioLiveCollaboration();
  const preferences = useStudioLiveCollaborationPreferences();
  const intervalMs = resolveStudioLiveCursorIntervalMs(preferences.cursorQuality);
  const cursorLimit = resolveStudioLiveCursorLimit(preferences.cursorQuality);

  useEffect(() => {
    live.room?.setCursorIntervalMs(intervalMs);
  }, [intervalMs, live.room]);

  return (
    <details
      className="mt-3 rounded-xl border border-line bg-card/55 px-3 py-2"
      data-studio-live-presentation-preferences="true"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-semibold text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 [&::-webkit-details-marker]:hidden">
        <Gauge className="text-accent" size={15} aria-hidden />
        커서 표시와 성능
        <span className="ml-auto text-[0.65rem] font-medium text-fg-3">
          최대 {cursorLimit}명 · {intervalMs}ms
        </span>
      </summary>

      <div className="space-y-3 border-t border-line pt-3">
        <fieldset>
          <legend className="mb-1.5 flex items-center gap-1.5 text-[0.68rem] font-semibold text-fg-2">
            <MousePointer2 size={13} aria-hidden /> 표시할 커서
          </legend>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {VISIBILITY_OPTIONS.map((option) => {
              const selected = preferences.cursorVisibility === option.value;
              return (
                <button
                  key={option.value}
                  aria-pressed={selected}
                  className={cn(
                    "min-h-10 rounded-lg border px-2 text-[0.68rem] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                    selected
                      ? "border-accent/60 bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  )}
                  type="button"
                  onClick={() =>
                    updateStudioLiveCollaborationPreferences({
                      cursorVisibility: option.value,
                    })
                  }
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="grid gap-1.5 text-[0.68rem] font-semibold text-fg-2">
          전송·렌더링 품질
          <select
            aria-label="실시간 커서 품질"
            className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            value={preferences.cursorQuality}
            onChange={(event) =>
              updateStudioLiveCollaborationPreferences({
                cursorQuality: event.target.value as StudioLiveCursorQuality,
              })
            }
          >
            {QUALITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          aria-pressed={preferences.showCursorLabels}
          className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-line bg-card px-3 text-left text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          type="button"
          onClick={() =>
            updateStudioLiveCollaborationPreferences({
              showCursorLabels: !preferences.showCursorLabels,
            })
          }
        >
          {preferences.showCursorLabels ? (
            <Eye className="text-accent" size={15} aria-hidden />
          ) : (
            <EyeOff size={15} aria-hidden />
          )}
          참여자 이름표 {preferences.showCursorLabels ? "표시" : "숨김"}
          <span className="ml-auto text-[0.65rem] font-normal text-fg-3">
            이 기기에만 적용
          </span>
        </button>

        <p className="text-[0.68rem] leading-relaxed text-fg-3">
          자동 모드는 네트워크 절약 설정을 감지합니다. 따라가는 팀원과 실제로 그리는 커서는
          인원이 많아도 먼저 표시됩니다.
        </p>
      </div>
    </details>
  );
}
