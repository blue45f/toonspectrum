import type { compareLanes } from "../../bench/runner/ab-compare";
import type { runFixture } from "../../bench/runner/run-fixture";

/**
 * bench 러너 반환 타입. bench가 타입 이름을 바꾸더라도 UI가 깨지지 않도록
 * 함수 시그니처에서 유도한다.
 */
export type RunResult = Awaited<ReturnType<typeof runFixture>>;
export type AbComparison = ReturnType<typeof compareLanes>;
