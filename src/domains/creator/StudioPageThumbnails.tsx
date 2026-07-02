/**
 * Studio Page Thumbnails — 페이지 스트립 "실내용" 미니 썸네일 + HTML5 드래그 재배열 훅.
 *
 * 썸네일은 studio-page-thumbs 의 순수 프록시 스펙(ThumbNode)을 SVG 로 그린다 —
 * 페이지마다 Konva Stage 를 띄우지 않는 경량 미리보기(PPT 사이드바 방식).
 * 페이지 색보정(그레이드)은 CSS filter + 비네트 오버레이로 캔버스 미리보기와 동일하게 근사.
 *
 * 재배열은 useStudioPageDnd 가 드래그 상태(원본 index·드롭 슬롯)만 관리하고,
 * 실제 순서 변경은 호출 측이 studio-pages.reorderPages 순수 함수로 수행한다.
 * 키보드/터치 대체 수단은 기존 이동 버튼(위/아래/맨위/맨아래)을 그대로 유지한다(a11y).
 */
import { useState, type DragEvent, type ReactElement } from "react";

import { CANVAS_W } from "./studio-assets";
import {
  isDefaultPageGrade,
  normalizePageGrade,
  pageGradeToCssFilter,
  vignetteCss,
  type PageGrade,
} from "./studio-page-grade";
import {
  buildThumbNodes,
  computeDropSlot,
  dropIndicatorFor,
  dropSlotToReorderTarget,
  isNoopDropSlot,
  type ThumbNode,
  type ThumbPageLike,
} from "./studio-page-thumbs";

import { cn } from "@/lib/utils";

// ── 썸네일 ──────────────────────────────────────────────────────────────────────────

function renderThumbNode(node: ThumbNode): ReactElement {
  const transform = node.transform ?? undefined;
  switch (node.kind) {
    case "rect":
      return (
        <rect
          key={node.key}
          x={node.x}
          y={node.y}
          width={node.w}
          height={node.h}
          rx={node.rx || undefined}
          fill={node.fill ?? "none"}
          fillOpacity={node.fillOpacity !== 1 ? node.fillOpacity : undefined}
          stroke={node.stroke ?? undefined}
          strokeWidth={node.stroke ? node.strokeWidth : undefined}
          strokeDasharray={node.dashed ? "10 5" : undefined}
          transform={transform}
          opacity={node.opacity}
        />
      );
    case "ellipse":
      return (
        <ellipse
          key={node.key}
          cx={node.cx}
          cy={node.cy}
          rx={node.rx}
          ry={node.ry}
          fill={node.fill ?? "none"}
          stroke={node.stroke ?? undefined}
          strokeWidth={node.stroke ? node.strokeWidth : undefined}
          transform={transform}
          opacity={node.opacity}
        />
      );
    case "polygon":
      return (
        <polygon
          key={node.key}
          points={node.points}
          fill={node.fill ?? "none"}
          stroke={node.stroke ?? undefined}
          strokeWidth={node.stroke ? node.strokeWidth : undefined}
          strokeLinejoin="round"
          transform={transform}
          opacity={node.opacity}
        />
      );
    case "polyline":
      return (
        <polyline
          key={node.key}
          points={node.points}
          fill="none"
          stroke={node.stroke}
          strokeWidth={node.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          transform={transform}
          opacity={node.opacity}
        />
      );
    case "path":
      return (
        <path
          key={node.key}
          d={node.d}
          fill={node.fill ?? "none"}
          stroke={node.stroke ?? undefined}
          strokeWidth={node.stroke ? node.strokeWidth : undefined}
          strokeDasharray={node.dashed ? "8 5" : undefined}
          strokeLinejoin="round"
          transform={transform}
          opacity={node.opacity}
        />
      );
    case "image":
      return (
        <image
          key={node.key}
          href={node.src}
          x={node.x}
          y={node.y}
          width={node.w}
          height={node.h}
          preserveAspectRatio={node.cover ? "xMidYMid slice" : "none"}
          style={node.filterCss ? { filter: node.filterCss } : undefined}
          transform={transform}
          opacity={node.opacity}
        />
      );
    case "text":
      return (
        <text
          key={node.key}
          x={node.x}
          y={node.y}
          textAnchor={node.anchor}
          fontSize={node.fontSize}
          fontFamily={node.font}
          fontWeight={node.bold ? 700 : 400}
          fill={node.fill}
          stroke={node.stroke ?? undefined}
          strokeWidth={node.stroke ? node.strokeWidth : undefined}
          style={node.stroke ? { paintOrder: "stroke" } : undefined}
          transform={transform}
          opacity={node.opacity}
        >
          {node.lines.map((line, i) => (
            // 줄 순서 고정 배열(재정렬 없음)이라 index key 안전.
            <tspan key={i} x={node.x} dy={i === 0 ? 0 : node.lineStep}>
              {line}
            </tspan>
          ))}
        </text>
      );
  }
}

/**
 * 페이지 실내용 미니 썸네일 — 요소들을 축소 SVG 프록시로 렌더한다.
 * page 객체 동일성이 유지되면 React Compiler 메모이제이션으로 재렌더를 건너뛴다
 * (StudioPage 의 commit 계열은 변경된 페이지만 새 객체로 만든다).
 */
export function StudioPageThumbnail({
  page,
  className,
}: {
  page: ThumbPageLike;
  className?: string;
}): ReactElement {
  const { nodes, skipped } = buildThumbNodes(page);
  const grade = normalizePageGrade(page.grade as Partial<PageGrade> | undefined);
  const gradeFilter = pageGradeToCssFilter(grade);
  const hasGrade = !isDefaultPageGrade(grade);
  const canvasH = page.canvasH > 0 ? page.canvasH : 1080;
  const hasGradient = Array.isArray(page.bgGrad) && page.bgGrad.length >= 2;
  // useId 는 특수문자(«») id 를 만들 수 있어 url(#…) 참조가 불안정 — 페이지 uuid 기반 id 사용.
  const gradientId = `studio-page-thumb-grad-${page.id}`;

  return (
    <div className={cn("relative h-24 overflow-hidden rounded border border-line/60 bg-raised/40", className)}>
      <svg
        viewBox={`0 0 ${CANVAS_W} ${canvasH}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        aria-hidden="true"
        focusable="false"
        style={hasGrade && gradeFilter ? { filter: gradeFilter } : undefined}
      >
        {hasGradient ? (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={page.bgGrad?.[0]} />
              <stop offset="1" stopColor={page.bgGrad?.[1]} />
            </linearGradient>
          </defs>
        ) : null}
        <rect x={0} y={0} width={CANVAS_W} height={canvasH} fill={hasGradient ? `url(#${gradientId})` : page.bg} />
        {nodes.map((node) => renderThumbNode(node))}
      </svg>
      {hasGrade && grade.vignette > 0 ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: vignetteCss(grade.vignette) }}
        />
      ) : null}
      {skipped > 0 ? (
        <span
          className="absolute bottom-0.5 right-1 rounded bg-black/55 px-1 text-[8px] font-semibold leading-3 text-white"
          title={`요소 ${skipped}개는 경량 미리보기에서 생략됨`}
        >
          +{skipped}
        </span>
      ) : null}
    </div>
  );
}

// ── 드래그 재배열 훅 ─────────────────────────────────────────────────────────────────

export interface StudioPageDndItemProps {
  draggable: boolean;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
  onDragOver: (e: DragEvent<HTMLElement>) => void;
  onDrop: (e: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

export interface StudioPageDnd {
  /** 드래그 중인 카드 index(스타일 흐리기용). 드래그 없으면 null. */
  dragIndex: number | null;
  /** 현재 드롭 슬롯(카드 사이 틈 0..count). 드래그 없으면 null. */
  dropSlot: number | null;
  /** 각 페이지 카드에 스프레드할 DnD props. */
  itemProps: (index: number) => StudioPageDndItemProps;
  /** index 카드에 그릴 삽입선("before"=카드 위 / "after"=카드 아래 / null=없음). */
  indicatorFor: (index: number) => "before" | "after" | null;
}

// 페이지 카드 전용 커스텀 MIME — 파일 드롭 등 외부 드래그와 섞이지 않게 표식.
const PAGE_DND_MIME = "application/x-toonspectrum-studio-page";

/**
 * 페이지 스트립 HTML5 드래그 재배열 훅(PPT 방식).
 * 카드 위/아래 절반 판정으로 삽입 슬롯을 계산하고, 드롭 시 onReorder(from, to)를 호출한다.
 * to 는 studio-pages.reorderPages 의 "제거 후 삽입" 의미로 보정된 최종 인덱스.
 * 드래그 불가 환경(키보드·터치)은 기존 이동 버튼이 대체 수단으로 유지된다.
 *
 * 썸네일 컴포넌트와 강결합된 페어라 한 파일에 둔다(이 파일 편집 시 fast-refresh 대신 풀 리로드 — 의도적).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useStudioPageDnd(
  count: number,
  onReorder: (fromIndex: number, toIndex: number) => void
): StudioPageDnd {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);

  const reset = () => {
    setDragIndex(null);
    setDropSlot(null);
  };

  const slotFromEvent = (index: number, e: DragEvent<HTMLElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0;
    return computeDropSlot(index, ratio);
  };

  const itemProps = (index: number): StudioPageDndItemProps => ({
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.effectAllowed = "move";
      // Firefox 는 setData 가 없으면 드래그를 시작하지 않는다.
      e.dataTransfer.setData(PAGE_DND_MIME, String(index));
      e.dataTransfer.setData("text/plain", String(index));
      setDragIndex(index);
      setDropSlot(null);
    },
    onDragOver: (e) => {
      if (dragIndex === null) return; // 외부 드래그(파일 등)에는 관여하지 않음
      e.preventDefault(); // 드롭 허용
      e.dataTransfer.dropEffect = "move";
      const slot = slotFromEvent(index, e);
      setDropSlot((prev) => (prev === slot ? prev : slot));
    },
    onDrop: (e) => {
      if (dragIndex === null) return;
      e.preventDefault();
      // 상태(dropSlot) 대신 드롭 이벤트 좌표로 즉석 계산 — 마지막 dragover 와의 타이밍 경합 제거.
      const slot = slotFromEvent(index, e);
      if (!isNoopDropSlot(dragIndex, slot)) {
        onReorder(dragIndex, dropSlotToReorderTarget(dragIndex, slot));
      }
      reset();
    },
    onDragEnd: reset, // 드롭 성공/취소(ESC·영역 밖) 모두 정리
  });

  return {
    dragIndex,
    dropSlot,
    itemProps,
    indicatorFor: (index: number) => dropIndicatorFor(index, count, dragIndex, dropSlot),
  };
}
