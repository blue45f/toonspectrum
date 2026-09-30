/**
 * 축 방향 표시의 순수 계산. 뷰 행렬(월드→카메라, column-major 4×4)의 회전 부분에서
 * 월드 축 단위 벡터를 화면에 투영한다.
 */

export const CHARACTER_AXIS_GIZMO_SIZE = 64;
export const CHARACTER_AXIS_GIZMO_CENTER = CHARACTER_AXIS_GIZMO_SIZE / 2;
const AXIS_LENGTH = 21;

export const CHARACTER_AXES = ["x", "y", "z"] as const;

export interface CharacterAxisProjection {
  readonly axis: (typeof CHARACTER_AXES)[number];
  /** SVG 좌표(아래가 +y) 기준 축 끝점. */
  readonly x: number;
  readonly y: number;
  /** 카메라 쪽으로 향할수록 큰 값. 뒤에 있는 축을 먼저 그린다. */
  readonly depth: number;
}

/** 깊이 순으로 정렬해 앞에 있는 축이 나중에 그려지게 한다. */
export function projectCharacterAxes(viewElements: ArrayLike<number>): readonly CharacterAxisProjection[] {
  return CHARACTER_AXES.map((axis, index) => {
    const column = index * 4;
    const viewX = Number(viewElements[column] ?? 0);
    const viewY = Number(viewElements[column + 1] ?? 0);
    const viewZ = Number(viewElements[column + 2] ?? 0);
    return {
      axis,
      x: CHARACTER_AXIS_GIZMO_CENTER + viewX * AXIS_LENGTH,
      y: CHARACTER_AXIS_GIZMO_CENTER - viewY * AXIS_LENGTH,
      depth: viewZ,
    };
  }).toSorted((left, right) => left.depth - right.depth);
}
