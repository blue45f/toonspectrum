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
