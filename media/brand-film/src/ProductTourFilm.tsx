import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

interface TourChapter {
  readonly start: number;
  readonly end: number;
  readonly kicker: string;
  readonly title: string;
  readonly body: string;
  readonly beats: readonly [string, string, string];
  readonly assets: readonly string[];
  readonly route: string;
  readonly label: string;
  readonly accent?: string;
}

export const PRODUCT_TOUR_DURATION_SECONDS = 504;
export const PRODUCT_TOUR_FPS = 30;

const CHAPTERS: readonly TourChapter[] = [
  {
    start: 0,
    end: 48,
    kicker: "01 · WHAT IS TOONSTUDIO",
    title: "아이디어에서 연재 준비까지,\n하나의 작품 안에서.",
    body: "툰스튜디오는 그림 한 장을 그리는 도구가 아니라 웹툰 제작의 앞뒤 과정을 연결하는 브라우저 기반 창작 작업실입니다.",
    beats: ["기획에서 시작", "2D · 3D 제작", "검토 · 게시 준비"],
    assets: ["brand/product-tour/01-overview.png"],
    route: "/studio",
    label: "OVERVIEW",
  },
  {
    start: 48,
    end: 108,
    kicker: "02 · PLAN THE STORY",
    title: "무엇을 그릴지 먼저,\n이야기의 기준을 세웁니다.",
    body: "세계관과 인물, 욕망과 장애물, 회차와 장면 목적을 정리해 다음 제작 단계가 필요한 맥락을 남깁니다.",
    beats: ["세계관 · 인물", "회차 · 장면 목적", "제작 단계로 연결"],
    assets: ["brand/product-tour/02-plan.png", "brand/production-os-journey.svg"],
    route: "/story-lab",
    label: "STORY & PLAN",
  },
  {
    start: 108,
    end: 174,
    kicker: "03 · DRAW",
    title: "캔버스가 주인공인\n전문 드로잉 공간.",
    body: "브러시, 레이어, 선택, 질감과 보정을 작업 화면 가까이에 두고 복잡한 설정은 필요할 때만 펼칩니다.",
    beats: ["브러시 · 질감", "레이어 · 선택", "필터 · 보정"],
    assets: ["brand/product-tour/03-draw.png", "brand/studio-scene.svg"],
    route: "/studio/new?kind=illustration",
    label: "DRAWING",
    accent: "#ff8a4c",
  },
  {
    start: 174,
    end: 228,
    kicker: "04 · TELL WITH PANELS",
    title: "한 장면을 컷과 대사로,\n읽히는 흐름으로.",
    body: "컷 분할, 말풍선, 대사와 장면 리듬을 같은 원고 문맥에서 다듬어 그림을 이야기로 이어갑니다.",
    beats: ["컷 분할", "말풍선 · 대사", "스크롤 리듬"],
    assets: ["brand/production-os-workspace.svg", "brand/product-tour/03-draw.png"],
    route: "/studio/comic",
    label: "COMIC STORYTELLING",
  },
  {
    start: 228,
    end: 300,
    kicker: "05 · BUILD IN 3D",
    title: "포즈와 카메라, 공간을\n장면 설계의 도구로.",
    body: "캐릭터 포즈와 배경, 카메라 구도를 3D로 탐색하고 현재 컷의 2D 제작으로 다시 연결합니다.",
    beats: ["캐릭터 · 포즈", "배경 · 공간", "카메라 · 컷 전환"],
    assets: ["brand/product-tour/05-3d.png", "brand/production-os-workspace.svg"],
    route: "/studio/bg3d",
    label: "CHARACTER & 3D",
    accent: "#ff7440",
  },
  {
    start: 300,
    end: 354,
    kicker: "06 · ASSIST, DON'T REPLACE",
    title: "반복 작업은 줄이고,\n판단은 창작자가.",
    body: "개인 Creator Runtime과 생성 도구를 반복 제작과 아이디어 탐색에 활용하되 결과 검토와 최종 선택은 작업자가 유지합니다.",
    beats: ["개인 런타임", "반복 제작 보조", "사람이 검토 · 선택"],
    assets: ["brand/product-tour/06-ai.png", "brand/theme-scenes/aurora-studio.svg"],
    route: "/studio/ai-lab",
    label: "AI ASSIST",
  },
  {
    start: 354,
    end: 420,
    kicker: "07 · PRODUCE TOGETHER",
    title: "파일을 넘기는 대신,\n작품의 상태를 함께 봅니다.",
    body: "담당자, 진행 상태, 수정 요청, 변경 이력과 검토를 실제 작업물에 연결해 팀 제작의 누락과 병목을 줄입니다.",
    beats: ["프로젝트 상태", "수정 · 변경 이력", "검토 · 승인"],
    assets: ["brand/product-tour/07-production.png", "brand/product-tour/07-review.png"],
    route: "/production",
    label: "PRODUCTION & REVIEW",
    accent: "#f89b4c",
  },
  {
    start: 420,
    end: 468,
    kicker: "08 · LEARN & COLLECT",
    title: "만들면서 배우고,\n필요한 재료를 바로 찾고.",
    body: "웹툰 제작 강좌와 레퍼런스, 소재와 오디오를 작업 흐름 가까이에 두어 막힌 단계에서 다음 행동을 찾습니다.",
    beats: ["웹툰 제작 강좌", "소재 · 레퍼런스", "오디오 · 창작 자원"],
    assets: ["brand/product-tour/08-learn.png", "brand/atelier-materials.webp"],
    route: "/learn",
    label: "LEARN · ASSETS · SOUND",
  },
  {
    start: 468,
    end: 504,
    kicker: "09 · FINISH THE WORK",
    title: "완성한 원고를 검사하고,\n내보내고, 공개 준비까지.",
    body: "원고 규격과 게시 설정을 확인하고 내보내기와 공개 준비를 같은 작품 흐름의 마지막 단계로 이어갑니다.",
    beats: ["원고 검사", "내보내기", "게시 준비"],
    assets: ["brand/product-tour/09-publish.png", "brand/product-tour/01-overview.png"],
    route: "/studio/publish",
    label: "EXPORT & PUBLISH",
    accent: "#ff9d5c",
  },
];

function chapterAt(second: number): number {
  for (let index = CHAPTERS.length - 1; index >= 0; index -= 1) {
    if (second >= CHAPTERS[index].start) return index;
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

function ProductSurface({
  chapter,
  localFrame,
  durationFrames,
}: {
  readonly chapter: TourChapter;
  readonly localFrame: number;
  readonly durationFrames: number;
}) {
  const { fps } = useVideoConfig();
  const assetSwitch = Math.floor((localFrame / Math.max(1, durationFrames)) * chapter.assets.length);
  const assetIndex = Math.min(chapter.assets.length - 1, Math.max(0, assetSwitch));
  const asset = chapter.assets[assetIndex];
  const cycleStart = (assetIndex / chapter.assets.length) * durationFrames;
  const assetLocal = localFrame - cycleStart;
  const assetFade = safeInterpolate(assetLocal, [0, Math.min(16, fps), Math.max(17, durationFrames / chapter.assets.length - 14)], [0, 1, 1]);
  const zoom = safeInterpolate(assetLocal, [0, durationFrames / chapter.assets.length], [1.018, 1.055]);
  const cursorX = safeInterpolate(localFrame, [0, durationFrames], [78, 61]);
  const cursorY = safeInterpolate(localFrame, [0, durationFrames], [31, 64]);

  return (
    <div
      style={{
        position: "relative",
        width: 704,
        height: 510,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,.16)",
        borderRadius: 22,
        background: "#120f0d",
        boxShadow: "0 38px 100px rgba(0,0,0,.46)",
      }}
    >
      <div
        style={{
          display: "flex",
          height: 42,
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 17px",
          borderBottom: "1px solid rgba(255,255,255,.09)",
          background: "#171411",
          color: "#968e87",
          fontSize: 11,
          letterSpacing: ".03em",
        }}
      >
        <span style={{ letterSpacing: 4 }}>● ● ●</span>
        <span>toonstudio.cloud{chapter.route}</span>
        <span style={{ color: chapter.accent ?? "#ff7a3d" }}>LIVE WORKSPACE</span>
      </div>
      <div style={{ position: "absolute", inset: "42px 0 0", overflow: "hidden" }}>
        <Img
          src={staticFile(asset)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: asset.endsWith(".svg") ? "contain" : "cover",
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
            background: "linear-gradient(180deg, transparent 58%, rgba(8,7,6,.68))",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: `${cursorX}%`,
          top: `${cursorY}%`,
          width: 17,
          height: 24,
          transform: "rotate(-18deg)",
          filter: "drop-shadow(0 3px 5px rgba(0,0,0,.6))",
        }}
      >
        <svg viewBox="0 0 20 28" width="20" height="28" aria-hidden="true">
          <path d="M2 1.8 18 16l-7.2 1.1 4.1 7.2-4.2 2.3-4-7.1L2 24.8Z" fill="#fff" stroke="#16120f" strokeWidth="1.5" />
        </svg>
      </div>
      <div
        style={{
          position: "absolute",
          left: 17,
          bottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 11px",
          border: "1px solid rgba(255,255,255,.15)",
          borderRadius: 999,
          background: "rgba(14,12,10,.78)",
          color: "#f5eee8",
          fontSize: 11,
          fontWeight: 700,
          backdropFilter: "blur(10px)",
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: chapter.accent ?? "#ff743a" }} />
        실제 제품 화면 기반 · {chapter.label}
      </div>
    </div>
  );
}

export function ToonStudioProductTour() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const second = frame / fps;
  const chapterIndex = chapterAt(second);
  const chapter = CHAPTERS[chapterIndex];
  const localFrame = frame - chapter.start * fps;
  const durationFrames = (chapter.end - chapter.start) * fps;
  const entry = spring({ frame: localFrame, fps, config: { damping: 24, stiffness: 92, mass: 1.1 } });
  const exitOpacity = safeInterpolate(localFrame, [durationFrames - 22, durationFrames - 2], [1, 0]);
  const contentOpacity = Math.min(entry, exitOpacity);
  const beatIndex = Math.min(2, Math.floor((localFrame / Math.max(1, durationFrames)) * 3));
  const globalProgress = Math.min(1, (frame + 1) / (PRODUCT_TOUR_DURATION_SECONDS * fps));
  const accent = chapter.accent ?? "#ff743a";

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background: "#0d0b09",
        color: "#f6f0ea",
        fontFamily: "'Pretendard', 'Noto Sans CJK KR', 'Noto Sans KR', sans-serif",
      }}
    >
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 82% 18%, rgba(255,112,54,.14), transparent 34%), radial-gradient(circle at 8% 94%, rgba(255,168,94,.08), transparent 28%)",
        }}
      />
      <AbsoluteFill
        style={{
          opacity: 0.11,
          backgroundImage: "radial-gradient(rgba(255,255,255,.45) .65px, transparent .65px)",
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
          borderBottom: "1px solid rgba(255,255,255,.08)",
          background: "rgba(13,11,9,.82)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "grid", width: 30, height: 30, placeItems: "center", borderRadius: 9, background: accent, color: "#160d08", fontSize: 17, fontWeight: 900 }}>✦</div>
          <div style={{ fontSize: 18, fontWeight: 850, letterSpacing: "-.03em" }}>ToonStudio</div>
          <span style={{ color: "#726a64", fontSize: 10, letterSpacing: ".18em" }}>FULL PRODUCT TOUR</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, color: "#a49c95", fontSize: 11, letterSpacing: ".08em" }}>
          <span>{String(chapterIndex + 1).padStart(2, "0")} / {String(CHAPTERS.length).padStart(2, "0")}</span>
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
          <div style={{ color: accent, fontSize: 11, fontWeight: 800, letterSpacing: ".16em", marginBottom: 22 }}>{chapter.kicker}</div>
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
          <p style={{ margin: "24px 0 0", color: "#b7aea7", fontSize: 16, lineHeight: 1.78, wordBreak: "keep-all" }}>{chapter.body}</p>

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
                    border: `1px solid ${active ? `${accent}88` : "rgba(255,255,255,.09)"}`,
                    borderRadius: 11,
                    background: active ? `${accent}13` : "rgba(255,255,255,.018)",
                    color: active ? "#f7f0e8" : "#807871",
                    fontSize: 13,
                    fontWeight: active ? 760 : 620,
                  }}
                >
                  <span style={{ width: 20, color: active ? accent : "#5e5752", fontSize: 10 }}>{String(index + 1).padStart(2, "0")}</span>
                  <span>{beat}</span>
                  {active ? <span style={{ marginLeft: "auto", color: accent }}>●</span> : null}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 24, color: "#746c66", fontSize: 10, letterSpacing: ".08em" }}>OPEN WORKSPACE · {chapter.route}</div>
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
          borderTop: "1px solid rgba(255,255,255,.08)",
          background: "rgba(13,11,9,.9)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${CHAPTERS.length}, 1fr)`, gap: 4 }}>
          {CHAPTERS.map((item, index) => {
            const before = index < chapterIndex;
            const current = index === chapterIndex;
            const localProgress = current ? Math.min(1, localFrame / Math.max(1, durationFrames)) : before ? 1 : 0;
            return (
              <div key={item.label} style={{ height: 4, overflow: "hidden", borderRadius: 99, background: "rgba(255,255,255,.1)" }}>
                <div style={{ height: "100%", width: `${localProgress * 100}%`, background: current ? accent : "#7e756e" }} />
              </div>
            );
          })}
        </div>
        <div style={{ color: "#8b827c", fontSize: 10, letterSpacing: ".12em" }}>{Math.round(globalProgress * 100)}% · toonstudio.cloud</div>
      </footer>
    </AbsoluteFill>
  );
}
