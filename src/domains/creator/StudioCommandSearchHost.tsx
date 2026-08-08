/**
 * 통합 Command Search 진입점 — 버튼 하나와 **F1** 바인딩.
 *
 * 감사 §2.8 이 "F1 바인딩 없음(`?` 뿐)"을 도움말 결함으로 따로 적었다. 레포
 * 전체에서 `F1` 을 잡는 코드가 0건이었으므로 충돌 없이 새로 잡을 수 있다.
 * 이 호스트는 인스펙터 안에 마운트되지만 리스너는 `window` 에 걸어서, 캔버스에
 * 포커스가 있어도 F1 이 통한다.
 *
 * 다이얼로그 본체는 lazy 로 가져온다 — 검색을 한 번도 열지 않은 세션이 색인과
 * 다이얼로그 코드를 지불하지 않게 하기 위해서다.
 */

import { Search } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useState } from "react";

import type { StudioCommandSearchDialogProps } from "./StudioCommandSearchDialog";

const StudioCommandSearchDialog = lazy(() =>
  import("./StudioCommandSearchDialog").then((module) => ({
    default: module.StudioCommandSearchDialog,
  })),
);

export type StudioCommandSearchHostProps = Omit<
  StudioCommandSearchDialogProps,
  "open" | "onClose"
> & {
  /** 트리거 버튼을 숨기고 F1 만 남긴다(모바일 등). */
  hideTrigger?: boolean;
};

/**
 * 편집 중인 입력 요소 안에서는 F1 을 가로채지 않는다 — 텍스트 편집기 안에서
 * 브라우저 기본 도움말을 막아 버리면 그게 더 나쁜 놀람이다.
 */
function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function StudioCommandSearchHost({
  hideTrigger = false,
  ...dialogProps
}: StudioCommandSearchHostProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F1") return;
      if (event.defaultPrevented) return;
      if (!open && isEditingTarget(event.target)) return;
      event.preventDefault();
      setOpen((previous) => !previous);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      {hideTrigger ? null : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="studio-command-search-trigger"
          title="명령·속성 통합 검색 (F1)"
          className="flex min-h-11 w-full items-center gap-2 border-b border-line px-3 text-left text-xs text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Search size={14} aria-hidden className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            기능 검색 · CSP·Photoshop 용어
          </span>
          <kbd className="shrink-0 rounded border border-line bg-card px-1.5 py-px text-[0.62rem]">
            F1
          </kbd>
        </button>
      )}
      {open ? (
        <Suspense fallback={null}>
          <StudioCommandSearchDialog {...dialogProps} open onClose={close} />
        </Suspense>
      ) : null}
    </>
  );
}
