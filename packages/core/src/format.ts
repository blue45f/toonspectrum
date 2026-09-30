// 사용자 노출 숫자는 브라우저 기본 로케일에 맡기지 않고 항상 ko-KR 천 단위 구분으로 표시한다.
// (무인자 toLocaleString() 호출 대체용 공용 헬퍼 — i18n 감사 36번 티켓)
const koNumberFormatter = new Intl.NumberFormat("ko-KR");

// 1234567 -> "1,234,567"
export function formatNumber(n: number): string {
  return koNumberFormatter.format(n);
}

// 12345 -> "1.2만", 123456789 -> "1.2억", 980 -> "980"
export function formatCount(n: number): string {
  if (n >= 1e8) {
    const v = n / 1e8;
    return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")}억`;
  }
  if (n >= 1e4) {
    const v = n / 1e4;
    return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")}만`;
  }
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}천`;
  return String(n);
}
