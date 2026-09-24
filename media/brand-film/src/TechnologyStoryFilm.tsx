import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import technologyFilmScript from "../../../apps/web/src/domains/legal/technology/technology-film-script.json";

interface LocalizedTechnologyText {
  readonly ko: string;
  readonly en: string;
}

interface TechnologyScene {
  readonly id: string;
  readonly kicker: string;
  readonly title: LocalizedTechnologyText;
  readonly body: LocalizedTechnologyText;
  readonly narration: LocalizedTechnologyText;
  readonly label: string;
  readonly points: readonly string[];
}

export const TECHNOLOGY_FILM_FPS = technologyFilmScript.fps;
export const TECHNOLOGY_OVERVIEW_DURATION_SECONDS =
  technologyFilmScript.variants.overview.durationSeconds;
export const TECHNOLOGY_INVESTOR_DURATION_SECONDS =
  technologyFilmScript.variants.investor.durationSeconds;
export const TECHNOLOGY_PORTRAIT_DURATION_SECONDS =
  technologyFilmScript.variants.portrait.durationSeconds;

const OVERVIEW_SCENES =
  technologyFilmScript.variants.overview.scenes as readonly TechnologyScene[];
const INVESTOR_SCENES =
  technologyFilmScript.variants.investor.scenes as readonly TechnologyScene[];
const overviewById = new Map(OVERVIEW_SCENES.map((scene) => [scene.id, scene]));
const PORTRAIT_SCENES = technologyFilmScript.variants.portrait.sceneIds.map((id) => {
  const scene = overviewById.get(id);
  if (!scene) throw new Error(`Unknown portrait technology-film scene: ${id}`);
  return scene;
});

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
            {scene.title.ko}
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
            {scene.body.ko}
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
