import { RefreshCw } from "lucide-react";

import { formatMarketDateTime } from "./market-kind";

interface StaleNoticeBarProps {
  readonly savedAt: string;
  readonly onRetry: () => void;
  readonly className?: string;
}

/**
 * 네트워크 실패 시 저장된 목록을 보여주는 저하 상태 알림. role="status"로
 * 스크린리더에 조용히 공지하고, 재시도는 항상 접근 가능한 버튼으로 제공한다.
 */
export function StaleNoticeBar({ savedAt, onRetry, className }: StaleNoticeBarProps) {
  return (
    <div
      role="status"
      className={
        className
        ?? "flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2"
      }
    >
      <span>
        연결이 불안정해 {formatMarketDateTime(savedAt)}에 저장된 목록을 보여드리고 있어요
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex shrink-0 items-center gap-1 rounded border border-line bg-panel px-2 py-1 font-medium text-fg-2 transition-colors duration-150 hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
      >
        <RefreshCw className="h-3 w-3" aria-hidden="true" />
        다시 시도
      </button>
    </div>
  );
}
