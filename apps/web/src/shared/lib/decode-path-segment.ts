/** Decode a raw URL pathname segment exactly once, tolerating malformed shared URLs.
 * React Router useParams() values are already decoded and must NOT use this helper.
 */
export function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
