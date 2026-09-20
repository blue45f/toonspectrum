import type { CheckedSummary } from "./use-career-public-confirmations";

export function CareerPublicConfirmation({ summary }: { summary?: CheckedSummary }) {
  if (!summary) return null;
  return <p className="rounded border border-line p-3 text-sm">상대방 확인 · {new Date(summary.confirmedAt).toLocaleDateString("ko-KR")} 응답<br />이 버전의 기여·기간·범위에 대한 팀원의 진술입니다. 신원·고용 검증이 아닙니다.<br /><span className="text-fg-3">상태 조회 {new Date(summary.checkedAt).toLocaleTimeString("ko-KR")} · {new Date(summary.expiresAt).toLocaleDateString("ko-KR")}까지 유효</span></p>;
}
