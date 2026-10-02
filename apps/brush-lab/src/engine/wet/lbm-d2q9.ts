/**
 * D2Q9 격자 볼츠만(LBM) 상수와 평형 분포. MoXi(Chu & Tai 2005)의 "다공성 부분 bounce-back" 개념을
 * 수식으로 재구현했다(Expresii 코드 미참조).
 *
 * 방향 번호(GPU `lbm[]` 채널 순서와 같다):
 *   0:(0,0) 1:E(1,0) 2:S(0,1) 3:W(−1,0) 4:N(0,−1) 5:SE(1,1) 6:SW(−1,1) 7:NW(−1,−1) 8:NE(1,−1)
 * y는 아래로 증가한다(화면 좌표).
 */

export const LBM_Q = 9 as const;
export const LBM_CX = [0, 1, 0, -1, 0, 1, -1, -1, 1] as const;
export const LBM_CY = [0, 0, 1, 0, -1, 1, 1, -1, -1] as const;
/** 반대 방향 번호. */
export const LBM_OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6] as const;
/** 가중치 w_i. */
export const LBM_W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36] as const;
/** c_s² = 1/3. */
export const LBM_CS2 = 1 / 3;

/**
 * 링크 소유 클래스: 방향 i ∈ {1(E), 2(S), 5(SE), 8(NE)}는 "전방" 링크이며 출발 셀이 κ를 소유한다.
 * 나머지 {3, 4, 7, 6}은 반대 방향 OPP[i]의 같은 링크를 반대편 셀에서 본 것이다.
 */
export const LBM_FORWARD_DIRS = [1, 2, 5, 8] as const;
/** 방향 i → 링크 클래스(0..3 = E, S, SE, NE). 후방 방향은 반대 방향의 클래스다. */
export const LBM_LINK_CLASS: readonly number[] = [0, 0, 1, 0, 1, 2, 3, 2, 3];
/** 풀 스트리밍에서 방향 i의 링크 소유 셀이 상류(y = x − c_i)인가(전방) 자기 자신인가(후방). */
export const LBM_LINK_OWNER_IS_UPSTREAM: readonly boolean[] = [false, true, true, false, false, true, false, false, true];

const f = Math.fround;

/**
 * 평형 분포 f_i^eq = w_i·ρ·(1 + 3 c·u + 4.5 (c·u)² − 1.5 |u|²). 결과는 f32로 접는다.
 * out은 길이 ≥ 9 배열.
 */
export function lbmEquilibrium(rho: number, ux: number, uy: number, out: Float64Array | Float32Array | number[]): void {
  const usq = 1.5 * (ux * ux + uy * uy);
  for (let i = 0; i < LBM_Q; i += 1) {
    const cu = 3 * ((LBM_CX[i] ?? 0) * ux + (LBM_CY[i] ?? 0) * uy);
    out[i] = f((LBM_W[i] ?? 0) * rho * (1 + cu + 0.5 * cu * cu - usq));
  }
}

/** 분포의 0·1차 모멘트(밀도·운동량). */
export function lbmMoments(fi: ArrayLike<number>): { rho: number; jx: number; jy: number } {
  let rho = 0;
  let jx = 0;
  let jy = 0;
  for (let i = 0; i < LBM_Q; i += 1) {
    const v = fi[i] ?? 0;
    rho += v;
    jx += (LBM_CX[i] ?? 0) * v;
    jy += (LBM_CY[i] ?? 0) * v;
  }
  return { rho, jx, jy };
}
