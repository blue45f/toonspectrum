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

import { STUDIO_ICON_SIZE, STUDIO_ICON_STROKE, studioChromeIconClass } from "./studio-chrome-ui";
import { subscribeStudioCommandSearchRequests } from "./studio-help-center-channel";

import type { StudioCommandSearchDialogProps } from "./StudioCommandSearchDialog";
import type { ReactNode } from "react";

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
  /**
   * 트리거와 같은 줄 오른쪽에 붙는 크롬 버튼(예: 인스펙터 접기).
   *
   * 인스펙터는 이 줄 위에 "인스펙터 / 접기" 전용 캡션 행을 따로 갖고 있었다. 캡션은
   * 바로 아래 탭 스트립이 이미 말해 주는 정보라 세로 공간만 먹었으므로, 접기 버튼을
   * 검색 트리거 옆으로 옮기고 행 하나를 캔버스에 돌려준다.
   */
  trailing?: ReactNode;
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
  trailing,
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

  // 메뉴 › 도움말 › 명령·속성 통합 검색. 메뉴 항목은 순수 데이터라 이 상태를 직접
  // 만질 수 없으므로 채널로 요청만 받는다(§15.3 Help ▸ Command Search).
  useEffect(
    () => subscribeStudioCommandSearchRequests(() => setOpen(true)),
    [],
  );

  return (
    <>
      {hideTrigger && !trailing ? null : (
        <div
          data-studio-command-search-row="true"
          className="flex min-w-0 items-center gap-1 border-b border-line"
        >
          {hideTrigger ? null : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              data-testid="studio-command-search-trigger"
              title="명령·속성 통합 검색 (F1)"
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-3 text-left text-xs text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:min-h-9"
            >
              <Search
                size={STUDIO_ICON_SIZE.contextMenu}
                strokeWidth={STUDIO_ICON_STROKE}
                aria-hidden
                className={studioChromeIconClass({ tone: "default" })}
              />
              <span className="min-w-0 flex-1 truncate">
                기능 검색 · CSP·Photoshop 용어
              </span>
              <kbd className="shrink-0 rounded border border-line bg-card px-1.5 py-px text-[0.62rem]">
                F1
              </kbd>
            </button>
          )}
          {trailing}
        </div>
      )}
      {open ? (
        <Suspense fallback={null}>
          <StudioCommandSearchDialog {...dialogProps} open onClose={close} />
        </Suspense>
      ) : null}
    </>
  );
}
