import type { FrictionSpec } from "./physics-model";

/**
 * 마찰·종이 결. 진행 방향이 섬유 방향과 나란하면 마찰이 최대(mu0 + muGrain),
 * 수직이면 최소(mu0). 마찰은 흐름을 줄이고(flowScale) 미세 떨림 진폭을 낸다(jitterAmp).
 */

const f = Math.fround;

export interface FrictionOutput {
  mu: number;
  jitterAmp: number;
  flowScale: number;
}

/** dir은 단위 벡터, paperDir은 섬유 방향(rad). */
export function friction(
  dirX: number,
  dirY: number,
  paperDir: number,
  spec: FrictionSpec,
): FrictionOutput {
  const px = Math.cos(paperDir);
  const py = Math.sin(paperDir);
  const align = Math.abs(dirX * px + dirY * py);
  const mu = f(spec.mu0 + spec.muGrain * align);
  const flow = 1 - mu * spec.flowLoss;
  return { mu, jitterAmp: f(mu * spec.jitterGain), flowScale: f(flow < 0 ? 0 : flow) };
}
