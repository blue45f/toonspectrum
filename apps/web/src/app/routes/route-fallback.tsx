import { Clock3, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { LoadingState } from "@/shared/components/LoadingState";
import {
  defineBilingualText,
  translateBilingualValueForActiveLocale,
} from "@/shared/lib/i18n-bilingual-copy";
import { useT } from "@/shared/lib/i18n";
import { resolveSiteRouteExperience } from "@/shared/lib/site-route-experience";

const COPY = {
  loadingPage: defineBilingualText("routeFallback", "loadingPage", "화면 불러오기", "Loading page"),
  recoveryRevision: defineBilingualText(
    "routeFallback",
    "recoveryRevision",
    "저장된 버전과 검토 상태를 확인한 뒤 화면을 엽니다.",
    "Checking saved versions and review state before opening the page.",
  ),
  recoveryDraft: defineBilingualText(
    "routeFallback",
    "recoveryDraft",
    "작성 중인 초안과 복구 상태를 확인하고 있습니다.",
    "Checking the draft and recovery state.",
  ),
  recoveryRecent: defineBilingualText(
    "routeFallback",
    "recoveryRecent",
    "마지막으로 작업한 위치를 확인하고 있습니다.",
    "Finding the last workspace you used.",
  ),
  preparingComponents: defineBilingualText(
    "routeFallback",
    "preparingComponents",
    "화면 구성 요소를 준비하고 있습니다.",
    "Preparing the page components.",
  ),
  waitingConnection: defineBilingualText(
    "routeFallback",
    "waitingConnection",
    "인터넷 연결을 기다리고 있어요.",
    "Waiting for your connection.",
  ),
  preparingTaskState: defineBilingualText(
    "routeFallback",
    "preparingTaskState",
    "이 작업에 필요한 상태를 준비하고 있어요.",
    "Preparing the state required for this task.",
  ),
  keepOpen: defineBilingualText(
    "routeFallback",
    "keepOpen",
    "현재 화면을 닫지 마세요. 연결이 돌아오면 저장·복구 상태를 다시 확인합니다.",
    "Keep this page open. Save and recovery state will be checked after reconnection.",
  ),
  continueWhenOnline: defineBilingualText(
    "routeFallback",
    "continueWhenOnline",
    "연결이 돌아오면 화면을 다시 불러옵니다.",
    "Loading can continue when the connection returns.",
  ),
  browseMeanwhile: defineBilingualText(
    "routeFallback",
    "browseMeanwhile",
    "기다리는 동안 다른 경로를 둘러보세요.",
    "Browse other pages while you wait.",
  ),
} as const;

/** 로딩이 길어질 때 제안하는 인기 경로. 모두 등록된 canonical 경로만 사용한다. */
const QUICK_LINKS = [
  { href: "/", ko: "홈", en: "Home" },
  { href: "/discover", ko: "작품 탐색", en: "Discover" },
  { href: "/studio", ko: "스튜디오", en: "Studio" },
  { href: "/search", ko: "검색", en: "Search" },
  { href: "/help", ko: "도움말", en: "Help" },
] as const;

/**
 * Route loading fallback mirrors the eventual page structure. When a chunk or loader takes longer
 * than a normal transition, it explains what is happening instead of leaving an endless silent
 * skeleton. RouteStage owns the final recovery controls after the longer timeout.
 */
export function RouteFallback({ accessibleTitle }: { readonly accessibleTitle?: string }) {
  const t = useT();
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

  const title = accessibleTitle?.trim() || t(COPY.loadingPage);
  const recoveryMessage = experience.recoveryPolicy === "restore-revision"
    ? t(COPY.recoveryRevision)
    : experience.recoveryPolicy === "preserve-draft"
      ? t(COPY.recoveryDraft)
      : experience.recoveryPolicy === "resume-recent"
        ? t(COPY.recoveryRecent)
        : t(COPY.preparingComponents);

  return (
    <div data-route-loading-fallback="" className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
      <h1 className="sr-only">{title}</h1>
      <p className="sr-only">
        {t(experience.pagePurpose)}
      </p>
      <LoadingState variant="cards" label={t("common.loading")} />
      {delayed ? (
        <div className="mt-6 flex min-w-0 items-start gap-3 rounded-2xl border border-line bg-panel/75 p-4 text-sm text-fg-2" role="status" aria-live="polite">
          {offline ? <WifiOff size={18} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" /> : <Clock3 size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />}
          <div className="min-w-0">
            <strong className="block break-words text-fg">
              {t(offline ? COPY.waitingConnection : COPY.preparingTaskState)}
            </strong>
            <p className="mt-1 break-words leading-6">
              {offline
                ? t(experience.saveTrustRequired ? COPY.keepOpen : COPY.continueWhenOnline)
                : recoveryMessage}
            </p>
            <p className="mt-2 break-words text-xs text-fg-3">{t(experience.pagePurpose)}</p>
            <div className="mt-3 border-t border-line/60 pt-3">
              <p className="text-xs font-semibold text-fg-2">{t(COPY.browseMeanwhile)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="inline-flex min-h-9 items-center rounded-lg border border-line-strong bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {translateBilingualValueForActiveLocale("routeFallback", link.ko, link.en)}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
