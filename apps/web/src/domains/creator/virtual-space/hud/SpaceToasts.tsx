import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { memo } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { SpaceToast, SpaceToastTone } from "./use-space-toasts";

const TONE_ICON: Readonly<Record<SpaceToastTone, typeof Info>> = {
  info: Info,
  success: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
};

/** 최대 3개, 5초 자동 닫힘. 스크린리더에는 polite로 한 번만 읽힌다. */
export const SpaceToasts = memo(function SpaceToasts({ toasts, onDismiss }: {
  readonly toasts: readonly SpaceToast[];
  readonly onDismiss: (id: string) => void;
}) {
  const bt = useBilingual("SpaceToasts");
  return <div className="space-toasts" role="log" aria-live="polite" aria-relevant="additions" aria-label={bt("알림", "Notifications")}>
    {toasts.map((toast) => {
      const Icon = TONE_ICON[toast.tone];
      return <div key={toast.id} className="space-toast" data-tone={toast.tone}>
        <Icon size={16} aria-hidden />
        <p>{toast.message}</p>
        <button type="button" className="space-icon-button" onClick={() => onDismiss(toast.id)} aria-label={bt("알림 닫기", "Dismiss notification")}>
          <X size={16} aria-hidden />
        </button>
      </div>;
    })}
  </div>;
});
