import { Download, Smartphone, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Link, useLocation } from "react-router-dom";

import {
  getPwaInstallServerSnapshot,
  getPwaInstallSnapshot,
  requestPwaInstall,
  subscribePwaInstall,
} from "@/shared/lib/pwa-install-store";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import "./pwa-install-nudge.css";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("pwa-install-nudge", ko, en);

const INSTALL_NUDGE_SESSION_KEY = "toonstudio:pwa-install-nudge-dismissed";

function readInstallNudgeDismissal(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(INSTALL_NUDGE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function PwaInstallNudge() {
  useBilingualI18nRevision();
  const { pathname } = useLocation();

  const pwa = useSyncExternalStore(
    subscribePwaInstall,
    getPwaInstallSnapshot,
    getPwaInstallServerSnapshot,
  );
  const [dismissed, setDismissed] = useState(readInstallNudgeDismissal);

  // Market browsing is content-first; the install prompt competes with discovery chrome there.
  // The creator home keeps the prompt, but CSS moves it above the mobile bottom navigation.
  const hideOnMarket = pathname === "/market" || pathname.startsWith("/market/");
  const iosManualInstall = pwa.platform === "ios" && !pwa.standalone;
  const promptAvailable = pwa.status === "available";

  if (hideOnMarket || (!promptAvailable && !iosManualInstall) || dismissed) return null;

  const title = iosManualInstall
    ? bi("툰스튜디오를 홈 화면에 추가하세요", "Add ToonStudio to your Home Screen")
    : bi("툰스튜디오를 앱처럼 열어보세요", "Open ToonStudio like an app");
  const description = iosManualInstall
    ? bi("iPhone·iPad에서는 Safari 공유 메뉴의 ‘홈 화면에 추가’를 사용합니다.", "On iPhone and iPad, use Add to Home Screen from Safari's Share menu.")
    : bi("홈 화면과 앱 목록에서 더 빠르게 창작을 시작할 수 있습니다.", "Launch your creative workspace faster from the home screen or app list.");
  const action = iosManualInstall ? bi("설치 방법", "Install steps") : bi("설치", "Install");
  const close = bi("설치 안내 닫기", "Dismiss install prompt");

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(INSTALL_NUDGE_SESSION_KEY, "1");
    } catch {
      // A failed convenience preference must never block the install flow.
    }
  };

  return (
    <aside
      role="status"
      aria-label={title}
      aria-describedby="pwa-install-nudge-description"
      className="pwa-install-nudge"
      data-pwa-install-nudge="true"
      data-surface={pathname === "/" ? "home" : "route"}
    >
      <div className="pwa-install-nudge__body">
        <span className="pwa-install-nudge__icon" aria-hidden="true">
          <Download size={18} />
        </span>
        <div className="pwa-install-nudge__copy">
          <strong className="pwa-install-nudge__title">{title}</strong>
          <p id="pwa-install-nudge-description" className="pwa-install-nudge__description">
            {description}
          </p>
        </div>
      </div>
      {iosManualInstall ? (
        <Link to="/studio/environment" className="pwa-install-nudge__action">
          <Smartphone size={15} aria-hidden="true" />
          {action}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => void requestPwaInstall()}
          className="pwa-install-nudge__action"
        >
          <Download size={15} aria-hidden="true" />
          {action}
        </button>
      )}
      <button
        type="button"
        aria-label={close}
        onClick={dismiss}
        className="pwa-install-nudge__close"
      >
        <X size={17} aria-hidden="true" />
      </button>
    </aside>
  );
}
