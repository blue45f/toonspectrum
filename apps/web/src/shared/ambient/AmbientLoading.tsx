import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import "./ambient-effects.css";

export interface AmbientLoadingProps {
  className?: string;
  /** "dots" | "brush" */
  variant?: "dots" | "brush";
  label?: string;
}

/**
 * 플레이풀 로딩 인디케이터.
 * - dots: 통통 튀는 세 점
 * - brush: 빙글빙글 도는 붓 (창작 분위기)
 */
export function AmbientLoading({ className, variant = "dots", label }: AmbientLoadingProps) {
  const lang = useI18n((state) => state.lang);
  const ko = lang.startsWith("ko");
  const defaultLabel = ko ? "불러오는 중" : "Loading";

  if (variant === "brush") {
    return (
      <span
        className={cn("ambient-loading-brush", className)}
        role="status"
        aria-label={label ?? defaultLabel}
      />
    );
  }

  return (
    <span className={cn("ambient-loading-dots", className)} role="status" aria-label={label ?? defaultLabel}>
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span aria-hidden="true" />
    </span>
  );
}
