import { attributionMarkdown } from "@/shared/lib/creator-resources";
import type { CreatorResource } from "@/shared/lib/creator-resources";

export interface ContentPack {
  id: string; title: string; category: string; premise: string; keywords: string[]; observe: string[]; twist: string;
}
/** Original editorial exercises, not AI output or claims extracted from the linked artworks. */
export const CONTENT_PACKS: readonly ContentPack[] = [
  { id: "armor", title: "갑옷 뒤의 망설임", category: "캐릭터·복식", premise: "출정을 앞둔 수습 기사가 갑옷의 마지막 매듭을 묶지 못한다.", keywords: ["갑옷", "투구", "중세 검"], observe: ["관절이 접히는 부분과 단단한 판의 대비", "신분을 드러내는 장식과 실제 움직임의 관계", "매듭을 쥔 손의 크기와 무게 중심"], twist: "검 대신 편지를 품고 문을 나선다." },
  { id: "costume", title: "빌려 입은 하루", category: "캐릭터·복식", premise: "주인공이 낯선 예복을 입고 자신과 다른 계층의 잔치에 들어간다.", keywords: ["한복", "기모노", "드레스"], observe: ["여밈의 방향과 옷이 겹치는 순서", "옷자락 길이가 보폭에 주는 제약", "행사 복식과 일상 복식을 구분할 근거"], twist: "멋진 옷보다 낡은 신발이 정체를 드러낸다." },
  { id: "tea", title: "식어가는 차의 대화", category: "소품·생활", premise: "오랫동안 만나지 못한 두 사람이 찻잔을 사이에 두고 앉는다.", keywords: ["주전자", "도자기 잔", "그릇"], observe: ["손잡이와 입구의 형태", "잔과 인물 사이의 여백", "반사광과 그림자로 보이는 재질"], twist: "마지막 컷에서 두 잔의 위치가 바뀌어 있다." },
  { id: "mirror", title: "거울에는 없는 사람", category: "소품·생활", premise: "이사 첫날, 오래된 거울 속 방에 가구 하나가 더 보인다.", keywords: ["거울", "가구", "실내"], observe: ["거울의 테두리 문양과 제작 재료", "시점에 따라 반사에서 빠지는 영역", "가구 배치로 만든 이동 동선"], twist: "주인공이 움직이지 않아도 거울 속 의자가 돌아간다." },
  { id: "lantern", title: "마지막 등불의 주인", category: "공간·빛", premise: "모두 문을 닫은 거리에서 단 하나의 등불만 켜져 있다.", keywords: ["등불", "촛대", "밤 배경"], observe: ["광원과 얼굴 사이의 거리", "금속·종이·유리의 빛 투과 차이", "빛이 닿지 않는 영역의 비중"], twist: "등불은 손님이 아니라 돌아올 가족을 기다린다." },
  { id: "bridge", title: "다리 중간의 약속", category: "공간·빛", premise: "서로 반대편에 사는 두 인물이 강 위의 다리에서 만난다.", keywords: ["다리", "강 다리", "건축"], observe: ["난간 반복으로 드러나는 원근", "수면 반사와 실제 구조물 구분", "다리 아래와 위의 시선 차이"], twist: "둘은 약속한 물건 대신 같은 지도를 꺼낸다." },
  { id: "garden", title: "담장 너머의 정원", category: "공간·빛", premise: "배달부가 닫힌 정원의 소리를 듣고 길을 바꾼다.", keywords: ["정원", "정원 문", "나무"], observe: ["입구가 장면을 가리는 정도", "전경 식물과 원경 인물의 크기", "자연의 불규칙성과 건축의 반복"], twist: "정원의 소리는 사람이 돌보는 작은 기계에서 나온다." },
  { id: "wave", title: "파도가 돌려준 물건", category: "자연·분위기", premise: "폭풍 뒤 해변에 오래전에 잃어버린 물건이 떠밀려 온다.", keywords: ["파도", "바다", "배경"], observe: ["수평선 높이에 따른 압박감", "포말의 큰 덩어리와 작은 파편", "젖은 물건과 마른 모래의 명암"], twist: "물건에 적힌 날짜는 아직 오지 않은 날이다." },
  { id: "snow", title: "눈 위의 두 번째 발자국", category: "자연·분위기", premise: "새벽 눈길을 걷던 인물이 자신의 발자국 옆에서 다른 흔적을 발견한다.", keywords: ["눈 배경", "산 배경", "나무"], observe: ["흰 면 안에서도 구분되는 밝기", "길을 따라 시선을 움직이는 간격", "차가운 배경과 따뜻한 실내 빛"], twist: "다른 발자국은 주인공보다 한 걸음 먼저 멈춘다." },
  { id: "pattern", title: "문양에 숨긴 지도", category: "문양·재질", premise: "직물을 수선하던 인물이 반복 문양에서 어긋난 한 조각을 찾는다.", keywords: ["문양", "자수", "직물"], observe: ["반복 단위와 어긋나는 지점", "직조와 자수의 표면 차이", "문양의 상징은 원문에서 확인할 것"], twist: "오류처럼 보이던 문양이 출구를 가리킨다." },
  { id: "clay", title: "금 간 그릇의 기억", category: "문양·재질", premise: "도공이 깨진 그릇의 조각을 맞추며 서로 다른 기억을 듣는다.", keywords: ["도자기", "항아리", "꽃병"], observe: ["입구·몸통·굽의 비례", "유약과 노출된 흙의 표면 대비", "금이 시선을 연결하는 방향"], twist: "마지막 조각을 넣자 기억 속 인물이 달라진다." },
  { id: "music", title: "소리가 멈춘 무도회", category: "동작·리듬", premise: "춤추던 사람들이 음악이 끊겨도 같은 동작을 반복한다.", keywords: ["악기", "인물 춤", "동세"], observe: ["연주자의 손과 도구의 접점", "반복 동작에서 달라지는 실루엣", "넓은 장면과 손 클로즈업의 리듬"], twist: "관객 한 명의 박수가 멈춘 시간을 다시 움직인다." },
];
export const CONTENT_FORMATS = { storyboard: "5컷 콘티 브리프", world: "세계관·배경 설정집", comparison: "자료 비교 노트" } as const;
export type ContentFormat = keyof typeof CONTENT_FORMATS;
export function isContentFormat(value: unknown): value is ContentFormat { return value === "storyboard" || value === "world" || value === "comparison"; }
export function findContentPack(id: string | null): ContentPack { return CONTENT_PACKS.find((pack) => pack.id === id) ?? CONTENT_PACKS[0]; }
export const MAX_BRIEF_SOURCES = 24;
const escapeText = (value: string) => value.replace(/[\\[\]<>`*_#]/gu, "\\$&");
export function buildContentBrief(pack: ContentPack, format: ContentFormat, resources: readonly CreatorResource[], notes = ""): string {
  if (resources.length > MAX_BRIEF_SOURCES) throw new Error(`출처는 ${MAX_BRIEF_SOURCES}개까지 선택하세요.`);
  const header = `# ${pack.title} · ${CONTENT_FORMATS[format]}\n\n`;
  const origin = "ToonStudio의 창작 연습 템플릿을 브라우저에서 조합했습니다. AI 생성·이미지 분석·역사적 사실 판정 결과가 아닙니다. 아래 설정은 창작 가정이며 원자료의 내용과 구분하세요.\n\n";
  const premise = `## 창작 가정\n${pack.premise}\n\n`;
  const observation = `## 직접 관찰할 질문\n${pack.observe.map((item) => `- [ ] ${item}`).join("\n")}\n\n`;
  const sections: Record<ContentFormat, string> = {
    storyboard: `## 5컷 설계\n1. 도입 — ${pack.premise}\n2. 관찰 — ${pack.observe[0]}을 드러내는 클로즈업을 그립니다.\n3. 갈등 — 같은 소품을 두 인물이 다르게 해석하는 행동을 배치합니다.\n4. 선택 — 대사 대신 손·발·시선의 변화로 결정을 보여줍니다.\n5. 전환 — ${pack.twist}\n\n## 연출 점검\n- [ ] 말풍선을 지워도 행동의 인과가 보이나요?\n- [ ] 넓은 컷과 가까운 컷의 크기를 달리했나요?\n- [ ] 참고 이미지의 구도를 그대로 복제하지 않고 새 장면을 설계했나요?\n\n`,
    world: `## 세계관 설정 워크시트\n- 공간과 시대: 직접 작성 / 서로 다른 시대의 자료를 혼합했다면 표시\n- 인물이 살아가는 규칙: 직접 작성\n- 생활 도구와 재료: 출처를 확인한 사실과 창작 변경을 각각 기록\n- 광원·이동 동선·거리: 직접 작성\n- 장면의 예외: ${pack.twist}\n\n## 제작 산출물\n- [ ] 배경 전체 구도 1장\n- [ ] 주요 소품 정면·측면 스케치\n- [ ] 의상·재질·장소별 출처 대응표\n\n`,
    comparison: `## 자료 비교 워크시트\n각 자료에 대해 다음 항목을 직접 채우세요. 메타데이터만으로 형태나 색채를 추론하지 않습니다.\n\n${resources.length ? resources.map((item, index) => `### ${index + 1}. ${escapeText(item.title)}\n- 관찰한 형태·재료: 직접 작성\n- 다른 자료와 같은 점 / 다른 점: 직접 작성\n- 내 장면에 반영할 점: 직접 작성\n- 확인한 사실 / 창작 해석: 분리해서 작성\n`).join("\n") : "자료를 검색해 보드에 저장한 뒤 출처를 선택하세요.\n"}\n`,
  };
  const memo = `## 나의 제작 메모\n${escapeText(notes.slice(0, 2000).trim()) || "아직 작성하지 않음"}\n\n`;
  const rights = "## 제작 전 확인\n- [ ] 원문에서 최신 이용조건·제3자 권리를 확인했습니다.\n- [ ] 도서 메타데이터를 저장한 것은 표지·본문·각색 허락이 아님을 확인했습니다.\n- [ ] 선택한 자료만 참고 출처로 기재했으며 자동으로 작품에 사용하지 않았습니다.\n\n";
  return header + origin + premise + observation + sections[format] + memo + rights + attributionMarkdown(resources);
}
