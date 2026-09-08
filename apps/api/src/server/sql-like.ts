/** Escape a literal for a PostgreSQL LIKE expression using ESCAPE '\\'. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, String.raw`\$&`);
}

/** Match the JSON representation of a complete string in a JSON text column. */
export function jsonStringLikePattern(value: string): string {
  return `%${escapeLikePattern(JSON.stringify(value))}%`;
}
