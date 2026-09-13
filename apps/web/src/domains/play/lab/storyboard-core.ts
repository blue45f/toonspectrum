import { escapeXml, freshSeed, strokeSvg, svgDocument, validStrokes, type Stroke } from "./creative-core";

export const CAMERA_ANGLES = ["와이드", "미디엄", "클로즈업", "하이 앵글", "로우 앵글"] as const;
export type ComicPanel = { id: string; beat: string; caption: string; direction: string; camera: string; strokes: Stroke[] };
export type Storyboard = { version: 1; title: string; panels: ComicPanel[] };
export const BOARD_PRESETS = [
  { name: "작은 반전", title: "오늘의 작은 반전", beats: ["평범한 시작", "이상한 낌새", "예상 밖의 순간", "뜻밖의 마무리"], directions: ["주인공의 일상과 장소를 보여 주세요.", "독자가 먼저 알아챌 단서를 넣어 보세요.", "가장 중요한 행동을 크게 보여 주세요.", "첫 컷과 대비되는 표정으로 끝내 보세요."] },
  { name: "말 없는 코미디", title: "말하지 않아도", beats: ["갖고 싶은 것", "첫 번째 시도", "더 큰 실수", "우연한 해결"], directions: ["시선으로 욕망을 보여 주세요.", "몸의 기울기로 노력을 표현해 보세요.", "같은 구도를 반복하며 변화를 강조해 보세요.", "작은 몸짓 하나로 웃음을 완성해 보세요."] },
  { name: "포근한 일상", title: "조금 더 다정한 하루", beats: ["지친 하루", "작은 발견", "뜻밖의 배려", "돌아오는 미소"], directions: ["여백을 넓게 두고 마음의 상태를 보여 주세요.", "소품 하나를 가까이 보여 주세요.", "손과 시선을 연결해 보세요.", "첫 컷의 장소에 달라진 분위기를 담아 보세요."] },
  { name: "한 컷의 미스터리", title: "사라진 오후", beats: ["의문의 흔적", "엇갈린 증언", "놓쳤던 단서", "다시 보이는 첫 컷"], directions: ["눈에 띄지만 의미를 알 수 없는 물건을 두세요.", "둘의 시선이 다른 곳을 향하게 해 보세요.", "배경에서 중요했던 부분을 확대해 보세요.", "처음의 장면을 새로운 의미로 반복해 보세요."] },
  { name: "두근거리는 순간", title: "한 걸음 가까이", beats: ["엇갈린 타이밍", "같은 물건", "잠깐의 침묵", "함께 걷는 길"], directions: ["두 인물 사이에 거리를 두어 시작해 보세요.", "같은 소품으로 시선을 연결해 보세요.", "작은 표정 변화를 크게 보여 주세요.", "두 인물을 같은 방향으로 배치해 보세요."] },
  { name: "작은 SF", title: "로봇이 배운 것", beats: ["완벽한 규칙", "계산 밖의 사건", "처음 하는 선택", "새로운 규칙"], directions: ["반복과 대칭으로 질서를 보여 주세요.", "반복 속에 다른 모양 하나를 넣어 보세요.", "주인공이 멈춘 순간을 크게 보여 주세요.", "첫 컷의 질서에 작은 변화를 남겨 보세요."] },
] as const;
export function createBoard(index = 0): Storyboard {
  const preset = BOARD_PRESETS[index] ?? BOARD_PRESETS[0];
  return { version: 1, title: preset.title, panels: preset.beats.map((beat, i) => ({ id: freshSeed(), beat, caption: "", direction: preset.directions[i], camera: CAMERA_ANGLES[i === 2 ? 2 : i === 1 ? 1 : 0], strokes: [] })) };
}
export function validBoard(value: unknown): value is Storyboard {
  if (!value || typeof value !== "object") return false;
  const board = value as Storyboard;
  const shortText = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
  return board.version === 1 && shortText(board.title, 80) && Array.isArray(board.panels) && board.panels.length === 4 && new Set(board.panels.map((p) => p?.id)).size === 4 && board.panels.every((p) => p && typeof p.id === "string" && /^[\w-]{1,100}$/.test(p.id) && shortText(p.beat, 60) && shortText(p.caption, 80) && shortText(p.direction, 240) && CAMERA_ANGLES.some((angle) => angle === p.camera) && validStrokes(p.strokes));
}
export function movePanel(board: Storyboard, from: number, to: number): Storyboard {
  if (![from, to].every((i) => Number.isInteger(i) && i >= 0 && i < 4) || from === to) return board;
  const panels = [...board.panels]; const [panel] = panels.splice(from, 1); panels.splice(to, 0, panel);
  return { ...board, panels };
}
function lines(text: string, length: number, max: number): string[] {
  const chars = Array.from(text.replace(/\s+/g, " "));
  return Array.from({ length: Math.min(max, Math.ceil(chars.length / length)) }, (_, i) => chars.slice(i * length, (i + 1) * length).join("") + (i === max - 1 && chars.length > max * length ? "…" : ""));
}
export function boardSvg(board: Storyboard): string {
  const text = (content: string, x: number, y: number, size: number, color = "#322b28") => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-family="sans-serif">${escapeXml(content)}</text>`;
  const title = lines(board.title || "나의 4컷 콘티", 38, 2).map((line, i) => text(line, 40, 42 + i * 32, 28)).join("");
  const panels = board.panels.map((panel, i) => {
    const x = 40 + (i % 2) * 615; const y = 108 + Math.floor(i / 2) * 528;
    return `<rect x="${x}" y="${y}" width="585" height="510" rx="10" fill="none" stroke="#322b28" stroke-width="2"/>${text(`${i + 1}. ${panel.beat.slice(0, 18)} · ${panel.camera}`, x + 20, y + 30, 18)}<svg x="${x + 20}" y="${y + 48}" width="545" height="340" viewBox="0 0 960 600">${strokeSvg(panel.strokes)}</svg>${lines(panel.caption, 28, 3).map((line, j) => text(line, x + 20, y + 410 + j * 22, 18)).join("")}${lines(panel.direction, 36, 2).map((line, j) => text(line, x + 20, y + 474 + j * 18, 14, "#685d51")).join("")}`;
  }).join("");
  return svgDocument(`${title}${panels}${text("ToonStudio · Four-panel storyboard / 긴 연출 메모는 JSON·텍스트 원본에서 확인", 40, 1190, 16, "#685d51")}`, 1280, 1220, board.title);
}
export const boardText = (board: Storyboard) => `# ${board.title}\n\n${board.panels.map((panel, i) => `## ${i + 1}컷 · ${panel.beat}\n카메라: ${panel.camera}\n대사: ${panel.caption}\n연출: ${panel.direction}`).join("\n\n")}`;
