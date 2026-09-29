import { Badge } from "./chip";

/**
 * 베타 기능 표식. AI 보조처럼 성숙도가 낮은 표면에만 붙이고, 안정화된 기능에는
 * 달지 않는다. 색상과 무관하게 "베타" 문자로 상태를 전달한다.
 */
export function BetaBadge({
  title = "베타 기능 — 동작과 결과가 바뀔 수 있습니다.",
  className,
}: {
  title?: string;
  className?: string;
}) {
  return (
    <span title={title} data-beta-badge="true" className="inline-flex shrink-0">
      <Badge tone="warn" className={className}>
        베타
      </Badge>
    </span>
  );
}
