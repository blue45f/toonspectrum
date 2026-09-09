import type {
  SceneSeed,
  SceneSeedBubble,
  SceneSeedFrame,
  SceneSeedText,
  SceneTemplate,
} from "../studio-scene-templates";

function frame(x: number, y: number, width: number, height: number, bgColor = "#ffffff"): SceneSeedFrame {
  return { type: "frame", x, y, width, height, bgColor, stroke: "#242329", strokeWidth: 3 };
}
function bubble(textValue: string, x: number, y: number, width: number, height: number, variant: SceneSeedBubble["variant"] = "speech", tail: "left" | "right" | "none" = "left"): SceneSeedBubble {
  return { type: "bubble", text: textValue, x, y, width, height, variant, tail, tailDirection: "bottom", fill: "#ffffff", textFill: "#242329", rotation: 0, fontSize: 24 };
}
function text(value: string, x: number, y: number, width: number, fontSize = 32, fill = "#242329"): SceneSeedText {
  return { type: "text", text: value, x, y, width, fontSize, fill, rotation: 0, align: "center" };
}
function composition(id: string, label: string, category: string, description: string, seeds: readonly SceneSeed[]): SceneTemplate {
  return { id, label, category, description, build: (ox, oy) => seeds.map((seed) => ({ ...seed, x: seed.x + ox, y: seed.y + oy })) };
}

export const STUDIO_AUTHORED_SCENE_TEMPLATES_V2: readonly SceneTemplate[] = [
  composition("school-club-reveal", "동아리방의 비밀", "school", "넓은 상황 컷 → 작은 단서 → 마지막 반응 컷으로 발견의 속도를 조절합니다.", [
    frame(30, 0, 660, 300, "#f2f1e8"), frame(30, 342, 250, 180, "#fff8e7"), frame(314, 342, 376, 250),
    bubble("문이 왜 잠겨 있지?", 58, 28, 278, 96), text("찰칵", 444, 206, 160, 34, "#8e7756"),
    bubble("이 사진… 우리 학교잖아.", 340, 390, 312, 110, "scared", "right"),
  ]),
  composition("school-festival-crossing", "축제에서 스쳐 지나감", "school", "군중 속 긴 상황 컷과 짧은 시선 컷 두 개를 이어 첫눈에 알아보는 순간을 만듭니다.", [
    frame(30, 0, 660, 300, "#fff4e1"), frame(30, 344, 310, 180, "#fff9f1"), frame(378, 344, 312, 180, "#f5f8ff"),
    text("웅성웅성", 64, 210, 200, 30, "#b89b72"), bubble("…어?", 70, 370, 180, 82, "thought"), bubble("저 사람…", 428, 410, 210, 82, "thought", "right"),
  ]),
  composition("romance-almost-touch", "닿을 듯한 손", "romance", "세로 여백을 크게 두고 손이 가까워지는 두 컷과 마지막 짧은 대사로 긴장을 만듭니다.", [
    frame(30, 0, 660, 240, "#fff6f3"), frame(30, 330, 660, 300, "#fff0f4"),
    text("…", 284, 104, 152, 50, "#c07a88"), bubble("잠깐만.", 390, 362, 240, 92, "whisper", "right"),
    text("스윽", 76, 518, 150, 28, "#c899a4"),
  ]),
  composition("romance-breakup-rain", "비 오는 이별", "romance", "같은 장면을 거리감이 다른 두 컷으로 반복하고, 아래 긴 무대사 컷으로 감정을 남깁니다.", [
    frame(30, 0, 660, 220, "#e8edf4"), frame(30, 260, 660, 220, "#dde5ef"), frame(30, 540, 660, 360, "#d7e0ec"),
    bubble("우리… 여기까지 하자.", 76, 36, 332, 100, "speech"), bubble("응.", 446, 306, 160, 82, "whisper", "right"),
    { type: "speedLines", x: 48, y: 554, width: 624, height: 330, lineCount: 38, direction: "vertical", stroke: "#93a7c0", strokeWidth: 2, rotation: 0 },
  ]),
  composition("romance-doorway-wait", "문 앞에서 기다린 사람", "romance", "문 너머의 소리 → 문이 열리는 순간 → 짧은 재회 대사를 세 단계로 나눕니다.", [
    frame(30, 0, 660, 150, "#f2eee8"), frame(30, 196, 660, 260, "#fff7ef"), frame(30, 510, 660, 220, "#fff3f5"),
    text("똑, 똑", 270, 48, 180, 40), bubble("누구세요?", 68, 226, 240, 90), bubble("…나야.", 408, 552, 214, 90, "whisper", "right"),
  ]),
  composition("action-rooftop-chase", "옥상 추격", "action", "짧은 가로 속도 컷 두 개 뒤에 큰 착지 컷을 배치해 이동 속도와 충격을 강조합니다.", [
    frame(30, 0, 660, 150, "#e8eff5"), frame(30, 184, 660, 150, "#e3eaf1"), frame(30, 382, 660, 410, "#f5f6f7"),
    { type: "speedLines", x: 44, y: 24, width: 632, height: 108, lineCount: 22, direction: "horizontal", stroke: "#3c4652", strokeWidth: 3, rotation: 0 },
    { type: "speedLines", x: 44, y: 206, width: 632, height: 108, lineCount: 24, direction: "horizontal", stroke: "#3c4652", strokeWidth: 3, rotation: 0 },
    text("쾅!", 216, 524, 288, 94, "#d54d3e"), bubble("잡았다.", 402, 674, 226, 88, "whisper", "right"),
  ]),
  composition("action-impact-reaction", "타격과 반응 분리", "action", "타격 순간을 작은 컷, 충격 결과를 큰 컷으로 분리해 액션 가독성을 높입니다.", [
    frame(30, 0, 250, 210), frame(318, 0, 372, 210, "#f7ece7"), frame(30, 258, 660, 430),
    text("휙", 72, 76, 160, 42), text("퍽!", 392, 66, 220, 68, "#dc5949"),
    { type: "focusLines", x: 64, y: 292, width: 592, height: 340, lineCount: 48, innerRadius: 110, outerRadius: 320, stroke: "#28242a", strokeWidth: 3, noise: 0.2, rotation: 0 },
    bubble("크윽…!", 390, 514, 220, 92, "shout", "right"),
  ]),
  composition("action-villain-reveal", "빌런 등장", "action", "실루엣을 오래 보여주는 큰 컷과 이름·대사를 분리한 등장 연출입니다.", [
    frame(30, 0, 660, 520, "#15141b"), text("또각… 또각…", 66, 84, 250, 34, "#777181"),
    bubble("기다리게 했군.", 336, 328, 292, 100, "whisper", "right"), text("BLACK CROWN", 116, 580, 488, 36, "#b89b65"),
  ]),
  composition("fantasy-guild-quest", "길드 퀘스트 수령", "fantasy", "의뢰 정보·보상·파티 반응을 각각 편집할 수 있는 시스템형 장면입니다.", [
    frame(30, 0, 660, 500, "#efe8d8"), bubble("[ 긴급 의뢰 ]\n북쪽 숲의 마력 폭주 조사", 92, 42, 536, 132, "system", "none"),
    bubble("보상: 500 Gold + 희귀 장비", 116, 204, 488, 86, "box", "none"), bubble("이거… 우리 수준 맞아?", 72, 352, 306, 104, "scared"),
  ]),
  composition("fantasy-level-up", "레벨업 순간", "fantasy", "상태창 → 빛 폭발 → 새 능력 이름의 순서로 게임 판타지 보상을 강조합니다.", [
    frame(30, 0, 660, 190, "#101629"), bubble("LEVEL UP!  24 → 25", 116, 42, 488, 100, "system", "none"),
    { type: "focusLines", x: 64, y: 238, width: 592, height: 360, lineCount: 64, innerRadius: 72, outerRadius: 330, stroke: "#7ad9ff", strokeWidth: 4, noise: 0.2, rotation: 0 },
    text("NEW SKILL", 188, 380, 344, 48, "#e8ca64"), bubble("[ 공간 도약 ]", 216, 504, 288, 88, "system", "none"),
  ]),
  composition("fantasy-palace-whisper", "궁정의 속삭임", "fantasy", "멀리서 보는 알현 컷과 양옆의 작은 속삭임 컷으로 정치적 긴장을 만듭니다.", [
    frame(30, 0, 660, 330, "#efe7d8"), frame(30, 376, 310, 210, "#f6f0e7"), frame(380, 376, 310, 210, "#eee7f4"),
    bubble("저 사람이 새 후계자래.", 56, 410, 252, 94, "whisper"), bubble("왕비가 가만있을까?", 410, 466, 248, 94, "whisper", "right"),
  ]),
  composition("daily-convenience-night", "심야 편의점", "daily", "고요한 야간 상황 컷과 계산대의 짧은 대화, 문밖 여백으로 일상 리듬을 만듭니다.", [
    frame(30, 0, 660, 360, "#edf3f5"), frame(30, 408, 660, 260, "#151922"),
    bubble("봉투 필요하세요?", 58, 46, 278, 94), bubble("아뇨, 괜찮아요.", 364, 220, 264, 94, "speech", "right"), text("딩동", 262, 526, 196, 34, "#d7c068"),
  ]),
  composition("daily-family-dinner", "저녁 식탁", "daily", "같은 공간에서 대사 방향을 바꾸는 3인 대화용 장면입니다.", [
    frame(30, 0, 660, 520, "#fff7e9"), bubble("오늘 학교는 어땠어?", 58, 42, 280, 96), bubble("그냥… 평소랑 같았어.", 356, 178, 286, 100, "speech", "right"),
    bubble("표정은 아닌데?", 92, 348, 250, 94, "speech"), text("달그락", 442, 398, 164, 30, "#b49166"),
  ]),
  composition("daily-video-call", "영상 통화", "daily", "큰 상대 화면과 작은 셀프뷰·채팅 대사를 조합한 현대 커뮤니케이션 장면입니다.", [
    frame(78, 0, 564, 520, "#e8eef2"), frame(438, 32, 164, 120, "#d6dde4"),
    bubble("잘 들려?", 110, 354, 236, 88, "phone"), bubble("응! 화면도 보여.", 356, 404, 240, 88, "phone", "right"),
    text("00:18:42", 272, 40, 176, 22, "#ffffff"),
  ]),
  composition("narrative-memory-shards", "조각난 기억", "narrative", "크기가 다른 세 컷과 짧은 문장을 흩어 회상·트라우마 장면을 구성합니다.", [
    frame(30, 0, 380, 220, "#f0eee8"), frame(444, 28, 246, 310, "#e7e4df"), frame(64, 288, 320, 260, "#f5f1e8"),
    text("그날의 냄새.", 68, 72, 250, 28, "#81786b"), text("깨진 유리.", 462, 228, 200, 28, "#746d6a"), bubble("그리고…", 102, 386, 220, 90, "whisper"),
  ]),
  composition("narrative-scroll-reveal", "세로 스크롤 반전", "narrative", "긴 공백을 사이에 둔 정보 공개 구조로 모바일 세로 스크롤의 반전을 설계합니다.", [
    frame(30, 0, 660, 210, "#f8f7f3"), bubble("문제는 하나였다.", 94, 44, 340, 92, "box", "none"),
    frame(30, 520, 660, 180, "#ebe9ee"), text("그 사람이 이미 죽었다는 것.", 92, 574, 536, 38, "#3b3545"),
    frame(30, 760, 660, 320, "#17151d"), bubble("그럼 방금 전화한 건 누구지?", 266, 856, 360, 108, "scared", "right"),
  ]),
  composition("narrative-episode-recap", "이전 화 3컷 요약", "narrative", "핵심 사건 세 개를 짧은 컷으로 압축해 새 회차 첫 부분에 붙이는 요약 템플릿입니다.", [
    text("지난 이야기", 60, 10, 600, 34), frame(30, 72, 206, 250), frame(257, 72, 206, 250), frame(484, 72, 206, 250),
    bubble("첫 번째 사건", 48, 94, 170, 76, "box", "none"), bubble("두 번째 사건", 275, 214, 170, 76, "box", "none"), bubble("그리고…", 502, 94, 170, 76, "box", "none"),
  ]),
  composition("narrative-episode-end", "회차 엔딩 카드", "narrative", "마지막 한마디·다음 화 예고·작가 코멘트를 분리해 회차 종료를 깔끔하게 만듭니다.", [
    frame(30, 0, 660, 340, "#16151a"), bubble("드디어 찾았다.", 242, 86, 236, 92, "whisper", "none"), text("TO BE CONTINUED", 116, 236, 488, 34, "#d8bc68"),
    frame(30, 392, 660, 240, "#faf7f1"), bubble("다음 화: 숨겨진 방", 102, 430, 516, 82, "box", "none"), bubble("읽어주셔서 감사합니다!", 142, 536, 436, 70, "speech", "none"),
  ]),
];
