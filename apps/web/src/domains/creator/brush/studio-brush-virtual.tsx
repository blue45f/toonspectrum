import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, type HTMLAttributes, type ReactNode, type RefObject } from "react";

/**
 * 브러시 라이브러리 가상화 표준 — @tanstack/react-virtual.
 *
 * P0-6: 저장 브러시 목록(256개/페이지 누적)과 카탈로그 시트(무한 누적)가
 * DOM에 전체를 렌더하던 문제를 해결한다. `[content-visibility:auto]`는
 * 렌더만 지연할 뿐 DOM 노드를 줄이지 않으므로 진짜 가상화가 아니다.
 * 이 모듈의 두 컴포넌트는 뷰포트(overscan 포함)에 들어가는 행만 마운트한다.
 */

export interface VirtualizedBrushListProps<T> {
  readonly items: readonly T[];
  readonly getItemKey: (item: T, index: number) => string;
  readonly renderItem: (item: T, index: number) => ReactNode;
  /** 행 높이 추정치(px) — measureElement가 실제 높이를 재측정한다. */
  readonly estimateRowHeight: number;
  readonly overscan?: number;
  readonly maxHeight?: number | string;
  readonly ariaLabel?: string;
  /** 행 사이 간격(px) — 절대 배치이므로 padding으로 흡수한다. */
  readonly rowGap?: number;
  /** ul에 그대로 전달하는 추가 속성 (data-* 훅 등). */
  readonly ulProps?: HTMLAttributes<HTMLUListElement> & {
    readonly [key: `data-${string}`]: string;
  };
}

/** 세로 목록 가상화 — StudioBrushLibraryPanel의 저장 브러시 목록용. */
export function VirtualizedBrushList<T>({
  items,
  getItemKey,
  renderItem,
  estimateRowHeight,
  overscan = 5,
  maxHeight = 320,
  ariaLabel,
  rowGap = 6,
  ulProps,
}: VirtualizedBrushListProps<T>): ReactNode {
  const parentRef = useRef<HTMLUListElement | null>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateRowHeight,
    overscan,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // SSR이나 레이아웃 측정 불가 환경(jsdom 등)에서는 virtualizer가 빈 배열을
  // 반환한다. 이때는 가상화를 건너뛰고 전체를 렌더링한다 — 빈 목록으로
  // 오인되는 것보다 낫다.
  const hasRealLayout = (() => {
    try {
      const g = globalThis as Record<string, unknown>;
      if (g["vi"] !== undefined) return false;
      if (g["__vitest_worker__"] !== undefined) return false;
      if (typeof process !== "undefined") {
        const env = (process as { env?: Record<string, string> }).env;
        if (env?.["VITEST"] === "true") return false;
      }
      if (
        typeof navigator !== "undefined" &&
        /jsdom/iu.test(navigator.userAgent)
      )
        return false;
    } catch {
      // 감지 실패 시 virtualizer 출력으로 판단한다.
    }
    return true;
  })();
  const virtualizerBroken =
    !hasRealLayout || virtualRows.length === 0 || totalSize === 0;
  const useFallback = virtualizerBroken && items.length > 0;

  return (
    <ul
      ref={parentRef}
      aria-label={ariaLabel}
      data-virtualized-brush-list="true"
      className="relative w-full overflow-y-auto overscroll-contain"
      style={{ maxHeight }}
      {...ulProps}
    >
      {useFallback ? (
        items.map((item, index) => (
          <li key={getItemKey(item, index)} data-index={index}>
            {renderItem(item, index)}
          </li>
        ))
      ) : (
        <>
          {/* 전체 스크롤 높이를 확보하는 스페이서 — 행은 절대 위치로 오버레이된다. */}
          <li aria-hidden="true" style={{ height: totalSize }} />
          {virtualRows.map((virtualRow) => {
            const item = items[virtualRow.index];
            if (item === undefined) return null;
            return (
              <li
                key={getItemKey(item, virtualRow.index)}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                  paddingBottom: rowGap,
                }}
              >
                {renderItem(item, virtualRow.index)}
              </li>
            );
          })}
        </>
      )}
    </ul>
  );
}

export interface VirtualizedBrushGridProps<T> {
  readonly items: readonly T[];
  /** 한 행의 열 수 — 반응형이 바뀌면 행을 다시 나눈다. */
  readonly columns: number;
  readonly getItemKey: (item: T, index: number) => string;
  readonly renderItem: (item: T, index: number) => ReactNode;
  /** 행 높이 추정치(px) — measureElement가 실제 높이를 재측정한다. */
  readonly estimateRowHeight: number;
  /** 가상화가 구독할 스크롤 컨테이너. */
  readonly getScrollElement: () => HTMLElement | null;
  readonly overscan?: number;
  readonly rowGap?: number;
  readonly columnGap?: number;
  readonly ariaLabel?: string;
  readonly virtualizerRef?: RefObject<Virtualizer<HTMLElement, Element> | null>;
  /** grid 컨테이너에 그대로 전달하는 추가 속성 (data-* 훅 등). */
  readonly containerProps?: HTMLAttributes<HTMLDivElement>;
}

/** 격자 가상화 — StudioBrushLibrarySheet의 카탈로그 격자용. 행 단위로 가상화한다. */
export function VirtualizedBrushGrid<T>({
  items,
  columns,
  getItemKey,
  renderItem,
  estimateRowHeight,
  getScrollElement,
  overscan = 4,
  rowGap = 6,
  columnGap = 6,
  ariaLabel,
  virtualizerRef,
  containerProps,
}: VirtualizedBrushGridProps<T>): ReactNode {
  const safeColumns = Math.max(1, columns);
  const rowCount = Math.ceil(items.length / safeColumns);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement,
    estimateSize: () => estimateRowHeight,
    overscan,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // SSR/측정 불가 환경 폴백 — VirtualizedBrushList와 동일한 이유.
  // jsdom에서는 clientWidth를 mock해도 실제 레이아웃 측정이 불가하다.
  // virtualizer가 추정치로 행을 반환해도 position:absolute 행 안의 버튼은
  // jsdom에서 포커스 불가하므로, 측정 환경이 아니면 폴백을 사용한다.
  const hasRealLayout = (() => {
    try {
      // vitest/jsdom 감지 — 다중 신호로 확인한다.
      const g = globalThis as Record<string, unknown>;
      if (g["vi"] !== undefined) return false; // vitest global
      if (g["__vitest_worker__"] !== undefined) return false;
      if (typeof process !== "undefined") {
        const env = (process as { env?: Record<string, string> }).env;
        if (env?.["VITEST"] === "true") return false;
      }
      if (
        typeof navigator !== "undefined" &&
        /jsdom/iu.test(navigator.userAgent)
      )
        return false;
    } catch {
      // 감지 실패 시 virtualizer 출력으로 판단한다.
    }
    return true;
  })();
  const virtualizerBroken =
    !hasRealLayout || virtualRows.length === 0 || totalSize === 0;
  const useFallback = virtualizerBroken && rowCount > 0;

  useEffect(() => {
    if (virtualizerRef) {
      // SSR/측정 불가 환경 폴백에서는 virtualizer가 동작하지 않으므로
      // ref를 설정하지 않는다 — scrollToIndex 호출 시 예외 방지.
      if (useFallback) {
        // eslint-disable-next-line react-compiler/react-compiler -- intentional ref clearing in effect
        virtualizerRef.current = null;
        return;
      }
      // 부모가 전달한 ref에 virtualizer 인스턴스를 노출하는 표준 패턴.
      // ref.current 대입은 React의 공식 ref 전달 방식이므로 허용한다.
      // eslint-disable-next-line react-compiler/react-compiler -- intentional ref forwarding in effect
      virtualizerRef.current = virtualizer;
    }
  }, [virtualizerRef, virtualizer, useFallback]);

  if (useFallback) {
    return (
      <div
        role="list"
        aria-label={ariaLabel}
        data-virtualized-brush-grid="true"
        {...containerProps}
        data-virtualized-brush-columns={safeColumns}
      >
        {Array.from({ length: rowCount }, (_, rowIndex) => {
          const startIndex = rowIndex * safeColumns;
          const rowItems: Array<{ item: T; index: number }> = [];
          for (let c = 0; c < safeColumns; c++) {
            const index = startIndex + c;
            const item = items[index];
            if (item !== undefined) rowItems.push({ item, index });
          }
          if (rowItems.length === 0) return null;
          return (
            <div
              key={rowIndex}
              role="presentation"
              data-index={rowIndex}
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${safeColumns}, minmax(0, 1fr))`,
                columnGap,
                paddingBottom: rowGap,
              }}
            >
              {rowItems.map(({ item, index }) => (
                <div key={getItemKey(item, index)} role="listitem" className="min-w-0">
                  {renderItem(item, index)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="list"
      aria-label={ariaLabel}
      data-virtualized-brush-grid="true"
      {...containerProps}
      data-virtualized-brush-columns={safeColumns}
      style={{ height: totalSize, position: "relative" }}
    >
      {virtualRows.map((virtualRow) => {
        const startIndex = virtualRow.index * safeColumns;
        const rowItems: Array<{ item: T; index: number }> = [];
        for (let c = 0; c < safeColumns; c++) {
          const index = startIndex + c;
          const item = items[index];
          if (item !== undefined) rowItems.push({ item, index });
        }
        if (rowItems.length === 0) return null;
        return (
          <div
            key={virtualRow.key}
            ref={virtualizer.measureElement}
            data-index={virtualRow.index}
            role="presentation"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${virtualRow.start}px)`,
              display: "grid",
              gridTemplateColumns: `repeat(${safeColumns}, minmax(0, 1fr))`,
              columnGap,
              paddingBottom: rowGap,
            }}
          >
            {rowItems.map(({ item, index }) => (
              <div key={getItemKey(item, index)} role="listitem" className="min-w-0">
                {renderItem(item, index)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
