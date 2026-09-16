import { MonitorUp, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { WorkflowTrustBadge } from "./WorkflowTrustBadge";

import { resolveProductLocale } from "@/shared/lib/product-identity";
import { resolveSiteRouteExperience } from "@/shared/lib/site-route-experience";
import { useI18n } from "@/shared/lib/i18n";

function useNarrowViewport() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setNarrow(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);
  return narrow;
}

function useOnlineState() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}

/**
 * Applies route UX requirements without changing page ownership. It exposes stable data attributes
 * for tests and shells, announces the route purpose, and shows only the device/recovery guidance
 * that a page cannot safely communicate by itself.
 */
export function SiteRouteExperienceBoundary({ children }: { readonly children: ReactNode }) {
  const { pathname, search } = useLocation();
  const language = useI18n((state) => state.lang);
  const locale = resolveProductLocale(language);
  const experience = useMemo(
    () => resolveSiteRouteExperience(`${pathname}${search}`),
    [pathname, search],
  );
  const narrow = useNarrowViewport();
  const online = useOnlineState();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.routeContextLevel = experience.contextLevel;
    root.dataset.routeMobilePolicy = experience.mobilePolicy;
    root.dataset.routeRecoveryPolicy = experience.recoveryPolicy;
    root.dataset.routeTerminologyScope = experience.terminologyScope;
    root.dataset.routeSaveTrust = experience.saveTrustRequired ? "required" : "optional";
    return () => {
      delete root.dataset.routeContextLevel;
      delete root.dataset.routeMobilePolicy;
      delete root.dataset.routeRecoveryPolicy;
      delete root.dataset.routeTerminologyScope;
      delete root.dataset.routeSaveTrust;
    };
  }, [experience]);

  const desktopRequired = narrow && experience.mobilePolicy === "desktop-required";
  const showOfflineGuidance = !online && experience.saveTrustRequired;

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite" key={experience.canonicalPath}>
        {experience.pagePurpose[locale]}
      </p>

      {desktopRequired ? (
        <aside
          className="mx-auto mt-3 flex w-[calc(100%-2rem)] max-w-[100rem] min-w-0 flex-wrap items-start gap-3 rounded-2xl border border-warn/35 bg-warn/10 p-3 text-sm text-fg"
          role="note"
          data-route-device-guidance="desktop-required"
        >
          <MonitorUp className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <strong className="block break-words">
              {locale === "ko" ? "정밀 편집은 큰 화면에서 지원됩니다." : "Precision editing requires a larger screen."}
            </strong>
            <p className="mt-1 break-words text-xs leading-5 text-fg-2">
              {locale === "ko"
                ? "모바일에서는 보기와 검토를 중심으로 사용할 수 있습니다. 키보드·펜을 사용할 수 있는 환경에서 편집을 이어가세요."
                : "Use mobile for viewing and review, then continue editing with a keyboard or pen on a larger screen."}
            </p>
          </div>
          <Link className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-line px-3 text-xs font-semibold text-fg hover:bg-raised" to={experience.helpPath}>
            {locale === "ko" ? "지원 범위 보기" : "View support"}
          </Link>
        </aside>
      ) : null}

      {showOfflineGuidance ? (
        <aside
          className="mx-auto mt-3 flex w-[calc(100%-2rem)] max-w-[100rem] min-w-0 flex-wrap items-start gap-3 rounded-2xl border border-warn/35 bg-panel p-3 text-sm text-fg"
          role="status"
          aria-live="polite"
          data-route-recovery-guidance="offline"
        >
          <WifiOff className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <WorkflowTrustBadge state="offline-pending" locale={locale} />
            <p className="mt-2 break-words text-xs leading-5 text-fg-2">
              {locale === "ko"
                ? "저장 상태 표시에서 현재 변경 내용이 이 기기에 보관됐는지 확인하세요. 연결이 돌아오면 지원되는 작업은 다시 동기화됩니다."
                : "Check the workspace save status to confirm whether current changes are stored on this device. Supported work can sync after reconnection."}
            </p>
          </div>
        </aside>
      ) : null}

      {children}
    </>
  );
}
