import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

interface TechnologyScene {
  readonly kicker: string;
  readonly title: string;
  readonly body: string;
  readonly label: string;
  readonly points: readonly string[];
}

const OVERVIEW_SCENES: readonly TechnologyScene[] = [
  {
    kicker: "01 · FRAGMENTED CONTEXT",
    title: "기획부터 연재까지,\n맥락이 끊기지 않도록.",
    body: "대본, 콘티, 드로잉, 3D, 파일과 검수가 흩어질수록 다음 담당자는 작업의 이유부터 다시 복원해야 합니다.",
    label: "PROBLEM",
    points: ["Planning", "Drawing", "3D", "Review"],
  },
  {
    kicker: "02 · PRODUCT BOUNDARY",
    title: "페이지가 아니라\n프로젝트를 중심에 둡니다.",
    body: "Workspace, Project, Episode, Cut, Asset와 Approval을 하나의 제작 상태로 연결합니다.",
    label: "DOMAIN",
    points: ["Project", "Episode", "Cut", "Approval"],
  },
  {
    kicker: "03 · LOCAL-FIRST CREATION",
    title: "브러시의 반응성과\n작업 복구를 함께 설계합니다.",
    body: "실시간 GPU 표시와 최종 문서 commit을 분리하고, OPFS·SQLite·복구 저널로 대형 프로젝트를 지킵니다.",
    label: "CREATE",
    points: ["WebGPU", "CanvasKit", "OPFS", "Recovery"],
  },
  {
    kicker: "04 · BROWSER EXECUTION",
    title: "Worker, PWA, 로컬 AI를\n하나의 복구 계약으로.",
    body: "59개 전용 Worker, 버전 있는 Service Worker, ONNX WebGPU/WASM과 MediaPipe를 요청·취소·메모리·결과 권위 뒤에 둡니다.",
    label: "EXECUTE",
    points: ["Workers", "PWA", "ONNX", "MediaPipe"],
  },
  {
    kicker: "05 · PROVIDER BOUNDARIES",
    title: "외부 공급자는\n제품 계약 뒤에 둡니다.",
    body: "OAuth, 개인 클라우드와 AI를 공급자 중립 계약으로 감싸 동의, 예산, 권리와 승인 결과를 보존합니다.",
    label: "CONNECT",
    points: ["OAuth", "Cloud", "AI", "Consent"],
  },
  {
    kicker: "06 · VERIFIABLE STATUS",
    title: "운영·설정·실험을\n같은 말로 표시하지 않습니다.",
    body: "각 기능 상태를 코드, 테스트, workflow와 문서 근거에 연결해 성공처럼 보이는 미완성 기능을 줄입니다.",
    label: "VERIFY",
    points: ["Vitest", "Playwright", "CI", "Evidence"],
  },
  {
    kicker: "07 · REUSABLE ENGINEERING",
    title: "가져갈 것은 패키지가 아니라\n경계와 검증 순서입니다.",
    body: "입력, 출력, 데이터 권위, 실패와 대체 경로를 유지하면 다른 서비스에서도 같은 설계를 재사용할 수 있습니다.",
    label: "REUSE",
    points: ["Authority", "Failure", "Fallback", "Budget"],
  },
] as const;

const INVESTOR_SCENES: readonly TechnologyScene[] = [
  OVERVIEW_SCENES[0],
  {
    ...OVERVIEW_SCENES[1],
    kicker: "02 · CONNECTED PRODUCTION",
    body: "하나의 프로젝트 맥락이 기획, 제작, 협업과 연재 운영을 연결해 기능 수 이상의 전환 비용을 만듭니다.",
    points: ["Context", "Workflow", "Handoff", "Scale"],
  },
  {
    ...OVERVIEW_SCENES[2],
    kicker: "03 · TECHNICAL DEFENSIBILITY",
    body: "로컬 우선 저장, 전문 렌더링 경계와 재현 가능한 검증이 창작 도구의 신뢰와 확장성을 함께 지킵니다.",
    points: ["Local-first", "GPU", "Recovery", "Quality"],
  },
  {
    ...OVERVIEW_SCENES[6],
    kicker: "04 · CONTROLLED SCALE",
    title: "무료 우선으로 시작하고\n검증된 병목만 승격합니다.",
    body: "비용, 권리, 공급자와 품질 상태를 함께 추적해 성장 과정에서도 자동 유료 승격과 숨은 의존을 만들지 않습니다.",
    points: ["Cost", "Rights", "Providers", "Evidence"],
  },
] as const;

const PORTRAIT_SCENES: readonly TechnologyScene[] = [
  OVERVIEW_SCENES[0],
  OVERVIEW_SCENES[1],
  OVERVIEW_SCENES[2],
  OVERVIEW_SCENES[3],
  OVERVIEW_SCENES[5],
  OVERVIEW_SCENES[6],
] as const;

type TechnologyFilmVariant = "overview" | "investor" | "portrait";

function scenesFor(variant: TechnologyFilmVariant): readonly TechnologyScene[] {
  if (variant === "investor") return INVESTOR_SCENES;
  if (variant === "portrait") return PORTRAIT_SCENES;
  return OVERVIEW_SCENES;
}

function TechnologyStoryFilm({ variant }: { readonly variant: TechnologyFilmVariant }) {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const portrait = height > width;
  const scenes = scenesFor(variant);
  const sceneLength = durationInFrames / scenes.length;
  const sceneIndex = Math.min(scenes.length - 1, Math.floor(frame / sceneLength));
  const scene = scenes[sceneIndex] ?? scenes[0];
  const localFrame = frame - Math.floor(sceneIndex * sceneLength);
  const localDuration = Math.ceil(sceneLength);
  const enter = spring({
    frame: localFrame,
    fps,
    config: { damping: 24, stiffness: 82, mass: 0.9 },
  });
  const opacity = interpolate(
    localFrame,
    [0, 16, Math.max(18, localDuration - 18), Math.max(19, localDuration - 1)],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const progress = (frame + 1) / durationInFrames;
  const ink = "#f3f4e9";
  const muted = "#bfd0b8";
  const green = "#193629";
  const accent = "#cce690";

  return (
    <AbsoluteFill
      style={{
        backgroundColor: green,
        color: ink,
        fontFamily: "'Noto Sans CJK KR', 'Noto Sans', sans-serif",
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(#d9efc013 1px, transparent 1px)",
          backgroundSize: portrait ? "18px 18px" : "22px 22px",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -width * 0.18,
          top: height * 0.08,
          width: width * 0.66,
          height: width * 0.66,
          borderRadius: "50%",
          background: "#2b5037",
          transform: `translateY(${interpolate(frame, [0, durationInFrames], [26, -36])}px)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: portrait ? 46 : 60,
          top: portrait ? 44 : 38,
          fontSize: portrait ? 22 : 24,
          fontWeight: 900,
          letterSpacing: -1,
        }}
      >
        ToonStudio<span style={{ color: accent }}>✳</span>
      </div>
      <div
        style={{
          position: "absolute",
          right: portrait ? 46 : 60,
          top: portrait ? 51 : 46,
          fontSize: portrait ? 9 : 11,
          letterSpacing: portrait ? 1.4 : 2.4,
          color: muted,
        }}
      >
        ENGINEERING STORY · REVIEWABLE BY DESIGN
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: portrait ? "150px 46px 110px" : "126px 64px 92px",
          display: "grid",
          gridTemplateColumns: portrait ? "1fr" : "1.08fr 0.92fr",
          alignItems: portrait ? "start" : "center",
          gap: portrait ? 46 : 64,
          opacity,
        }}
      >
        <section style={{ transform: `translateY(${(1 - enter) * 34}px)` }}>
          <div
            style={{
              marginBottom: portrait ? 22 : 25,
              fontSize: portrait ? 12 : 13,
              fontWeight: 800,
              letterSpacing: 2.8,
              color: accent,
            }}
          >
            {scene.kicker}
          </div>
          <div
            style={{
              fontSize: portrait ? 59 : height < 680 ? 55 : 66,
              fontWeight: 950,
              lineHeight: 1.16,
              letterSpacing: portrait ? -3.8 : -4.5,
              whiteSpace: "pre-line",
              wordBreak: "keep-all",
            }}
          >
            {scene.title}
          </div>
          <div
            style={{
              marginTop: portrait ? 28 : 26,
              maxWidth: portrait ? "100%" : 650,
              fontSize: portrait ? 20 : 19,
              lineHeight: 1.75,
              color: muted,
              wordBreak: "keep-all",
            }}
          >
            {scene.body}
          </div>
        </section>

        <section
          style={{
            alignSelf: portrait ? "stretch" : "center",
            transform: `translateY(${(1 - enter) * 54}px) rotate(${interpolate(localFrame, [0, localDuration], [-1.5, 0.6])}deg)`,
            border: "1px solid #abc39c55",
            borderRadius: portrait ? 26 : 30,
            background: "#f3f4e9",
            color: "#263f2d",
            padding: portrait ? 28 : 30,
            boxShadow: "0 30px 90px #071c1055",
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 20,
              paddingBottom: 20,
              borderBottom: "1px solid #b6c7ad",
              color: "#6c8067",
              fontSize: 11,
              letterSpacing: 1.5,
            }}
          >
            <span>● ● ●</span>
            <span>TOONSTUDIO / TECHNICAL DECISION</span>
            <span>{scene.label}</span>
          </header>

          <div style={{ marginTop: 24, display: "grid", gap: 13 }}>
            {scene.points.map((point, index) => (
              <div
                key={point}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  minHeight: portrait ? 58 : 54,
                  border: "1px solid #c1ceb9",
                  borderRadius: 16,
                  background: index === sceneIndex % scene.points.length ? "#e0eacb" : "#fff",
                  padding: "11px 15px",
                }}
              >
                <span
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: 30,
                    height: 30,
                    flexShrink: 0,
                    borderRadius: "50%",
                    background: "#31533b",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 900,
                  }}
                >
                  {index + 1}
                </span>
                <span style={{ fontSize: portrait ? 18 : 17, fontWeight: 800 }}>{point}</span>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 24,
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
              fontSize: portrait ? 10 : 11,
              color: "#62765e",
              textAlign: "center",
            }}
          >
            <span style={{ borderRadius: 10, background: "#edf1e6", padding: "10px 6px" }}>STATUS</span>
            <span style={{ borderRadius: 10, background: "#edf1e6", padding: "10px 6px" }}>EVIDENCE</span>
            <span style={{ borderRadius: 10, background: "#edf1e6", padding: "10px 6px" }}>FALLBACK</span>
          </div>
        </section>
      </div>

      <div
        style={{
          position: "absolute",
          left: portrait ? 46 : 60,
          right: portrait ? 46 : 60,
          bottom: portrait ? 48 : 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          color: muted,
          fontSize: portrait ? 10 : 11,
        }}
      >
        <span>문제 → 경계 → 검증 → 재사용 · Problem → Boundary → Evidence → Reuse</span>
        <span>{String(sceneIndex + 1).padStart(2, "0")} / {String(scenes.length).padStart(2, "0")}</span>
      </div>
      <div style={{ position: "absolute", insetInline: 0, bottom: 0, height: 6, background: "#294936" }}>
        <div style={{ width: `${progress * 100}%`, height: "100%", background: accent }} />
      </div>
    </AbsoluteFill>
  );
}

export function TechnologyStoryOverviewFilm() {
  return <TechnologyStoryFilm variant="overview" />;
}

export function TechnologyStoryInvestorFilm() {
  return <TechnologyStoryFilm variant="investor" />;
}

export function TechnologyStoryPortraitFilm() {
  return <TechnologyStoryFilm variant="portrait" />;
}
