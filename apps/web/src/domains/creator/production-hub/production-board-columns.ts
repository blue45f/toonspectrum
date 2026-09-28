import { BOARD_COLUMNS, moveProductionItem } from "./production-workboard-model";

/** 알 수 없는 URL 값은 무시하되 누락된 상태를 보드에서 숨기지 않는다. */
export function orderedProductionColumns(raw: string | null) {
  const ids = [...new Set((raw ?? "").slice(0, 500).split(","))];
  const known = ids.flatMap((id) => BOARD_COLUMNS.find((column) => column.id === id) ?? []);
  return [...known, ...BOARD_COLUMNS.filter((column) => !ids.includes(column.id))];
}
export function collapsedProductionColumns(raw: string | null): readonly string[] {
  return [...new Set((raw ?? "").slice(0, 500).split(","))].filter((id) => BOARD_COLUMNS.some((column) => column.id === id));
}
export function reorderProductionColumn(raw: string | null, id: string, to: number): string {
  const columns = orderedProductionColumns(raw);
  return moveProductionItem(columns, columns.findIndex((column) => column.id === id), to).map((column) => column.id).join(",");
}
