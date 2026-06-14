import { AlertTriangle, RefreshCw } from "lucide-react";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

// 데이터 로드 실패 시 페이지들이 공통으로 쓰는 에러 안내 + 재시도 블록.
// role="alert"로 등장 시점에 스크린리더에 실패를 즉시 공지한다.
export function ErrorState({
  title,
  message,
  onRetry,
  className,
}: {
  title: string;
  message?: string | null;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-bad/40 bg-[oklch(0.66_0.2_25/0.12)] p-12 text-center",
        className
      )}
      role="alert"
    >
      <AlertTriangle size={24} className="mx-auto mb-3 text-bad" />
      <p className="text-sm font-medium text-fg">{title}</p>
      <p className="mt-1 text-xs text-fg-3">{message ?? "응답 데이터가 비어 있습니다."}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={buttonClass({ size: "sm", variant: "outline", className: "mt-4 gap-1.5" })}
        >
          <RefreshCw size={14} />
          다시 시도
        </button>
      )}
    </div>
  );
}
