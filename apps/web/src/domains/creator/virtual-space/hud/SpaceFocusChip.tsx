import { Coffee, Pause, Play, Square, Timer } from "lucide-react";
import { memo } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  formatStudioFocusClock,
  studioFocusRemainingMs,
  type StudioFocusSession,
} from "../studio-virtual-space-focus-session";

/**
 * 집중 세션 칩: 집중/휴식 구간의 남은 시간을 보여 주고 일시정지·재개·중단을 제공한다.
 * 세션 전이는 focus-session 상태 머신이, 이 컴포넌트는 표시와 버튼만 담당한다.
 */
export const SpaceFocusChip = memo(function SpaceFocusChip({ session, now, onPause, onResume, onStop }: {
  readonly session: StudioFocusSession;
  /** 페이지가 1초 간격으로 갱신하는 현재 시각 (ms). */
  readonly now: number;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onStop: () => void;
}) {
  const bt = useBilingual("SpaceFocusChip");
  if (session.phase === "idle" || session.phase === "done") return null;
  const onBreak = session.phase === "break";
  const clock = formatStudioFocusClock(studioFocusRemainingMs(session, now));
  const label = onBreak
    ? bt(`휴식 중 ${clock}`, `Break ${clock}`)
    : bt(`집중 중 ${clock}`, `Focusing ${clock}`);
  return <div className="space-focus-chip" data-space-interactive="true" data-phase={session.phase}>
    {onBreak ? <Coffee size={16} aria-hidden /> : <Timer size={16} aria-hidden />}
    <p role="timer" aria-label={label}><strong>{label}</strong></p>
    <div className="space-focus-chip__actions">
      {session.phase === "running" ? <button type="button" className="space-pill-button" onClick={onPause}>
        <Pause size={14} aria-hidden />{bt("일시정지", "Pause")}
      </button> : null}
      {session.phase === "paused" ? <button type="button" className="space-pill-button" onClick={onResume}>
        <Play size={14} aria-hidden />{bt("계속", "Resume")}
      </button> : null}
      <button type="button" className="space-pill-button" aria-label={bt("집중 세션 종료", "End focus session")} onClick={onStop}>
        <Square size={14} aria-hidden />{bt("종료", "End")}
      </button>
    </div>
  </div>;
});
