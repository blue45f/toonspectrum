/**
 * 독자 뷰 토글 버튼 — 에디터 툴바(툴벨트 유틸리티 버튼 행)에 놓이는 진입점.
 *
 * 프레젠테이션 전용: 열림 상태는 호출자(StudioCuttoonEditorHost)가 소유하고,
 * 이 버튼은 `pressed`/`onToggle` 계약만 받는다. 아이콘은 북 리더 형태(BookOpenText)로
 * 기존 "세로 스크롤 미리보기"(Smartphone)와 시각적으로 구분한다.
 */
import { BookOpenText } from "lucide-react";
import type { ReactElement } from "react";

import { STUDIO_ICON_SIZE, STUDIO_ICON_STROKE, studioChromeIconClass } from "../studio-chrome-ui";
import { studioToolButtonClass } from "../studio-panel-ui";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import "./reader-preview-i18n";

export interface ReaderViewToggleProps {
  /** 패널 열림 여부 — aria-pressed 와 활성 스타일에 쓴다. */
  readonly pressed: boolean;
  readonly onToggle: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function ReaderViewToggle({
  pressed,
  onToggle,
  disabled = false,
  className,
}: ReaderViewToggleProps): ReactElement {
  const t = useT();
  const label = t("reader.preview.toggleLabel");
  const hint = t("reader.preview.toggleHint");

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      title={hint}
      className={cn(
        studioToolButtonClass(pressed, { dense: true }),
        "pointer-coarse:min-w-11 pointer-coarse:justify-center disabled:opacity-40",
        className,
      )}
    >
      <BookOpenText
        size={STUDIO_ICON_SIZE.toolCompact}
        strokeWidth={STUDIO_ICON_STROKE}
        aria-hidden
        className={studioChromeIconClass({ active: pressed, disabled })}
      />
    </button>
  );
}
