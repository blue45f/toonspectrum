/**
 * @toonspectrum/core/carousel — embla 기반 가로 캐러셀의 **헤드리스** 로직(웹·토스 공유, NO fork).
 *
 * 렌더(Tailwind vs 토스 인라인 스타일)는 앱별 얇은 뷰가 담당하고, 캐러셀 "행동"
 * (스냅·관성 드래그·free-scroll·다음 카드 peek·화살표 활성/비활성·닷·키보드)은 전부 이 훅이
 * 단일 출처로 소유한다.
 *
 * - embla 옵션: align "start" + containScroll "trimSnaps" + dragFree(관성/자유 스크롤) + 루프 없음.
 *   peek(다음 카드 살짝 보이기)은 컨테이너 패딩/카드 폭으로 만들고, 여기선 트랙 동작만 책임진다.
 * - selectedIndex / snapCount / canPrev / canNext 를 구독해 화살표·닷·aria 를 구동.
 * - prefers-reduced-motion 이면 스크롤 애니메이션 시간을 0 으로 떨궈 즉시 점프(모션 민감 배려).
 *
 * React 를 **peer** 로만 쓴다(코어의 fx/hooks 와 동일 규칙). 비브라우저/SSR 에서도 안전.
 */

import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useEffect, useState } from "react";

// embla 의 align 옵션(AlignmentOptionType). embla-carousel-react 가 그 타입을 재노출하지 않아,
// peer 의존을 늘리지 않으려 좁은 로컬 문자열 유니온으로 둔다.
type CarouselAlign = "start" | "center" | "end";

export interface UseCarouselOptions {
  /** 루프 회전(메인 레일은 기본 false — 끝이 있는 목록). */
  loop?: boolean;
  /** 카드 정렬. 기본 "start"(좌측 정렬 — 다음 카드 peek 와 어울림). */
  align?: CarouselAlign;
  /** 관성/자유 스크롤(모멘텀 드래그 느낌). 기본 true. */
  dragFree?: boolean;
  /** embla 트랜지션 길이. 기본 24(부드럽고 빠릿). */
  duration?: number;
  /** 비활성화(아이템이 적을 때 등 — 그래도 훅 순서는 유지). */
  active?: boolean;
}

export interface CarouselApi {
  /** embla 가 부착될 viewport ref(overflow-hidden 래퍼에 단다). */
  emblaRef: ReturnType<typeof useEmblaCarousel>[0];
  /** 현재 선택된 스냅 인덱스. */
  selectedIndex: number;
  /** 스냅(페이지) 개수 — 닷 인디케이터 수. */
  snapCount: number;
  /** 이전/다음으로 더 갈 수 있는지(화살표 비활성 판단). */
  canPrev: boolean;
  canNext: boolean;
  scrollPrev: () => void;
  scrollNext: () => void;
  scrollTo: (index: number) => void;
  /** 화살표/페이지네이션을 노출할 가치가 있는지(스냅이 2개 이상). */
  hasPagination: boolean;
  /** 키보드(←/→/Home/End)로 레일을 넘기는 핸들러 — 루트에 단다. */
  onKeyDown: (event: { key: string; preventDefault: () => void }) => void;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useCarousel(options: UseCarouselOptions = {}): CarouselApi {
  const { loop = false, align = "start", dragFree = true, duration = 24, active = true } = options;

  const [emblaRef, emblaApi] = useEmblaCarousel({
    active,
    loop,
    align,
    dragFree,
    duration: prefersReducedMotion() ? 0 : duration,
    containScroll: "trimSnaps",
    skipSnaps: false,
  });

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [snapCount, setSnapCount] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  const onReInit = useCallback(() => {
    if (!emblaApi) return;
    setSnapCount(emblaApi.scrollSnapList().length);
    onSelect();
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (!emblaApi) return;
    onReInit();
    emblaApi.on("select", onSelect).on("reInit", onReInit);
    return () => {
      emblaApi.off("select", onSelect).off("reInit", onReInit);
    };
  }, [emblaApi, onSelect, onReInit]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback((index: number) => emblaApi?.scrollTo(index), [emblaApi]);

  const onKeyDown = useCallback(
    (event: { key: string; preventDefault: () => void }) => {
      if (!emblaApi) return;
      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          emblaApi.scrollPrev();
          break;
        case "ArrowRight":
          event.preventDefault();
          emblaApi.scrollNext();
          break;
        case "Home":
          event.preventDefault();
          emblaApi.scrollTo(0);
          break;
        case "End":
          event.preventDefault();
          emblaApi.scrollTo(emblaApi.scrollSnapList().length - 1);
          break;
        default:
          break;
      }
    },
    [emblaApi]
  );

  return {
    emblaRef,
    selectedIndex,
    snapCount,
    canPrev,
    canNext,
    scrollPrev,
    scrollNext,
    scrollTo,
    hasPagination: snapCount > 1,
    onKeyDown,
  };
}
