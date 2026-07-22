/**
 * @toonspectrum/core/fx/particles — 공용 DOM 파티클 연출(isomorphic).
 *
 * canvas/렌더 루프 없이, 한 점에서 작은 DOM 노드 한 무더기를 방사상으로 날려 보내고
 * Web Animations API 로 애니메이션한 뒤 **스스로 정리**합니다(메모리 누수 0).
 * - React/Tailwind/Node 의존 0 — 순수 DOM + WAAPI.
 * - SSR/비브라우저면 graceful no-op(`document` 가드).
 * - 색/이모지는 웹툰 브랜드 톤(스펙트럼 + 별/하트/반짝임). 옵션으로 주입 가능.
 */

/** 연출용 난수 — crypto 우선(S2245), 미지원 환경만 폴백. */
const secureRandom = (): number => {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const array = new Uint32Array(1);
    globalThis.crypto.getRandomValues(array);
    return (array[0] ?? 0) / 4294967296; // 2^32 → [0, 1)
  }
  return 0.5;
};

/** 웹툰 브랜드 파티클 기본 색(스펙트럼 결의 따뜻한 액센트 + 보조 hue). */
const BRAND_COLORS: readonly string[] = [
  "oklch(0.72 0.185 42)", // accent(웜)
  "oklch(0.78 0.16 5)", // 로맨스 rose
  "oklch(0.78 0.16 290)", // 판타지 violet
  "oklch(0.8 0.11 232)", // cool
  "oklch(0.82 0.15 80)", // warn(amber)
  "oklch(0.95 0.02 85)", // near-white
];

/** 웹툰 브랜드 기본 이모지(작품/반응). */
const BRAND_CHARS: readonly string[] = ["✨", "💖", "⭐", "🎉", "💫", "🔖", "🪙", "💎", "⚡", "🌸", "✦", "★"];

/** triggerParticleBurst 옵션. */
export interface ParticleBurstOptions {
  /** 입자 수(기본 18). */
  count?: number;
  /** 색 풀 override(비면 브랜드 기본). */
  colors?: readonly string[];
  /** 이모지 셋 override(빈 배열이면 도형 입자만). */
  chars?: readonly string[];
  /** 퍼지는 반경 배수(기본 1). */
  spread?: number;
  /** 수명(ms, 기본 720). */
  durationMs?: number;
  /** 입자를 붙일 부모(기본 document.body). 스크롤/transform 컨테이너 대응용. */
  container?: HTMLElement;
  /** 입자 z-index(기본 9999). */
  zIndex?: number;
}

interface ElementLike {
  matches?: unknown;
}

const isHtmlElement = (value: unknown): value is HTMLElement =>
  typeof (value as ElementLike | null)?.matches === "function" &&
  typeof (value as HTMLElement | null)?.style === "object";

/**
 * (x, y) 뷰포트 좌표에 파티클을 "팡" 터뜨려요(self-cleaning).
 * - WAAPI 미지원/비브라우저면 graceful no-op.
 * - 각 입자는 방사상 속도 + 살짝 위로 솟구쳤다 중력으로 떨어지며 페이드아웃.
 * @param x 뷰포트 X(보통 이벤트 clientX)
 * @param y 뷰포트 Y(보통 이벤트 clientY)
 */
export const triggerParticleBurst = (x: number, y: number, options?: ParticleBurstOptions): void => {
  if (typeof document === "undefined" || !document.body) return;

  const container = isHtmlElement(options?.container) ? options.container : document.body;
  const count = Math.max(1, Math.floor(options?.count ?? 18));
  const colors = options?.colors?.length ? options.colors : BRAND_COLORS;
  const chars = options?.chars ?? BRAND_CHARS;
  const spread = options?.spread ?? 1;
  const duration = options?.durationMs ?? 720;
  const zIndex = options?.zIndex ?? 9999;

  // 컨테이너가 body 가 아니면 그 박스 기준으로 좌표 보정(고정 좌표 → 상대 좌표).
  let originX = x;
  let originY = y;
  if (container !== document.body && typeof container.getBoundingClientRect === "function") {
    const rect = container.getBoundingClientRect();
    originX = x - rect.left + container.scrollLeft;
    originY = y - rect.top + container.scrollTop;
  }
  const positionMode = container === document.body ? "fixed" : "absolute";

  // WAAPI 가용성 — 미지원이면 노드 한번 깜빡이고 정리(graceful).
  const supportsAnimate = typeof (document.createElement("div") as Element).animate === "function";

  for (let i = 0; i < count; i++) {
    const node = document.createElement("span");
    const useChar = chars.length > 0 && secureRandom() > 0.25;
    const char = useChar ? chars[Math.floor(secureRandom() * chars.length)] : undefined;
    const color = colors[Math.floor(secureRandom() * colors.length)] ?? BRAND_COLORS[0]!;
    const size = useChar ? 14 + secureRandom() * 12 : 6 + secureRandom() * 7;

    node.textContent = char ?? "";
    node.setAttribute("aria-hidden", "true");
    node.style.position = positionMode;
    node.style.left = `${originX}px`;
    node.style.top = `${originY}px`;
    node.style.zIndex = String(zIndex);
    node.style.pointerEvents = "none";
    node.style.userSelect = "none";
    node.style.willChange = "transform, opacity";
    node.style.fontSize = `${size}px`;
    node.style.lineHeight = "1";
    if (!char) {
      node.style.width = `${size}px`;
      node.style.height = `${size}px`;
      node.style.borderRadius = "50%";
      node.style.background = color;
    } else {
      node.style.color = color;
    }
    // 중앙 기준으로 배치되도록 translate(-50%, -50%) 를 시작 키프레임에 포함.

    const angle = secureRandom() * Math.PI * 2;
    const distance = (28 + secureRandom() * 64) * spread;
    const dx = Math.cos(angle) * distance;
    // 살짝 위로 솟구치는 초기 편향 + 중력으로 더 내려오는 종착점.
    const lift = 14 + secureRandom() * 26;
    const fallExtra = 18 + secureRandom() * 40;
    const midY = Math.sin(angle) * distance - lift;
    const endY = Math.sin(angle) * distance + fallExtra;
    const rot = (secureRandom() - 0.5) * 220;

    container.appendChild(node);

    if (!supportsAnimate) {
      // WAAPI 미지원 — 즉시 제거(연출 생략, 누수 방지).
      node.remove();
      continue;
    }

    const animation = node.animate(
      [
        { transform: "translate(-50%, -50%) translate(0px, 0px) scale(0.4) rotate(0deg)", opacity: 0 },
        {
          transform: `translate(-50%, -50%) translate(${dx * 0.6}px, ${midY}px) scale(1) rotate(${rot * 0.5}deg)`,
          opacity: 1,
          offset: 0.25,
        },
        {
          transform: `translate(-50%, -50%) translate(${dx}px, ${endY}px) scale(0.85) rotate(${rot}deg)`,
          opacity: 0,
        },
      ],
      {
        duration: duration * (0.8 + secureRandom() * 0.4),
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "forwards",
      },
    );

    const cleanup = (): void => {
      node.remove();
    };
    animation.onfinish = cleanup;
    animation.oncancel = cleanup;
    // WAAPI onfinish 가 누락되는 드문 환경 대비 — 타이머 백스톱.
    setTimeout(cleanup, duration + 300);
  }
};

/**
 * 요소의 중심에서 파티클을 터뜨려요(좌표 계산 헬퍼). 버튼 탭 직후 연출에 편리.
 * @param el      기준 요소
 * @param options 버스트 옵션
 */
export const triggerParticleBurstAtElement = (
  el: Element | null | undefined,
  options?: ParticleBurstOptions,
): void => {
  if (!el || typeof el.getBoundingClientRect !== "function") return;
  const rect = el.getBoundingClientRect();
  triggerParticleBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, options);
};
