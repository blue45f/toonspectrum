/**
 * 이 브라우저가 3D 화면(WebGL 2)을 못 열 때 작업대 맨 위에 띄우는 안내.
 *
 * 뷰포트 안의 경고만으로는 큐브를 만든 뒤에야 알게 되므로, 열자마자 원인과 해결 순서를 알려 준다.
 * 편집 데이터는 화면 그리기와 무관하게 안전하다는 점도 함께 밝힌다.
 */
import { AlertTriangle, RefreshCw } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export interface StudioHybridDccEnvironmentNoticeProps {
  /** 설정을 바꾼 뒤 새로 고치지 않고 다시 확인해 본다. */
  readonly onRecheck: () => void;
}

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function StudioHybridDccEnvironmentNotice({ onRecheck }: StudioHybridDccEnvironmentNoticeProps) {
  const bt = useBilingual("StudioHybridDccEnvironmentNotice");
  const steps: readonly string[] = [
    bt(
      "브라우저 설정에서 ‘하드웨어 가속 사용’을 켭니다.",
      "Turn on “Use hardware acceleration” in your browser settings.",
    ),
    bt("브라우저를 새로 고치거나 다시 엽니다.", "Reload or restart the browser."),
    bt(
      "그래도 안 되면 최신 Chrome·Edge·Safari 데스크톱에서 열어 주세요.",
      "If it still fails, open this in a recent desktop Chrome, Edge or Safari.",
    ),
  ];

  return (
    <div
      role="alert"
      data-studio-hybrid-dcc-webgl-notice="true"
      className="flex flex-col gap-3 rounded-2xl border border-warn/45 bg-warn/10 p-4 text-sm text-fg-2 sm:flex-row sm:items-start"
    >
      <AlertTriangle size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-fg [word-break:keep-all]">
          {bt("이 브라우저에서는 3D 화면을 열 수 없습니다", "This browser can't show the 3D view")}
        </p>
        <p className="mt-1 leading-relaxed [word-break:keep-all]">
          {bt(
            "그래픽 가속(WebGL 2)을 쓸 수 없어 오브젝트를 화면에 그릴 수 없습니다. 이 기기에 저장된 작업은 그대로 안전합니다.",
            "Graphics acceleration (WebGL 2) isn't available, so objects can't be drawn. Work saved on this device is untouched.",
          )}
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 leading-relaxed [word-break:keep-all]">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      <button
        type="button"
        onClick={onRecheck}
        className={cn(
          "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-line-strong bg-card px-4 text-sm font-semibold text-fg hover:bg-raised",
          FOCUS_RING,
        )}
      >
        <RefreshCw size={15} aria-hidden="true" />
        {bt("다시 확인", "Check again")}
      </button>
    </div>
  );
}
