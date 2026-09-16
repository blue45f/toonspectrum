import { Clock3, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { LoadingState } from "@/shared/components/LoadingState";
import { useI18n, useT } from "@/shared/lib/i18n";
import { resolveProductLocale } from "@/shared/lib/product-identity";
import { resolveSiteRouteExperience } from "@/shared/lib/site-route-experience";

/**
 * Route loading fallback mirrors the eventual page structure. When a chunk or loader takes longer
 * than a normal transition, it explains what is happening instead of leaving an endless silent
 * skeleton. RouteStage owns the final recovery controls after the longer timeout.
 */
export function RouteFallback({ accessibleTitle }: { readonly accessibleTitle?: string }) {
  const t = useT();
  const language = useI18n((state) => state.lang);
  const locale = resolveProductLocale(language);
  const { pathname, search } = useLocation();
  const experience = useMemo(
    () => resolveSiteRouteExperience(`${pathname}${search}`),
    [pathname, search],
  );
  const [delayed, setDelayed] = useState(false);
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDelayed(true), 4_500);
    const syncConnection = () => setOffline(!navigator.onLine);
    window.addEventListener("online", syncConnection);
    window.addEventListener("offline", syncConnection);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("online", syncConnection);
      window.removeEventListener("offline", syncConnection);
    };
  }, []);

  const korean = locale === "ko";
  const title = accessibleTitle?.trim() || (korean ? "화면 불러오기" : "Loading page");
  const recoveryMessage = experience.recoveryPolicy === "restore-revision"
    ? (korean ? "저장된 버전과 검토 상태를 확인한 뒤 화면을 엽니다." : "Checking saved versions and review state before opening the page.")
    : experience.recoveryPolicy === "preserve-draft"
      ? (korean ? "작성 중인 초안과 복구 상태를 확인하고 있습니다." : "Checking the draft and recovery state.")
      : experience.recoveryPolicy === "resume-recent"
        ? (korean ? "마지막으로 작업한 위치를 확인하고 있습니다." : "Finding the last workspace you used.")
        : (korean ? "화면 구성 요소를 준비하고 있습니다." : "Preparing the page components.");

  return (
    <div data-route-loading-fallback="" className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
      <h1 className="sr-only">{title}</h1>
      <p className="sr-only">
        {experience.pagePurpose[locale]}
      </p>
      <LoadingState variant="cards" label={t("common.loading")} />
      {delayed ? (
        <div className="mt-6 flex min-w-0 items-start gap-3 rounded-2xl border border-line bg-panel/75 p-4 text-sm text-fg-2" role="status" aria-live="polite">
          {offline ? <WifiOff size={18} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" /> : <Clock3 size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />}
          <div className="min-w-0">
            <strong className="block break-words text-fg">{offline
              ? (korean ? "인터넷 연결을 기다리고 있어요." : "Waiting for your connection.")
              : (korean ? "이 작업에 필요한 상태를 준비하고 있어요." : "Preparing the state required for this task.")}</strong>
            <p className="mt-1 break-words leading-6">{offline
              ? experience.saveTrustRequired
                ? (korean ? "현재 화면을 닫지 마세요. 연결이 돌아오면 저장·복구 상태를 다시 확인합니다." : "Keep this page open. Save and recovery state will be checked after reconnection.")
                : (korean ? "연결이 돌아오면 화면을 다시 불러옵니다." : "Loading can continue when the connection returns.")
              : recoveryMessage}</p>
            <p className="mt-2 break-words text-xs text-fg-3">{experience.pagePurpose[locale]}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
