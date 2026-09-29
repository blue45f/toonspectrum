/**
 * Pure manuscript-completion model for the studio workspace cinematic hero.
 * Archived manuscripts count as finished. Kept in its own module so the
 * component module only exports a component (react-refresh).
 */

export interface ManuscriptCompletion {
  readonly done: number;
  readonly total: number;
  readonly ratio: number;
}

/**
 * Pure completion model: archived manuscripts count as finished.
 * Returns null when there is nothing to measure so the hero stays clean.
 */
export function manuscriptCompletion(
  documents: ReadonlyArray<{ readonly status: string }>,
): ManuscriptCompletion | null {
  const manuscripts = documents.filter(
    (document) => document.status === "active" || document.status === "archived",
  );
  if (manuscripts.length === 0) return null;
  const done = manuscripts.filter((document) => document.status === "archived").length;
  return { done, total: manuscripts.length, ratio: done / manuscripts.length };
}
