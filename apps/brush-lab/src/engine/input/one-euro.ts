/**
 * 1€ 필터(Casiez, Roussel, Vogel 2012). 논문 수식에서 자체 구현.
 * 속도가 빠를수록 차단 주파수를 올려 지연을 줄이고, 느릴수록 낮춰 떨림을 억제한다.
 */
export interface OneEuroParams {
  /** 최소 차단 주파수(Hz). */
  minCutoff: number;
  /** 속도 계수. */
  beta: number;
  /** 미분 신호 차단 주파수(Hz). */
  dCutoff: number;
}

const TWO_PI = Math.PI * 2;

function smoothingFactor(cutoffHz: number, dtS: number): number {
  const tau = 1 / (TWO_PI * cutoffHz);
  return 1 / (1 + tau / dtS);
}

export class OneEuroFilter {
  private params: OneEuroParams;
  private hasPrev = false;
  private prevT = 0;
  private prevX = 0;
  private prevDx = 0;

  constructor(params: OneEuroParams) {
    this.params = { ...params };
  }

  setParams(p: OneEuroParams): void {
    this.params = { ...p };
  }

  reset(): void {
    this.hasPrev = false;
    this.prevT = 0;
    this.prevX = 0;
    this.prevDx = 0;
  }

  /** 첫 호출은 입력을 그대로 돌려준다(지연 0 시작). */
  filter(value: number, tMs: number): number {
    if (!this.hasPrev) {
      this.hasPrev = true;
      this.prevT = tMs;
      this.prevX = value;
      this.prevDx = 0;
      return value;
    }
    const dtMs = tMs - this.prevT;
    const dtS = Math.max(dtMs, 1e-3) / 1000;
    const rawDx = (value - this.prevX) / dtS;
    const aD = smoothingFactor(this.params.dCutoff, dtS);
    const dx = this.prevDx + aD * (rawDx - this.prevDx);
    const cutoff = this.params.minCutoff + this.params.beta * Math.abs(dx);
    const a = smoothingFactor(cutoff, dtS);
    const x = this.prevX + a * (value - this.prevX);
    this.prevT = tMs;
    this.prevX = x;
    this.prevDx = dx;
    return x;
  }

  /** 현재 필터 출력(없으면 null). */
  current(): number | null {
    return this.hasPrev ? this.prevX : null;
  }
}
