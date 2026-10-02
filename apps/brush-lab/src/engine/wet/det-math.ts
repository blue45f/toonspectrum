/**
 * 결정적 sin/cos(다항식). `Math.sin/cos`는 엔진·플랫폼 구현에 따라 마지막 비트가 달라질 수 있어
 * 습식 종이 섬유 필드(캐시 구축 시 한 번 계산)처럼 해시에 들어가는 경로는 이 함수를 쓴다.
 * 범위 축소는 `Math.round`(결정적)와 사칙연산만 쓰고, 급수는 [−π/2, π/2]에서 11차 테일러(최대 오차 < 1e-7).
 */

const TWO_PI = 6.283185307179586;
const PI = 3.141592653589793;
const HALF_PI = 1.5707963267948966;

export function detSin(x: number): number {
  let t = x - TWO_PI * Math.round(x / TWO_PI);
  if (t > HALF_PI) t = PI - t;
  else if (t < -HALF_PI) t = -PI - t;
  const t2 = t * t;
  return (
    t *
    (1 +
      t2 *
        (-1 / 6 +
          t2 * (1 / 120 + t2 * (-1 / 5040 + t2 * (1 / 362880 + t2 * (-1 / 39916800))))))
  );
}

export function detCos(x: number): number {
  return detSin(x + HALF_PI);
}
