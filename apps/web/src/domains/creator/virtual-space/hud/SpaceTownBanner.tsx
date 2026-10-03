import { Presentation, Sparkles } from "lucide-react";
import { memo, useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { studioTownActiveEvent } from "../studio-virtual-space-town-program";

const TOWN_CLOCK_MS = 30_000;

/**
 * 상단 배너. Spotlight 발표 중이면 종료 버튼을, 프로젝트 공간에서는 고정 시간표의
 * '정기 프로그램(예시)'을 보여 준다. 개인 공간에는 예시 일정을 띄우지 않는다.
 */
export const SpaceTownBanner = memo(function SpaceTownBanner({ personal, spotlightActive, onStopSpotlight, onViewTown }: {
  readonly personal: boolean;
  readonly spotlightActive: boolean;
  readonly onStopSpotlight: () => void;
  readonly onViewTown: () => void;
}) {
  const bt = useBilingual("SpaceTownBanner");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (personal) return undefined;
    const timer = globalThis.setInterval(() => setNow(Date.now()), TOWN_CLOCK_MS);
    return () => globalThis.clearInterval(timer);
  }, [personal]);
  const event = personal ? null : studioTownActiveEvent(now);
  if (spotlightActive) {
    return <div className="space-banner" data-kind="spotlight" data-space-interactive="true">
      <Presentation size={16} aria-hidden />
      <strong>{bt("Spotlight 발표 모드", "Spotlight presentation")}</strong>
      <span>{bt("동의한 그룹에만 송출", "Broadcast only to the group that consented")}</span>
      <button type="button" className="space-pill-button" onClick={onStopSpotlight}>{bt("종료", "Stop")}</button>
    </div>;
  }
  if (!event) return null;
  return <div className="space-banner" data-kind="program" data-space-interactive="true">
    <Sparkles size={16} aria-hidden />
    <strong>{bt(event.labelKo, event.labelEn)}</strong>
    <span>{bt("정기 프로그램(예시)", "Regular program (example)")}</span>
    <button type="button" className="space-pill-button" onClick={onViewTown}
      aria-label={bt(`${event.labelKo} 프로그램 보기`, `View the ${event.labelEn} program`)}>{bt("보기", "View")}</button>
  </div>;
});
