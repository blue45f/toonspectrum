/**
 * 하단 페이지 스트립의 키보드 규칙(순수 함수).
 *
 * - ←/→: 이웃 페이지로 초점 이동, Home/End: 처음·끝 페이지로 초점 이동 (페이지 전환은 Enter/Space)
 * - Alt+←/→: 선택한 페이지를 한 칸 앞·뒤로, Shift+Alt+←/→: 맨 앞·맨 뒤로 (레이어 목록의 Alt+↑/↓ 규칙과 같은 결)
 * - 오른쪽→왼쪽 문서(rtl)에서는 ←/→의 앞·뒤가 뒤집힌다.
 * Ctrl/Meta 조합은 브라우저·편집기 전역 단축키의 몫이라 건드리지 않는다.
 */
export interface StudioPageStripKeyInput {
  readonly key: string;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  /** 키가 눌린 페이지의 index. */
  readonly index: number;
  readonly count: number;
  readonly rtl: boolean;
  /** 호스트가 순서 바꾸기를 허용하는지(검토 잠금·협업 잠금이면 false). */
  readonly canReorder: boolean;
}

export type StudioPageStripKeyAction =
  /** 초점만 옮긴다(이미 끝이면 같은 index). */
  | { readonly kind: "focus"; readonly index: number }
  /** 페이지를 `index` 자리로 옮긴다. */
  | { readonly kind: "reorder"; readonly index: number }
  /** 이미 맨 앞·맨 뒤라 옮길 곳이 없다 — 키는 소비하되 문서는 그대로. */
  | { readonly kind: "edge"; readonly edge: "start" | "end" };

const clampIndex = (index: number, count: number): number =>
  Math.max(0, Math.min(count - 1, index));

export function resolveStudioPageStripKeyAction(
  input: StudioPageStripKeyInput,
): StudioPageStripKeyAction | null {
  const { key, altKey, shiftKey, ctrlKey, metaKey, index, count, rtl, canReorder } = input;
  if (count <= 0 || index < 0 || index >= count) return null;
  if (ctrlKey || metaKey) return null;

  const horizontal = key === "ArrowLeft" || key === "ArrowRight";
  if (altKey) {
    // 순서 바꾸기는 Alt+←/→(+Shift)만 소유한다. 막힌 상태에서는 브라우저 기본 동작에 맡긴다.
    if (!horizontal || !canReorder) return null;
    const forward = (key === "ArrowRight") !== rtl;
    if (shiftKey) {
      const target = forward ? count - 1 : 0;
      return target === index ? { kind: "edge", edge: forward ? "end" : "start" } : { kind: "reorder", index: target };
    }
    const target = index + (forward ? 1 : -1);
    if (target < 0) return { kind: "edge", edge: "start" };
    if (target >= count) return { kind: "edge", edge: "end" };
    return { kind: "reorder", index: target };
  }
  if (shiftKey) return null;

  if (horizontal) {
    const forward = (key === "ArrowRight") !== rtl;
    return { kind: "focus", index: clampIndex(index + (forward ? 1 : -1), count) };
  }
  if (key === "Home") return { kind: "focus", index: 0 };
  if (key === "End") return { kind: "focus", index: count - 1 };
  return null;
}
