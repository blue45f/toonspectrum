/** Compare a JSON value with a bounded canonical contract without walking unknown subtrees. */
export function sameBrushStudioData(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) return true;
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length
      && Object.keys(actual).length === expected.length
      && expected.every((entry, index) => Object.hasOwn(actual, index)
        && sameBrushStudioData(actual[index], entry));
  }
  if (!expected || typeof expected !== "object" || !actual || typeof actual !== "object"
    || Array.isArray(actual)) return false;
  const prototype = Object.getPrototypeOf(actual);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const record = actual as Record<string, unknown>;
  const entries = Object.entries(expected);
  return Object.keys(record).length === entries.length && entries.every(([key, value]) =>
    Object.hasOwn(record, key) && sameBrushStudioData(record[key], value));
}
