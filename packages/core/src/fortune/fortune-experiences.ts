export const FORTUNE_GROUPS = ["전체", "사주·역법", "시간의 흐름", "관계·궁합", "카드·상징", "창작·일상"] as const;
export type FortuneGroup = typeof FORTUNE_GROUPS[number];
export interface FortuneExperience { id: string; title: string; subtitle: string; glyph: string; group: FortuneGroup; input: "birth" | "pair" | "calendar" | "dream" | "none"; tag: string }
export const FORTUNE_EXPERIENCES: readonly FortuneExperience[] = [
  { id: "saju", title: "사주팔자", subtitle: "나를 이루는 네 기둥, 여덟 글자", glyph: "命", group: "사주·역법", input: "birth", tag: "절입 시각 반영" },
  { id: "almanac", title: "만세력 달력", subtitle: "양력·음력·일진을 한눈에", glyph: "曆", group: "사주·역법", input: "calendar", tag: "한국 음력" },
  { id: "elements", title: "오행 밸런스", subtitle: "목·화·토·금·수의 다섯 가지 결", glyph: "五", group: "사주·역법", input: "birth", tag: "수치와 해설" },
  { id: "ten-gods", title: "십성 탐구", subtitle: "일간을 중심으로 읽는 관계의 언어", glyph: "十", group: "사주·역법", input: "birth", tag: "천간 십성" },
  { id: "cycles", title: "대운 타임라인", subtitle: "열 해 단위의 전통적 흐름 살펴보기", glyph: "運", group: "사주·역법", input: "birth", tag: "근사 계산·방향 선택" },
  { id: "terms", title: "24절기 산책", subtitle: "계절이 바뀌는 순간을 한국 시각으로", glyph: "節", group: "사주·역법", input: "calendar", tag: "분·초 단위" },
  { id: "today", title: "오늘의 운세", subtitle: "오늘의 분위기와 작은 실천 하나", glyph: "日", group: "시간의 흐름", input: "birth", tag: "오늘의 일진" },
  { id: "tomorrow", title: "내일의 운세", subtitle: "한 걸음 먼저 준비하는 내일", glyph: "明", group: "시간의 흐름", input: "birth", tag: "내일의 일진" },
  { id: "weekly", title: "주간 운세", subtitle: "일곱 날에 어울리는 일곱 가지 질문", glyph: "週", group: "시간의 흐름", input: "birth", tag: "7일 리포트" },
  { id: "monthly", title: "월간 운세", subtitle: "한 달의 일진과 생활 리듬", glyph: "月", group: "시간의 흐름", input: "birth", tag: "월간 캘린더" },
  { id: "yearly", title: "신년·연간 운세", subtitle: "열두 달을 채우는 나만의 키워드", glyph: "年", group: "시간의 흐름", input: "birth", tag: "선택 연도" },
  { id: "love-match", title: "연애 궁합", subtitle: "끌리는 점과 함께 조율할 점", glyph: "♡", group: "관계·궁합", input: "pair", tag: "두 사람의 원국" },
  { id: "friend-match", title: "친구 궁합", subtitle: "닮은 취향과 다른 속도 이해하기", glyph: "友", group: "관계·궁합", input: "pair", tag: "우정의 대화" },
  { id: "family-match", title: "가족 궁합", subtitle: "가까운 사이일수록 필요한 여백", glyph: "和", group: "관계·궁합", input: "pair", tag: "존중과 거리" },
  { id: "team-match", title: "협업 궁합", subtitle: "함께 창작할 때의 강점과 약속", glyph: "合", group: "관계·궁합", input: "pair", tag: "창작 파트너" },
  { id: "tarot", title: "오늘의 타로", subtitle: "직접 고르는 한 장의 메이저 아르카나", glyph: "✦", group: "카드·상징", input: "none", tag: "22장 카드" },
  { id: "tarot-three", title: "3카드 타로", subtitle: "과거·현재·미래의 이야기를 잇다", glyph: "Ⅲ", group: "카드·상징", input: "none", tag: "세 장의 스프레드" },
  { id: "zodiac", title: "별자리 운세", subtitle: "태양 별자리의 상징과 성향", glyph: "☼", group: "카드·상징", input: "birth", tag: "서양 12별자리" },
  { id: "animal", title: "열두 띠 이야기", subtitle: "입춘 기준 연지와 띠의 상징", glyph: "子", group: "카드·상징", input: "birth", tag: "설날 기준과 구분" },
  { id: "dream", title: "꿈 상징 사전", subtitle: "꿈속 장면에서 이야깃거리 찾기", glyph: "夢", group: "카드·상징", input: "dream", tag: "한국어 검색" },
  { id: "numerology", title: "생일 수비학", subtitle: "숫자를 줄이며 발견하는 상징", glyph: "№", group: "카드·상징", input: "birth", tag: "계산 과정 공개" },
  { id: "romance", title: "애정·소통운", subtitle: "마음을 전하는 나만의 방식", glyph: "心", group: "창작·일상", input: "birth", tag: "오늘의 대화" },
  { id: "money", title: "재물·소비운", subtitle: "돈보다 먼저 살펴볼 생활 습관", glyph: "財", group: "창작·일상", input: "birth", tag: "투자 예측 아님" },
  { id: "career", title: "일·커리어운", subtitle: "오늘의 업무를 정리하는 힌트", glyph: "業", group: "창작·일상", input: "birth", tag: "성과 보장 아님" },
  { id: "study", title: "학업·배움운", subtitle: "배움에 작은 호기심 더하기", glyph: "學", group: "창작·일상", input: "birth", tag: "공부 루틴" },
  { id: "creative", title: "창작 영감운", subtitle: "오늘 그릴 한 컷의 씨앗", glyph: "繪", group: "창작·일상", input: "birth", tag: "드로잉 미션" },
  { id: "rest", title: "쉼·마음 카드", subtitle: "잠깐 멈추고 나에게 질문하기", glyph: "休", group: "창작·일상", input: "none", tag: "진단·건강 예측 아님" },
  { id: "lucky", title: "행운 팔레트", subtitle: "색과 숫자로 즐기는 오늘의 무드", glyph: "色", group: "창작·일상", input: "none", tag: "창작 색상 조합" },
  { id: "cookie", title: "포춘쿠키", subtitle: "오늘의 문장과 작은 도전", glyph: "✧", group: "창작·일상", input: "none", tag: "개인정보 없이" },
];
export const FORTUNE_DISCLAIMER = "운세·궁합·카드 해석은 전통과 상징을 활용한 재미·자기성찰 콘텐츠입니다. 미래나 성격을 과학적으로 판정하지 않으며, 점수는 확률이 아닙니다. 투자·의료·채용·관계의 중요한 결정에 사용하지 마세요.";
export const FORTUNE_ELEMENT_NAMES = ["목", "화", "토", "금", "수"];
export const FORTUNE_ELEMENT_KEYS = ["wood", "fire", "earth", "metal", "water"] as const;
export const FORTUNE_ELEMENT_TEXT = [
  { motif: "성장·시작·확장", action: "초록색 사물을 관찰하고 새 아이디어 세 개를 적어 보세요." },
  { motif: "표현·열정·연결", action: "마음에 든 장면을 짧은 말이나 한 컷의 그림으로 표현해 보세요." },
  { motif: "중심·신뢰·정리", action: "책상 위를 정리하고 오늘 끝낼 일 하나만 남겨 보세요." },
  { motif: "선택·기준·완성", action: "진행 중인 작업에서 불필요한 것 하나를 덜어 보세요." },
  { motif: "관찰·유연함·사색", action: "결론을 서두르지 말고 낯선 시각으로 장면을 다시 읽어 보세요." },
];
