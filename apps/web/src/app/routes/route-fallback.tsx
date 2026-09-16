import { Clock3, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { LoadingState } from "@/shared/components/LoadingState";
import { useI18n, useT } from "@/shared/lib/i18n";

/**
 * Route loading fallback mirrors the eventual page structure. When a chunk or loader takes longer
 * than a normal transition, it also explains what is happening instead of leaving an endless
 * silent skeleton. RouteStage owns the final recovery controls after the longer timeout.
 */
export function RouteFallback() {
  const t = useT();
  const language = useI18n((state) => state.lang);
  const korean = language.toLowerCase().split(/[-_]/u)[0] === "ko";
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

  return (
    <div data-route-loading-fallback="" className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
      <LoadingState variant="cards" label={t("common.loading")} />
      {delayed ? (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-line bg-panel/75 p-4 text-sm text-fg-2" role="status" aria-live="polite">
          {offline ? <WifiOff size={18} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" /> : <Clock3 size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />}
          <div>
            <strong className="block text-fg">{offline
              ? (korean ? "인터넷 연결을 기다리고 있어요." : "Waiting for your connection.")
              : (korean ? "화면 구성 요소를 준비하고 있어요." : "Preparing this page’s components.")}</strong>
            <p className="mt-1 leading-6">{offline
              ? (korean ? "작성 중인 내용은 그대로 두고 연결이 돌아오면 다시 확인합니다." : "Keep this page open; loading can continue when the connection returns.")
              : (korean ? "조금 더 걸리면 새로고침과 전체 메뉴 이동 버튼을 안내합니다." : "Recovery controls will appear if this continues much longer.")}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
