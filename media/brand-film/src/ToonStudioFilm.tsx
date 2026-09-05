import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const SCENES = [
  { kicker: "YOUR STORY STARTS HERE", title: "아이디어를\n첫 장면으로.", description: "상상하던 이야기를 직접 만드는 즐거움.", label: "01 / IMAGINE" },
  { kicker: "THE JOY OF MAKING", title: "그리고,\n표현하세요.", description: "브러시와 레이어로 시작하는 나만의 장면.", label: "02 / DRAW" },
  { kicker: "FROM SCENES TO STORIES", title: "장면을 엮어,\n이야기로.", description: "컷과 말풍선, 3D 도구로 더하는 상상.", label: "03 / CREATE" },
  { kicker: "MAKE ROOM FOR YOUR IMAGINATION", title: "다음 이야기는,\n당신의 손끝에서.", description: "툰스튜디오에서 창작을 시작하세요.", label: "04 / TOONSTUDIO" },
] as const;

export function ToonStudioFilm() {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const stacked = height >= width;
  const portrait = height > width;
  const chapter = Math.min(3, Math.floor(frame / 180));
  const local = frame % 180;
  const scene = SCENES[chapter];
  const progress = spring({ frame: local, fps, config: { damping: 22, stiffness: 85 } });
  const opacity = interpolate(local, [0, 14, 162, 179], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const end = chapter === 3;
  const ink = end ? "#f3f4e9" : "#233c2d";
  const muted = end ? "#c0d1b3" : "#5d755d";
  const artWidth = stacked ? (portrait ? width - 100 : 600) : width * 0.45;
  const fontSize = portrait ? (end ? 61 : 67) : stacked ? 62 : end ? 58 : height < 680 ? 61 : 68;
  return <AbsoluteFill style={{ backgroundColor: end ? "#193629" : "#f3f4e9", color: ink, fontFamily: "'Noto Sans CJK KR', 'Noto Sans', sans-serif", overflow: "hidden" }}>
    <AbsoluteFill style={{ backgroundImage: end ? "radial-gradient(#cce89012 1px,transparent 1px)" : "radial-gradient(#33572a12 1px,transparent 1px)", backgroundSize: "20px 20px" }} />
    <div style={{ position: "absolute", width: width * 0.66, height: width * 0.66, borderRadius: "50%", background: end ? "#284c32" : "#e2ebd0", right: -width * 0.16, top: height * 0.2, transform: `translateY(${interpolate(frame, [0, 720], [15, -30])}px)` }} />
    <div style={{ position: "absolute", left: 55, top: 36, fontSize: 22, fontWeight: 800, letterSpacing: -1 }}>ToonStudio<span style={{ color: "#83a357" }}>✳</span></div>
    <div style={{ position: "absolute", right: 55, top: 43, fontSize: portrait ? 9 : 11, letterSpacing: portrait ? 1 : 2, color: muted }}>CREATE YOUR NEXT STORY</div>
    <div style={{ position: "absolute", inset: 0, padding: stacked ? (portrait ? "146px 50px 100px" : "112px 80px 80px") : "132px 55px 100px", display: "flex", flexDirection: stacked ? "column" : "row", alignItems: stacked ? "flex-start" : "center", justifyContent: stacked ? "flex-start" : "space-between", gap: stacked ? (portrait ? 44 : 28) : 40, opacity }}>
      <div style={{ width: stacked ? "100%" : "47%", transform: `translateY(${(1 - progress) * 30}px)`, flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2.4, color: muted, marginBottom: 22 }}>{scene.kicker}</div>
        <div style={{ fontSize, fontWeight: 900, lineHeight: 1.22, letterSpacing: -3.8, whiteSpace: "pre-line" }}>{scene.title}</div>
        <div style={{ marginTop: 24, fontSize: portrait ? 21 : 19, lineHeight: 1.8, color: muted, wordBreak: "keep-all" }}>{scene.description}</div>
        {end && <div style={{ marginTop: 20, display: "inline-flex", alignItems: "center", gap: 30, padding: "13px 25px", background: "#d3ec9c", color: "#284125", fontSize: 17, borderRadius: 8, fontWeight: 700 }}>스튜디오 시작하기 <span>↗</span></div>}
      </div>
      <div style={{ width: artWidth, alignSelf: "center", transform: `translateY(${(1 - progress) * 45}px) rotate(${interpolate(local, [0, 179], [-2, 1])}deg) scale(${interpolate(local, [0, 179], [0.97, 1.025])})`, background: "#fff", border: "1px solid #bdcbb6", borderRadius: 14, padding: 13, color: "#2a422f", boxShadow: "0 25px 70px #0b27102b", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, height: 26, padding: "0 5px 10px", color: "#667d5c" }}><span>● ● ●</span><span>나의 첫 번째 이야기 / CHAPTER 01</span><span>✳</span></div>
        <Img src={staticFile("brand/studio-scene.svg")} style={{ display: "block", width: "100%", borderRadius: 3 }} />
        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 5px 1px", fontSize: 10, letterSpacing: 1, color: "#647b5c" }}><span>DRAW · TELL · BUILD</span><span>{scene.label}</span></div>
      </div>
    </div>
    <div style={{ position: "absolute", left: 55, bottom: portrait ? 54 : 32, fontSize: portrait ? 9 : 11, color: muted }}>제작 흐름을 시각화한 브랜드 필름 · Illustrated creative workflow</div>
    <div style={{ position: "absolute", right: 55, bottom: 32, fontSize: 12, color: muted }}>toonstudio.cloud</div>
    <div style={{ position: "absolute", left: 0, bottom: 0, height: 5, background: "#a7c676", width: `${(frame + 1) / 720 * 100}%` }} />
  </AbsoluteFill>;
}
