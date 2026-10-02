import type { WetState } from "./state";

/**
 * 건조 완료 타일 정리: 물 스텝이 "계속 활성"으로 보고하지 않은 타일(젖음·부유 안료·경화 대기가 모두 없는 타일)을
 * 활성 집합에서 뺀다. 이후 침착·고정 안료(d, D)는 불변이며 타일은 재습윤될 때까지 시뮬레이션하지 않는다.
 * 안료 침착·경화(cure) 자체는 `step-water.ts`의 셀 갱신 안에서 일어난다.
 */
export function retireDriedTiles(state: WetState, processed: readonly number[], keep: ReadonlySet<number>): number {
  let dried = 0;
  for (const tile of processed) {
    if (keep.has(tile)) continue;
    if (state.active.delete(tile)) dried += 1;
  }
  return dried;
}
