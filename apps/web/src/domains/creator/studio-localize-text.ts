/**
 * Studio's translate-or-keep-the-authored-copy helper.
 *
 * The UI translator humanizes unknown keys. Supply the authored fallback explicitly so
 * a missing lazy dictionary cannot silently replace useful copy with a key-derived label.
 * The raw-key check remains compatible with injected legacy resolvers and test doubles.
 */
export function localizeStudioText(
  t: (key: string, fallback?: string) => string,
  fallback: string,
  key: string,
): string {
  const translated = t(key, fallback);
  return translated === key ? fallback : translated;
}
