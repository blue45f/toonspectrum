export interface StudioLayerKeyboardRow {
  readonly key: string;
  readonly label: string;
  readonly itemIds: readonly string[];
}

/** Range follows the displayed tree. A collapsed folder remains one selectable unit. */
export function selectStudioLayerKeyboardRange({
  rows,
  anchorKey,
  targetKey,
  selectedIds,
  additive,
}: {
  readonly rows: readonly StudioLayerKeyboardRow[];
  readonly anchorKey: string;
  readonly targetKey: string;
  readonly selectedIds: readonly string[];
  readonly additive: boolean;
}): string[] {
  const anchor = rows.findIndex((row) => row.key === anchorKey);
  const target = rows.findIndex((row) => row.key === targetKey);
  if (anchor < 0 || target < 0) return [...selectedIds];
  const range = rows
    .slice(Math.min(anchor, target), Math.max(anchor, target) + 1)
    .flatMap((row) => row.itemIds);
  return [...new Set(additive ? [...selectedIds, ...range] : range)].slice(0, 500);
}

export interface StudioLayerTypeaheadState {
  readonly query: string;
  readonly at: number;
}

/** Repeated letters cycle; a quick prefix keeps the current matching row in consideration. */
export function findStudioLayerTypeahead({
  rows,
  currentKey,
  key,
  previous,
  now,
}: {
  readonly rows: readonly StudioLayerKeyboardRow[];
  readonly currentKey: string;
  readonly key: string;
  readonly previous: StudioLayerTypeaheadState | null;
  readonly now: number;
}): { state: StudioLayerTypeaheadState; key: string | null } {
  const letter = key.normalize("NFKC").toLocaleLowerCase();
  const continued = previous !== null && now - previous.at < 700;
  const query = continued ? previous.query + letter : letter;
  const repeated = [...query].every((character) => character === letter);
  const prefix = repeated ? letter : query;
  const start = Math.max(0, rows.findIndex((row) => row.key === currentKey));
  const offset = continued && !repeated ? 0 : 1;
  for (let step = 0; step < rows.length; step += 1) {
    const row = rows[(start + offset + step) % rows.length]!;
    if (row.label.normalize("NFKC").trimStart().toLocaleLowerCase().startsWith(prefix)) {
      return { state: { query, at: now }, key: row.key };
    }
  }
  return { state: { query, at: now }, key: null };
}
