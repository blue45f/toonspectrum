// Date formatting helpers for the production command center.
// Kept out of StudioProductionUi.tsx so that file only exports components
// (react-refresh/only-export-components).

export function formatStudioProductionDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    ...(value.length === 10 ? {} : { hour: "2-digit", minute: "2-digit" }),
  }).format(date);
}

export function studioProductionRelativeDate(
  value: string,
  nowIso = new Date().toISOString(),
): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  const now = new Date(nowIso);
  if (Number.isNaN(date.getTime()) || Number.isNaN(now.getTime())) return value;
  const days = Math.round((date.getTime() - now.getTime()) / 86_400_000);
  if (days === 0) return "오늘";
  if (days === 1) return "내일";
  if (days === -1) return "어제";
  if (days > 1) return `${days}일 후`;
  return `${Math.abs(days)}일 지남`;
}
