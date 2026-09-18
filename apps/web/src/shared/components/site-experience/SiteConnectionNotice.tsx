import {
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";


import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <T,>(ko: T, en: T): T =>
  translateBilingualValueForActiveLocale("SiteConnectionNotice", ko, en);

/** Browser connectivity is not a server-health claim; never reload an unsaved form. */
export function SiteConnectionNotice() {
  useBilingualI18nRevision();
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return (
    <div role="status" aria-live="polite" className="site-connection-status">
      {offline ? <p><WifiOff size={17} aria-hidden="true" /><span>{bi("인터넷 연결이 끊겼습니다. 작성 중인 내용은 그대로 두고, 연결이 돌아오면 실패한 요청을 다시 시도해 주세요.", "You are offline. Keep this page open to preserve your input, then retry failed requests when your connection returns.")}</span></p> : null}
    </div>
  );
}
