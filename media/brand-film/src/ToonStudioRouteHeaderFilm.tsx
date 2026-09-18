import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
} from "remotion";

const SCENES = [
  { background: "#f4eee2", surface: "#fffaf2", ink: "#27382d", accent: "#f08b4b", glow: "#d7e8bd" },
  { background: "#eef1e7", surface: "#fffdf7", ink: "#23392e", accent: "#e56f3d", glow: "#b9dbca" },
  { background: "#edf0f5", surface: "#fbfcff", ink: "#273447", accent: "#7388ca", glow: "#c5d6f1" },
  { background: "#183024", surface: "#f5f3e9", ink: "#21362a", accent: "#b7d77f", glow: "#345541" },
] as const;

const image = staticFile("brand/studio-scene.svg");
export function ToonStudioRouteHeaderFilm() {
  const frame = useCurrentFrame();
  const chapter = Math.min(3, Math.floor(frame / 180));
  const local = frame % 180;
  const scene = SCENES[chapter];
  const phase = (local / 180) * Math.PI * 2;
  const drift = Math.sin(phase) * 12;
  const float = Math.cos(phase) * 4;
  const zoom = 1.05 + Math.sin(phase) * 0.018;

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        backgroundColor: scene.background,
        color: scene.ink,
        fontFamily: "'Noto Sans CJK KR', 'Noto Sans', sans-serif",
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(circle at 18% 28%, ${scene.glow}aa 0 12%, transparent 34%), radial-gradient(circle at 82% 68%, ${scene.accent}24 0 10%, transparent 33%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "6% 11%",
          border: `1px solid ${scene.ink}18`,
          borderRadius: 34,
          opacity: 0.72,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "15%",
          right: "15%",
          top: "9%",
          bottom: "9%",
          opacity: 1,
          transform: `translateY(${float}px)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "21%",
            top: "3%",
            width: "58%",
            height: "94%",
            overflow: "hidden",
            border: `2px solid ${scene.ink}1f`,
            borderRadius: 30,
            background: scene.surface,
            boxShadow: `0 34px 90px ${scene.ink}2d`,
          }}
        >
          <Img
            src={image}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: chapter === 1 ? "54% 50%" : chapter === 2 ? "48% 52%" : "50% 50%",
              transform: `translateX(${drift * 0.12}px) scale(${zoom})`,
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            left: "2%",
            top: "23%",
            width: "27%",
            height: "54%",
            overflow: "hidden",
            border: `1px solid ${scene.ink}20`,
            borderRadius: 24,
            background: scene.surface,
            boxShadow: `0 22px 55px ${scene.ink}24`,
            transform: `translateX(${drift * 0.35}px) rotate(-2deg)`,
          }}
        >
          <Img
            src={image}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "14% 56%",
              transform: `scale(${1.28 + chapter * 0.012})`,
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            right: "1%",
            top: "17%",
            width: "25%",
            height: "61%",
            overflow: "hidden",
            border: `1px solid ${scene.ink}20`,
            borderRadius: 24,
            background: scene.surface,
            boxShadow: `0 24px 60px ${scene.ink}25`,
            transform: `translateX(${drift * -0.3}px) rotate(2.4deg)`,
          }}
        >
          <Img
            src={image}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "86% 48%",
              transform: `scale(${1.31 + chapter * 0.01})`,
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            left: "14%",
            bottom: "7%",
            display: "flex",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 999,
            background: `${scene.surface}e8`,
            boxShadow: `0 12px 32px ${scene.ink}1a`,
          }}
        >
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              style={{
                width: dot === chapter % 3 ? 34 : 10,
                height: 10,
                borderRadius: 999,
                background: dot === chapter % 3 ? scene.accent : `${scene.ink}25`,
              }}
            />
          ))}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: "12%",
          right: "12%",
          bottom: 18,
          height: 4,
          overflow: "hidden",
          borderRadius: 999,
          background: `${scene.ink}12`,
        }}
      >
        <div
          style={{
            width: `${((frame + 1) / 720) * 100}%`,
            height: "100%",
            borderRadius: 999,
            background: scene.accent,
          }}
        />
      </div>
    </AbsoluteFill>
  );
}
