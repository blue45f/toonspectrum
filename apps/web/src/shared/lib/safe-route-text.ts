/** A malformed percent escape must never crash route titles or anchor navigation. */
export function safeDecodeRouteText(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}
