// 카드 격자 — 처음에는 한 화면 분량만 그리고 "더 보기"로 이어 붙인다.
// 항목이 수십 개여도 첫 화면과 페이지 길이가 늘어나지 않고, 화면 밖 카드를 한꺼번에 그리지 않는다.
import { ChevronDown } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";

export function ShowcaseMoreGrid<T>({
  items,
  itemKey,
  renderItem,
  resetKey,
  initial,
  step,
  className,
  moreLabel,
}: {
  readonly items: readonly T[];
  readonly itemKey: (item: T) => string;
  readonly renderItem: (item: T) => ReactNode;
  /** 목록 조건(정렬·필터·탭)이 바뀌면 달라지는 값 — 바뀌면 다시 처음 분량으로 돌아간다. */
  readonly resetKey: string;
  /** 처음에 보여 줄 개수. */
  readonly initial: number;
  /** "더 보기"를 한 번 누를 때 늘어나는 개수. */
  readonly step: number;
  /** 격자 열 구성(예: "grid grid-cols-2 gap-3 sm:grid-cols-3"). */
  readonly className: string;
  /** 남은 개수를 받아 버튼 이름을 만든다(예: "더 보기 · 남은 작품 6개"). */
  readonly moreLabel: (remaining: number) => string;
}) {
  const [shown, setShown] = useState({ resetKey, count: initial });
  const count = shown.resetKey === resetKey ? shown.count : initial;
  const visible = items.slice(0, count);
  const remaining = items.length - visible.length;

  return (
    <>
      <div className={className}>
        {visible.map((item) => (
          <Fragment key={itemKey(item)}>{renderItem(item)}</Fragment>
        ))}
      </div>
      {remaining > 0 ? (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setShown({ resetKey, count: count + step })}
            className={buttonClass({ size: "md", variant: "outline", className: "gap-1.5" })}
          >
            <ChevronDown size={16} aria-hidden />
            {moreLabel(remaining)}
          </button>
        </div>
      ) : null}
    </>
  );
}
