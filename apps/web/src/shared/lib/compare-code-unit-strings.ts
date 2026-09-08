/** Preserve exact UTF-16 ordering for identifiers and persisted metadata, independent of locale. */
export function compareCodeUnitStrings(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
