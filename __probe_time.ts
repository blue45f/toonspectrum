import { planStudioOilRibbonCarrierIncremental, studioOilRibbonProgramsForBrush } from "./src/domains/creator/brush/studio-oil-ribbon-carrier";
import { FX_OIL_DAB_CAP, FxOilDabPlanner, type FxOilPlanInput } from "./src/domains/creator/studio-fx-brush";

function makeStroke(n: number, step = 3) {
  const points: number[] = []; const pressures: number[] = [];
  let x = 40, y = 300, heading = 0;
  for (let i = 0; i < n; i += 1) {
    heading += 0.012 + Math.sin(i * 0.03) * 0.004;
    x += Math.cos(heading) * step + Math.sin(i * 0.37) * 0.04 * step;
    y += Math.sin(heading) * step + Math.cos(i * 0.51) * 0.04 * step;
    points.push(x, y); pressures.push(0.25 + 0.7 * Math.abs(Math.sin(i * 0.004)));
  }
  return { points, pressures };
}
function planInput(n: number, s: { points: number[]; pressures: number[] }): FxOilPlanInput {
  return { points: s.points.slice(0, n * 2), pressures: s.pressures.slice(0, n), baseWidth: 22,
    seed: 20_997, maxDabs: FX_OIL_DAB_CAP, capMode: "prefix-stable-ladder-v2",
    paintBody: "oil", tipProfile: "bristle" };
}
const stroke = makeStroke(30000, 3);
const programs = studioOilRibbonProgramsForBrush("oil", 20_997);

const samples: number[] = [];
for (let trial = 0; trial < 3; trial += 1) {
  const planner = new FxOilDabPlanner();
  const draftId = `t${trial}`;
  let n = 8;
  for (; n <= 20000; n += 8) {
    const dabs = planner.plan(planInput(n, stroke));
    planStudioOilRibbonCarrierIncremental(draftId, 0, dabs, programs);
    if (dabs.length >= FX_OIL_DAB_CAP - 8) break;
  }
  let moves = 0;
  const t0 = performance.now();
  for (let k = n + 8; k <= n + 8 * 40; k += 8) {
    planStudioOilRibbonCarrierIncremental(draftId, 0, planner.plan(planInput(k, stroke)), programs);
    moves += 1;
  }
  samples.push((performance.now() - t0) / moves);
}
samples.sort((a, b) => a - b);
console.log(`캐리어 이동당 ms (min-of-3): ${samples[0]!.toFixed(2)}  [${samples.map((s) => s.toFixed(2)).join(", ")}]`);
