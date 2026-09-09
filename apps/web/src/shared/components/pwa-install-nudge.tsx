import { Download, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import {
  getPwaInstallServerSnapshot,
  getPwaInstallSnapshot,
  requestPwaInstall,
  subscribePwaInstall,
} from "@/shared/lib/pwa-install-store";
import { useI18n } from "@/shared/lib/i18n";

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
  const language = useI18n((state) => state.lang);
  const locale = language.toLowerCase().startsWith("ko") ? "ko" : "en";
  const pwa = useSyncExternalStore(
    subscribePwaInstall,
    getPwaInstallSnapshot,
    getPwaInstallServerSnapshot,
  );
  const [dismissed, setDismissed] = useState(readInstallNudgeDismissal);

  if (pwa.status !== "available" || dismissed) return null;

  const title = locale === "ko" ? "툰스튜디오를 앱처럼 열어보세요" : "Open ToonStudio like an app";
  const description = locale === "ko"
    ? "홈 화면과 앱 목록에서 더 빠르게 창작을 시작할 수 있습니다."
    : "Launch your creative workspace faster from the home screen or app list.";
  const action = locale === "ko" ? "설치" : "Install";
  const close = locale === "ko" ? "설치 안내 닫기" : "Dismiss install prompt";

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
      className="fixed right-3 top-[4.85rem] z-40 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-line-strong bg-panel/95 p-3 shadow-2xl backdrop-blur-2xl motion-safe:animate-fade-up sm:right-5 sm:top-[5.15rem]"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/35 bg-accent-soft text-accent">
          <Download size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block text-sm text-fg">{title}</strong>
          <p className="mt-1 text-xs leading-5 text-fg-3">{description}</p>
          <button
            type="button"
            onClick={() => void requestPwaInstall()}
            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-fg px-3 py-2 text-xs font-bold text-canvas transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Download size={15} aria-hidden="true" />{action}
          </button>
        </div>
        <button
          type="button"
          aria-label={close}
          onClick={dismiss}
          className="grid size-10 shrink-0 place-items-center rounded-xl text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
