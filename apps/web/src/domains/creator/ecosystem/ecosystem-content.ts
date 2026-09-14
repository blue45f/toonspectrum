import type { El, DrawEl } from "../studio-element-model";
import type { PageState } from "../studio-page-state";

export type SceneEnvironment = "cafe" | "classroom" | "office" | "shop" | "subway" | "alley";
export type ActingPose = "talk" | "give" | "whisper" | "run" | "lean" | "sit";
export type CharacterEmotion = "neutral" | "happy" | "surprised" | "sad" | "angry" | "thinking";
export type ProcessStage = "storyboard" | "ink" | "color" | "final";
export interface SceneRecipe { id: string; title: string; environment: SceneEnvironment; pose: ActingPose; mood: CharacterEmotion; camera: string; lesson: string }
export interface SampleWork { id: string; title: string; genre: string; description: string; scenes: readonly string[]; lines: readonly (readonly [string, string])[]; }
export const ORIGINAL_CONTENT_CREDIT = "ToonStudio 자체 벡터 예제 · 제3자 이미지·생성형 이미지 미사용 · 모든 요소 편집 가능";
export const SCENE_RECIPES: readonly SceneRecipe[] = [
  { id: "cafe-talk", title: "카페에서 마주 앉기", environment: "cafe", pose: "sit", mood: "neutral", camera: "아이 레벨 · 투 샷", lesson: "두 사람의 시선과 말풍선 순서를 연결합니다." },
  { id: "confession", title: "말하기 직전의 망설임", environment: "cafe", pose: "talk", mood: "thinking", camera: "미디엄 투 샷", lesson: "짧은 대사 뒤의 여백으로 멈춤을 만듭니다." },
  { id: "handoff", title: "물건 건네기", environment: "classroom", pose: "give", mood: "happy", camera: "손동작 중심 투 샷", lesson: "건네는 손과 받는 손이 같은 지점을 향하도록 합니다." },
  { id: "classroom", title: "교실의 작은 오해", environment: "classroom", pose: "talk", mood: "surprised", camera: "아이 레벨 · 투 샷", lesson: "대사보다 표정을 먼저 읽게 배치합니다." },
  { id: "office", title: "회의 뒤 짧은 대화", environment: "office", pose: "sit", mood: "thinking", camera: "미디엄 투 샷", lesson: "대화에 필요한 배경 정보만 남깁니다." },
  { id: "conflict", title: "의견이 부딪치는 순간", environment: "office", pose: "talk", mood: "angry", camera: "대칭 투 샷", lesson: "같은 높이의 인물과 간격으로 대립을 표현합니다." },
  { id: "shop", title: "편의점에서 다시 만나기", environment: "shop", pose: "give", mood: "happy", camera: "아이 레벨 · 투 샷", lesson: "작은 소품으로 장면의 목적을 분명히 합니다." },
  { id: "subway", title: "같은 방향으로 가는 두 사람", environment: "subway", pose: "lean", mood: "neutral", camera: "정면 투 샷", lesson: "평행한 배경선과 인물 방향으로 안정감을 만듭니다." },
  { id: "whisper", title: "귓속말", environment: "subway", pose: "whisper", mood: "thinking", camera: "가까운 투 샷", lesson: "몸의 거리와 작은 말풍선으로 사적인 대화를 표현합니다." },
  { id: "chase", title: "골목 추격", environment: "alley", pose: "run", mood: "surprised", camera: "진행 방향이 있는 투 샷", lesson: "동작이 향하는 쪽에 여백을 남깁니다." },
  { id: "reveal", title: "예상과 다른 발견", environment: "alley", pose: "talk", mood: "surprised", camera: "반응 투 샷", lesson: "반전 직전과 직후의 정보량을 다르게 구성합니다." },
  { id: "reconcile", title: "어깨에 기대기", environment: "cafe", pose: "lean", mood: "happy", camera: "가까운 투 샷", lesson: "거리 변화로 관계의 변화를 보여줍니다." },
];
export const SAMPLE_WORKS: readonly SampleWork[] = [
  { id: "romance", title: "라테 한 잔의 용기", genre: "로맨스", description: "주문을 잘못 받은 두 사람이 다음 만남을 약속하는 4컷.", scenes: ["cafe-talk", "confession", "handoff", "reconcile"], lines: [["제 라테가 그쪽으로 갔네요.", "그럼 제 용기도 같이 갔을까요?"], ["그건 무슨 뜻이에요?", "같이 마시자고 말하려던 용기요."], ["라테는 돌려드릴게요.", "용기는요?"], ["내일도 가져오세요.", "두 잔 주문해 둘게요."]] },
  { id: "daily", title: "회의의 진짜 결론", genre: "일상", description: "회의 끝의 침묵을 간식 하나가 해결하는 4컷.", scenes: ["office", "conflict", "shop", "office"], lines: [["좋은 의견 더 없을까요?", "중요한 문제가 하나 있습니다."], ["일정이요? 예산이요?", "모두 점심을 못 먹었어요."], ["이건 긴급 의사결정이네요.", "삼각김밥으로 만장일치!"], ["이제 의견이 떠오르네요.", "회의록 첫 줄: 밥부터 먹자."]] },
  { id: "action", title: "사라진 마지막 빵", genre: "액션", description: "골목 추격 끝에서 발견하는 뜻밖의 배달 임무.", scenes: ["shop", "chase", "reveal", "handoff"], lines: [["마지막 빵을 가져갔어!", "지금 따라가면 잡을 수 있어!"], ["저 골목으로 꺾었어!", "잠깐, 봉투에 이름이 있는데?"], ["우리 반 선생님 이름이야.", "생일 깜짝 배달이었구나."], ["저희도 배달 도와드릴게요.", "그럼 촛불 담당은 너희야!"]] },
  { id: "mystery", title: "빈자리의 쪽지", genre: "미스터리", description: "같은 시간 같은 자리에 남는 쪽지의 비밀.", scenes: ["subway", "whisper", "reveal", "classroom"], lines: [["오늘도 이 자리에 쪽지가 있어.", "항상 같은 글씨네."], ["'내일도 무사히 도착하기.'", "누가 누구에게 쓴 걸까?"], ["뒤에 이름이 적혀 있어.", "매일의 나에게, 라고?"], ["잊기 쉬운 약속이었구나.", "오늘은 우리도 한 줄 남기자."]] },
];
const INK = "#35303c";
const PAPER = "#fffaf1";
function painter(elements: El[], nextId: () => string) {
  const draw = (kind: NonNullable<DrawEl["kind"]>, points: number[], fill = "transparent", stroke = INK, width = 3, name = "original:detail") => {
    elements.push({ id: nextId(), type: "draw", kind, points, fill, stroke, strokeWidth: width, name });
  };
  return {
    rect: (x: number, y: number, w: number, h: number, fill: string, name?: string) => draw("rect", [x, y, x + w, y + h], fill, INK, 2, name),
    oval: (x: number, y: number, w: number, h: number, fill: string, name?: string) => draw("ellipse", [x, y, x + w, y + h], fill, INK, 2, name),
    line: (points: number[], stroke = INK, width = 3, name?: string) => draw(points.length === 4 ? "line" : "freehand", points, "transparent", stroke, width, name),
  };
}
function background(elements: El[], environment: SceneEnvironment, y: number, nextId: () => string) {
  const p = painter(elements, nextId);
  const tones = { cafe: "#f3dbc0", classroom: "#e6e9d5", office: "#dfe6e8", shop: "#f4e2d4", subway: "#dfe5df", alley: "#ddd7e6" };
  p.rect(32, y, 736, 470, tones[environment], `original:background:${environment}`);
  p.rect(32, y + 330, 736, 140, "#d4bea7", "original:background:floor");
  if (environment === "cafe" || environment === "office") {
    for (const x of [72, 302, 532]) {
      p.rect(x, y + 50, 190, 200, "#d8edf0");
      p.line([x + 95, y + 50, x + 95, y + 250]);
      p.line([x, y + 150, x + 190, y + 150]);
    }
    p.rect(75, y + 270, 70, 60, "#8eaa80");
    p.oval(85, y + 220, 50, 90, "#88a887");
  } else if (environment === "classroom") {
    p.rect(90, y + 70, 620, 200, "#597b73");
    p.rect(100, y + 255, 600, 15, "#c8a77f");
    p.line([200, y + 160, 350, y + 160], PAPER, 4);
  } else if (environment === "shop") {
    for (const row of [100, 180, 260]) {
      p.rect(70, y + row + 45, 660, 12, "#bda48d");
      for (let column = 0; column < 10; column++) p.rect(85 + column * 64, y + row, 40, 45, column % 2 ? "#c1d5ac" : "#ead79a");
    }
  } else if (environment === "subway") {
    p.rect(70, y + 40, 660, 310, "#becbd0");
    for (const x of [105, 430]) p.rect(x, y + 75, 265, 170, "#8da4b4");
    p.line([400, y + 40, 400, y + 350], INK, 4);
    for (const x of [150, 280, 520, 650]) { p.line([x, y + 20, x, y + 90]); p.oval(x - 15, y + 90, 30, 35, PAPER); }
  } else {
    p.rect(40, y + 30, 190, 300, "#9693aa"); p.rect(590, y + 30, 170, 300, "#afa1b0");
    for (const x of [65, 145, 610, 685]) for (const row of [60, 145, 230]) p.rect(x, y + row, 40, 55, "#eee1aa");
    p.line([230, y + 330, 370, y + 230, 430, y + 230, 590, y + 330], "#9c8d95", 3);
  }
}
function character(elements: El[], id: "nari" | "jun", x: number, y: number, pose: ActingPose, mood: CharacterEmotion, facing: -1 | 1, nextId: () => string) {
  const p = painter(elements, nextId);
  const coat = id === "nari" ? "#d77860" : "#638daa";
  const skin = "#f0c5a4";
  const headX = x + (pose === "lean" ? facing * 20 : 0);
  p.oval(headX - 49, y + 120, 98, 98, id === "nari" ? "#58433f" : "#373e4b", `original:actor:${id}:hair`);
  p.oval(headX - 40, y + 137, 80, 78, skin, `original:actor:${id}:face`);
  p.rect(x - 13, y + 207, 26, 23, skin);
  p.rect(x - 47, y + 230, 94, 100, coat, `world:${id}:coat`);
  const stride = pose === "run" ? 48 : pose === "sit" ? 35 : 10;
  p.line([x - 23, y + 330, x - 25 - stride, y + 390, x - 28 - stride, y + 429], INK, 22);
  p.line([x + 23, y + 330, x + 25 + stride, y + 390, x + 28 + stride, y + 429], INK, 22);
  p.oval(x - 50 - stride, y + 420, 42, 20, INK); p.oval(x + 8 + stride, y + 420, 42, 20, INK);
  for (const side of [-1, 1] as const) {
    const handX = pose === "give" && side === facing ? 400 : x + side * (pose === "run" ? 100 : 72);
    const handY = y + (pose === "whisper" && side === facing ? 185 : pose === "run" ? 270 : 318);
    const points = [x + side * 43, y + 240, x + side * 67, y + 280, handX, handY];
    p.line(points, INK, 25); p.line(points, coat, 20, `world:${id}:coat`);
    p.oval(handX - 11, handY - 10, 22, 24, skin);
  }
  for (const side of [-1, 1]) {
    const eyeY = y + 170;
    p.oval(headX + side * 16 - 4, eyeY, 8, mood === "surprised" ? 13 : 8, INK);
    if (mood === "angry") p.line([headX + side * 27, eyeY - 12, headX + side * 9, eyeY - 6], INK, 3);
    if (mood === "sad") p.line([headX + side * 27, eyeY - 6, headX + side * 9, eyeY - 12], INK, 3);
  }
  if (mood === "surprised") p.oval(headX - 6, y + 192, 12, 15, "#a86668");
  else p.line([headX - 12, y + 193, headX, y + (mood === "happy" ? 201 : mood === "sad" ? 187 : 193), headX + 12, y + 193], INK, 3);
}
function addScene(elements: El[], recipe: SceneRecipe, y: number, lines: readonly [string, string], nextId: () => string) {
  background(elements, recipe.environment, y, nextId);
  const close = recipe.pose === "lean" || recipe.pose === "whisper";
  character(elements, "nari", close ? 300 : 225, y, recipe.pose, recipe.mood, 1, nextId);
  character(elements, "jun", close ? 500 : 575, y, recipe.pose, recipe.mood === "angry" ? "thinking" : recipe.mood, -1, nextId);
  if (recipe.pose === "sit") painter(elements, nextId).rect(120, y + 335, 560, 24, "#ae8363", "original:prop:table");
  if (recipe.pose === "give") painter(elements, nextId).rect(377, y + 290, 46, 30, "#e3c685", "world:parcel:appearance");
  for (const [index, text] of lines.entries()) {
    elements.push({ id: nextId(), type: "bubble", variant: "round", text, x: 60 + index * 340, y: y + 18,
      width: 290, height: 92, fill: PAPER, textFill: INK, rotation: 0, fontSize: 24, tail: index ? "right" : "left", name: `original:dialogue:${index}` });
  }
  elements.push({ id: nextId(), type: "frame", x: 32, y, width: 736, height: 470, stroke: INK, strokeWidth: 3, name: `original:scene:${recipe.id}` });
}
function scaledElement(element: El, scale: number): El {
  if (element.type === "draw") return { ...element, points: element.points.map(value => value * scale), strokeWidth: element.strokeWidth * scale };
  if (element.type === "frame") return { ...element, x: element.x * scale, y: element.y * scale, width: element.width * scale, height: element.height * scale, strokeWidth: (element.strokeWidth ?? 2) * scale };
  if (element.type === "bubble") return { ...element, x: element.x * scale, y: element.y * scale, width: element.width * scale, height: element.height * scale, fontSize: (element.fontSize ?? 24) * scale };
  if (element.type === "text") return { ...element, x: element.x * scale, y: element.y * scale, width: element.width * scale, fontSize: element.fontSize * scale };
  return element;
}
function stageElement(element: El, stage: ProcessStage): El {
  if (stage === "final") return element;
  if (element.type === "bubble" && stage === "color") return { ...element, text: "" };
  if (element.type !== "draw" || stage === "color") return element;
  return { ...element, fill: element.fill === "transparent" ? "transparent" : stage === "storyboard" ? "#e5e1da" : PAPER, stroke: INK, strokeWidth: stage === "storyboard" ? 1.5 : element.strokeWidth };
}
function makePage(title: string, scenes: readonly { recipe: SceneRecipe; lines: readonly [string, string] }[], width: number, stage: ProcessStage, nextId: () => string): PageState {
  if (!Number.isFinite(width) || width < 320 || width > 8192) throw new Error("예제 원고 너비는 320~8192px이어야 합니다.");
  const elements: El[] = [{ id: nextId(), type: "text", text: title, x: 40, y: 22, width: 720, fontSize: 28, fill: INK, rotation: 0, fontStyle: "bold", name: "original:title" }];
  scenes.forEach((scene, index) => addScene(elements, scene.recipe, 90 + index * 560, scene.lines, nextId));
  return { id: nextId(), name: title, bg: PAPER, bgGrad: null, canvasH: (90 + scenes.length * 560) * width / 800,
    note: `${ORIGINAL_CONTENT_CREDIT}\n${scenes.map(scene => `${scene.recipe.title}: ${scene.recipe.lesson}`).join("\n")}`,
    elements: elements.map(element => scaledElement(stageElement(element, stage), width / 800)) };
}
export function createOriginalSample(id: string, width = 800, stage: ProcessStage = "final", nextId: () => string = () => crypto.randomUUID()): PageState {
  const work = SAMPLE_WORKS.find(item => item.id === id);
  if (!work) throw new Error("등록되지 않은 예제 작품입니다.");
  const scenes = work.scenes.map((sceneId, index) => {
    const recipe = SCENE_RECIPES.find(item => item.id === sceneId);
    if (!recipe || !work.lines[index]) throw new Error("예제 장면 연결이 올바르지 않습니다.");
    return { recipe, lines: work.lines[index] };
  });
  return makePage(work.title, scenes, width, stage, nextId);
}
