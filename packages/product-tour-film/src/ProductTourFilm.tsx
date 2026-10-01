import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/**
 * 장면 이미지의 성격. capture는 영상 제작 시점의 실제 제품 화면 캡처,
 * concept는 기능 구성을 설명하려고 그린 개념 도해·그림이다.
 * concept 장면에는 '실제 제품 화면' 표기를 쓰지 않고 '개념 도해' 배지를 붙인다.
 */
export type ProductTourFilmVisual = "capture" | "concept";

export interface ProductTourFilmAsset {
  readonly src: string;
  readonly visual: ProductTourFilmVisual;
}

export interface ProductTourFilmChapter {
  readonly start: number;
  readonly end: number;
  readonly kicker: string;
  readonly title: string;
  readonly body: string;
  readonly beats: readonly [string, string, string];
  readonly assets: readonly ProductTourFilmAsset[];
  readonly route: string;
  readonly label: string;
  readonly accent: string;
}

export const PRODUCT_TOUR_DURATION_SECONDS = 504;
export const PRODUCT_TOUR_FPS = 30;

/**
 * 스타라이트 브랜드 값. 영상은 사이트 CSS 변수를 읽을 수 없는 렌더러에서도 그려지므로
 * DESIGN.md의 스타라이트 기준색(남색 면 #070a14~#11142d, 보라 #b39bff, 청록 #68d5ff)을 한곳에 고정한다.
 */
const STARLIGHT = {
  canvas: "#070a14",
  surface: "#0d1024",
  raised: "#11142d",
  chrome: "#0b0e20",
  line: "rgba(179, 155, 255, .16)",
  lineSoft: "rgba(226, 230, 255, .08)",
  violet: "#b39bff",
  cyan: "#68d5ff",
  pink: "#de91f5",
  fg: "#eef0ff",
  fg2: "#b9bedf",
  fg3: "#8a90b8",
  fg4: "#5f6590",
  scrim: "rgba(7, 10, 20, .78)",
} as const;

const capture = (src: string): ProductTourFilmAsset => ({ src, visual: "capture" });
const concept = (src: string): ProductTourFilmAsset => ({ src, visual: "concept" });

export const PRODUCT_TOUR_FILM_CHAPTERS: readonly ProductTourFilmChapter[] = [
  {
    start: 0,
    end: 48,
    kicker: "01 · WHAT IS TOONSTUDIO",
    title: "아이디어에서 연재 준비까지,\n하나의 작품 안에서.",
    body: "툰스튜디오는 그림 한 장을 그리는 도구가 아니라 웹툰 제작의 앞뒤 과정을 연결하는 브라우저 기반 창작 작업실입니다.",
    beats: ["기획에서 시작", "2D · 3D 제작", "검토 · 게시 준비"],
    assets: [capture("brand/product-tour/01-overview.png")],
    route: "/studio",
    label: "OVERVIEW",
    accent: STARLIGHT.violet,
  },
  {
    start: 48,
    end: 108,
    kicker: "02 · PLAN THE STORY",
    title: "무엇을 그릴지 먼저,\n이야기의 기준을 세웁니다.",
    body: "세계관과 인물, 욕망과 장애물, 회차와 장면 목적을 정리해 다음 제작 단계가 필요한 맥락을 남깁니다.",
    beats: ["세계관 · 인물", "회차 · 장면 목적", "제작 단계로 연결"],
    assets: [capture("brand/product-tour/02-plan.png"), concept("brand/production-os-journey.svg")],
    route: "/story-lab",
    label: "STORY & PLAN",
    accent: STARLIGHT.cyan,
  },
  {
    start: 108,
    end: 174,
    kicker: "03 · DRAW",
    title: "캔버스가 주인공인\n전문 드로잉 공간.",
    body: "브러시, 레이어, 선택, 질감과 보정을 작업 화면 가까이에 두고 복잡한 설정은 필요할 때만 펼칩니다.",
    beats: ["브러시 · 질감", "레이어 · 선택", "필터 · 보정"],
    assets: [capture("brand/product-tour/03-draw.png"), concept("brand/studio-scene.svg")],
    route: "/studio/canvas",
    label: "DRAWING",
    accent: STARLIGHT.violet,
  },
  {
    start: 174,
    end: 228,
    kicker: "04 · TELL WITH PANELS",
    title: "한 장면을 컷과 대사로,\n읽히는 흐름으로.",
    body: "컷 분할, 말풍선, 대사와 장면 리듬을 같은 원고 문맥에서 다듬어 그림을 이야기로 이어갑니다.",
    beats: ["컷 분할", "말풍선 · 대사", "스크롤 리듬"],
    // 컷툰 편집기 캡처가 없어 컷 구성 개념 그림을 먼저 보여 주고 개념 도해로 표기한다.
    assets: [concept("brand/workflow-20260928/storyboard-960.webp"), capture("brand/product-tour/03-draw.png")],
    route: "/studio/comic",
    label: "COMIC STORYTELLING",
    accent: STARLIGHT.pink,
  },
  {
    start: 228,
    end: 300,
    kicker: "05 · BUILD IN 3D",
    title: "포즈와 카메라, 공간을\n장면 설계의 도구로.",
    body: "캐릭터 포즈와 배경, 카메라 구도를 3D로 탐색하고 현재 컷의 2D 제작으로 다시 연결합니다.",
    beats: ["캐릭터 · 포즈", "배경 · 공간", "카메라 · 컷 전환"],
    assets: [capture("brand/product-tour/05-3d.png")],
    route: "/studio/bg3d",
    label: "CHARACTER & 3D",
    accent: STARLIGHT.cyan,
  },
  {
    start: 300,
    end: 354,
    kicker: "06 · ASSIST, DON'T REPLACE",
    title: "반복 작업은 줄이고,\n판단은 창작자가.",
    body: "개인 Creator Runtime과 생성 도구를 반복 제작과 아이디어 탐색에 활용하되 결과 검토와 최종 선택은 작업자가 유지합니다.",
    beats: ["개인 런타임", "반복 제작 보조", "사람이 검토 · 선택"],
    assets: [capture("brand/product-tour/06-ai.png"), concept("brand/workflow-20260928/ai-960.webp")],
    route: "/studio/ai-lab",
    label: "AI ASSIST",
    accent: STARLIGHT.violet,
  },
  {
    start: 354,
    end: 420,
    kicker: "07 · PRODUCE TOGETHER",
    title: "파일을 넘기는 대신,\n작품의 상태를 함께 봅니다.",
    body: "담당자, 진행 상태, 수정 요청, 변경 이력과 검토를 실제 작업물에 연결해 팀 제작의 누락과 병목을 줄입니다.",
    beats: ["프로젝트 상태", "수정 · 변경 이력", "검토 · 승인"],
    assets: [capture("brand/product-tour/07-production.png"), capture("brand/product-tour/07-review.png")],
    route: "/production",
    label: "PRODUCTION & REVIEW",
    accent: STARLIGHT.cyan,
  },
  {
    start: 420,
    end: 468,
    kicker: "08 · LEARN & COLLECT",
    title: "만들면서 배우고,\n필요한 재료를 바로 찾고.",
    body: "웹툰 제작 강좌와 레퍼런스, 소재와 오디오를 작업 흐름 가까이에 두어 막힌 단계에서 다음 행동을 찾습니다.",
    beats: ["웹툰 제작 강좌", "소재 · 레퍼런스", "오디오 · 창작 자원"],
    assets: [capture("brand/product-tour/08-learn.png"), concept("brand/atelier-materials.webp")],
    route: "/learn",
    label: "LEARN · ASSETS · SOUND",
    accent: STARLIGHT.violet,
  },
  {
    start: 468,
    end: 504,
    kicker: "09 · FINISH THE WORK",
    title: "완성한 원고를 검사하고,\n내보내고, 공개 준비까지.",
    body: "원고 규격과 게시 설정을 확인하고 내보내기와 공개 준비를 같은 작품 흐름의 마지막 단계로 이어갑니다.",
    beats: ["원고 검사", "내보내기", "게시 준비"],
    assets: [capture("brand/product-tour/09-publish.png"), capture("brand/product-tour/01-overview.png")],
    route: "/studio/publish",
    label: "EXPORT & PUBLISH",
    accent: STARLIGHT.pink,
  },
];

/** 장면 이미지 위 표기. 개념 도해는 실제 화면처럼 보이게 하는 주소창·'실제 화면' 문구를 쓰지 않는다. */
export const PRODUCT_TOUR_FILM_VISUAL_LABEL: Readonly<Record<ProductTourFilmVisual, { readonly chrome: string; readonly badge: string }>> = {
  capture: { chrome: "PRODUCT CAPTURE", badge: "제품 화면 캡처" },
  concept: { chrome: "CONCEPT ILLUSTRATION", badge: "개념 도해 · 실제 화면 아님" },
};

function chapterAt(second: number): number {
  for (let index = PRODUCT_TOUR_FILM_CHAPTERS.length - 1; index >= 0; index -= 1) {
    if (second >= PRODUCT_TOUR_FILM_CHAPTERS[index].start) return index;
  }
  return 0;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function safeInterpolate(
  value: number,
  inputRange: readonly number[],
  outputRange: readonly number[],
) {
  return interpolate(value, inputRange, outputRange, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** 사이트 헤더와 같은 스펙트럼 리본 마크 + ToonStudio 워드마크. */
function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Img
        src={staticFile("brand/spectrum-ribbon-v2/icon-192.png")}
        style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${STARLIGHT.line}` }}
      />
      <div style={{ fontSize: 19, fontWeight: 850, letterSpacing: "-.045em" }}>
        <span style={{ color: STARLIGHT.fg }}>Toon</span>
        <span
          style={{
            background: `linear-gradient(110deg, ${STARLIGHT.cyan}, ${STARLIGHT.violet} 62%, ${STARLIGHT.pink})`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Studio
        </span>
      </div>
      <span style={{ color: STARLIGHT.fg3, fontSize: 11, letterSpacing: ".18em" }}>FULL PRODUCT TOUR</span>
    </div>
  );
}

function ProductSurface({
  chapter,
  localFrame,
  durationFrames,
}: {
  readonly chapter: ProductTourFilmChapter;
  readonly localFrame: number;
  readonly durationFrames: number;
}) {
  const { fps } = useVideoConfig();
  const assetSwitch = Math.floor((localFrame / Math.max(1, durationFrames)) * chapter.assets.length);
  const assetIndex = Math.min(chapter.assets.length - 1, Math.max(0, assetSwitch));
  const asset = chapter.assets[assetIndex] ?? chapter.assets[0];
  const cycleStart = (assetIndex / chapter.assets.length) * durationFrames;
  const assetLocal = localFrame - cycleStart;
  const assetFade = safeInterpolate(assetLocal, [0, Math.min(16, fps), Math.max(17, durationFrames / chapter.assets.length - 14)], [0, 1, 1]);
  const zoom = safeInterpolate(assetLocal, [0, durationFrames / chapter.assets.length], [1.018, 1.055]);
  const cursorX = safeInterpolate(localFrame, [0, durationFrames], [78, 61]);
  const cursorY = safeInterpolate(localFrame, [0, durationFrames], [31, 64]);
  if (!asset) return null;
  const isCapture = asset.visual === "capture";
  const label = PRODUCT_TOUR_FILM_VISUAL_LABEL[asset.visual];

  return (
    <div
      style={{
        position: "relative",
        width: 704,
        height: 510,
        overflow: "hidden",
        border: `1px solid ${STARLIGHT.line}`,
        borderRadius: 22,
        background: STARLIGHT.surface,
        boxShadow: `0 38px 100px rgba(3, 5, 14, .6), 0 0 0 1px ${STARLIGHT.lineSoft}`,
      }}
    >
      <div
        style={{
          display: "flex",
          height: 42,
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 17px",
          borderBottom: `1px solid ${STARLIGHT.lineSoft}`,
          background: STARLIGHT.chrome,
          color: STARLIGHT.fg3,
          fontSize: 12,
          letterSpacing: ".03em",
        }}
      >
        <span style={{ letterSpacing: 4 }}>● ● ●</span>
        {/* 개념 도해에는 실제 페이지처럼 보이는 주소를 붙이지 않는다. */}
        <span>{isCapture ? `toonstudio.cloud${chapter.route}` : chapter.label}</span>
        <span style={{ color: chapter.accent, fontWeight: 800 }}>{label.chrome}</span>
      </div>
      <div style={{ position: "absolute", inset: "42px 0 0", overflow: "hidden" }}>
        <Img
          src={staticFile(asset.src)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: asset.src.endsWith(".svg") ? "contain" : "cover",
            objectPosition: "top center",
            opacity: assetFade,
            transform: `scale(${zoom})`,
            transformOrigin: "50% 36%",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, transparent 58%, ${STARLIGHT.scrim})`,
          }}
        />
      </div>
      {isCapture ? (
        <div
          style={{
            position: "absolute",
            left: `${cursorX}%`,
            top: `${cursorY}%`,
            width: 17,
            height: 24,
            transform: "rotate(-18deg)",
            filter: "drop-shadow(0 3px 5px rgba(3, 5, 14, .6))",
          }}
        >
          <svg viewBox="0 0 20 28" width="20" height="28" aria-hidden="true">
            <path d="M2 1.8 18 16l-7.2 1.1 4.1 7.2-4.2 2.3-4-7.1L2 24.8Z" fill={STARLIGHT.fg} stroke={STARLIGHT.canvas} strokeWidth="1.5" />
          </svg>
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: 17,
          bottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          border: `1px solid ${isCapture ? STARLIGHT.line : `${chapter.accent}aa`}`,
          borderRadius: 999,
          background: STARLIGHT.scrim,
          color: STARLIGHT.fg,
          fontSize: 12,
          fontWeight: 700,
          backdropFilter: "blur(10px)",
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: chapter.accent }} />
        {label.badge} · {chapter.label}
      </div>
    </div>
  );
}

export function ToonStudioProductTour() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const second = frame / fps;
  const chapterIndex = chapterAt(second);
  const chapter = PRODUCT_TOUR_FILM_CHAPTERS[chapterIndex] ?? PRODUCT_TOUR_FILM_CHAPTERS[0];
  if (!chapter) return null;
  const localFrame = frame - chapter.start * fps;
  const durationFrames = (chapter.end - chapter.start) * fps;
  const entry = spring({ frame: localFrame, fps, config: { damping: 24, stiffness: 92, mass: 1.1 } });
  const exitOpacity = safeInterpolate(localFrame, [durationFrames - 22, durationFrames - 2], [1, 0]);
  const contentOpacity = Math.min(entry, exitOpacity);
  const beatIndex = Math.min(2, Math.floor((localFrame / Math.max(1, durationFrames)) * 3));
  const globalProgress = Math.min(1, (frame + 1) / (PRODUCT_TOUR_DURATION_SECONDS * fps));
  const accent = chapter.accent;

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background: `linear-gradient(160deg, ${STARLIGHT.canvas} 0%, ${STARLIGHT.surface} 55%, ${STARLIGHT.raised} 100%)`,
        color: STARLIGHT.fg,
        fontFamily: "'Pretendard', 'Noto Sans CJK KR', 'Noto Sans KR', sans-serif",
      }}
    >
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 82% 16%, rgba(179, 155, 255, .16), transparent 34%), radial-gradient(circle at 8% 94%, rgba(104, 213, 255, .1), transparent 30%)",
        }}
      />
      <AbsoluteFill
        style={{
          opacity: 0.1,
          backgroundImage: "radial-gradient(rgba(226, 230, 255, .5) .65px, transparent .65px)",
          backgroundSize: "22px 22px",
        }}
      />

      <header
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 72,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 50px",
          borderBottom: `1px solid ${STARLIGHT.lineSoft}`,
          background: "rgba(7, 10, 20, .82)",
        }}
      >
        <Wordmark />
        <div style={{ display: "flex", alignItems: "center", gap: 18, color: STARLIGHT.fg2, fontSize: 12, letterSpacing: ".08em" }}>
          <span>{String(chapterIndex + 1).padStart(2, "0")} / {String(PRODUCT_TOUR_FILM_CHAPTERS.length).padStart(2, "0")}</span>
          <span>{formatTime(second)} / 8:24</span>
        </div>
      </header>

      <main
        style={{
          position: "absolute",
          inset: "72px 0 52px",
          display: "grid",
          gridTemplateColumns: "430px 1fr",
          gap: 52,
          alignItems: "center",
          padding: "46px 48px 40px 54px",
          opacity: contentOpacity,
        }}
      >
        <section style={{ transform: `translateY(${(1 - entry) * 26}px)` }}>
          <div style={{ color: accent, fontSize: 12, fontWeight: 800, letterSpacing: ".16em", marginBottom: 22 }}>{chapter.kicker}</div>
          <h1
            style={{
              margin: 0,
              fontSize: 48,
              lineHeight: 1.14,
              letterSpacing: "-.055em",
              whiteSpace: "pre-line",
              wordBreak: "keep-all",
            }}
          >
            {chapter.title}
          </h1>
          <p style={{ margin: "24px 0 0", color: STARLIGHT.fg2, fontSize: 16, lineHeight: 1.78, wordBreak: "keep-all" }}>{chapter.body}</p>

          <div style={{ display: "grid", gap: 9, marginTop: 30 }}>
            {chapter.beats.map((beat, index) => {
              const active = beatIndex === index;
              return (
                <div
                  key={beat}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    minHeight: 42,
                    padding: "0 14px",
                    border: `1px solid ${active ? `${accent}99` : STARLIGHT.lineSoft}`,
                    borderRadius: 11,
                    background: active ? `${accent}1f` : "rgba(226, 230, 255, .025)",
                    color: active ? STARLIGHT.fg : STARLIGHT.fg3,
                    fontSize: 14,
                    fontWeight: active ? 760 : 620,
                  }}
                >
                  <span style={{ width: 22, color: active ? accent : STARLIGHT.fg4, fontSize: 12 }}>{String(index + 1).padStart(2, "0")}</span>
                  <span>{beat}</span>
                  {active ? <span style={{ marginLeft: "auto", color: accent }}>●</span> : null}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 24, color: STARLIGHT.fg3, fontSize: 12, letterSpacing: ".08em" }}>OPEN WORKSPACE · {chapter.route}</div>
        </section>

        <div style={{ justifySelf: "end", transform: `translateX(${(1 - entry) * 34}px)` }}>
          <ProductSurface chapter={chapter} localFrame={localFrame} durationFrames={durationFrames} />
        </div>
      </main>

      <footer
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 52,
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 22,
          padding: "0 48px",
          borderTop: `1px solid ${STARLIGHT.lineSoft}`,
          background: "rgba(7, 10, 20, .9)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${PRODUCT_TOUR_FILM_CHAPTERS.length}, 1fr)`, gap: 4 }}>
          {PRODUCT_TOUR_FILM_CHAPTERS.map((item, index) => {
            const before = index < chapterIndex;
            const current = index === chapterIndex;
            const localProgress = current ? Math.min(1, localFrame / Math.max(1, durationFrames)) : before ? 1 : 0;
            return (
              <div key={item.label} style={{ height: 4, overflow: "hidden", borderRadius: 99, background: "rgba(226, 230, 255, .1)" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${localProgress * 100}%`,
                    background: current ? `linear-gradient(90deg, ${STARLIGHT.violet}, ${STARLIGHT.cyan})` : STARLIGHT.fg4,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div style={{ color: STARLIGHT.fg3, fontSize: 12, letterSpacing: ".12em" }}>{Math.round(globalProgress * 100)}% · toonstudio.cloud</div>
      </footer>
    </AbsoluteFill>
  );
}
