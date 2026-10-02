import type { SpaceNpcDialogueMoment } from "./space-npc-portrait";

/**
 * NPC 대화 선택지 '구역 안내·오늘의 팁' 문구.
 * 모든 문구는 지금 실제로 되는 기능만 말한다(구역 안내의 '할 수 있는 일'은 월드 상호작용 목록에서 만든다).
 */
export interface SpaceNpcLine {
  readonly ko: string;
  readonly en: string;
  readonly moment: SpaceNpcDialogueMoment;
}

/** 캠퍼스 구역의 쓰임새(표지판 구역과 같은 키). */
const ZONE_PURPOSE: Readonly<Record<string, { readonly ko: string; readonly en: string }>> = {
  skyport: { ko: "입구 로비예요. 처음 오신 분은 여기서 동선을 잡아요.", en: "This is the entrance lobby, where newcomers get their bearings." },
  "personal-atelier": { ko: "원고를 그리는 작업실이에요.", en: "This is the studio where pages get drawn." },
  "story-lab": { ko: "대본·콘티를 함께 다듬는 공동 작업실이에요.", en: "This co-working room is for refining scripts and storyboards together." },
  "creator-cafe": { ko: "잠깐 쉬면서 가볍게 이야기하는 카페예요.", en: "This cafe is for short breaks and casual talk." },
  "team-meeting": { ko: "회의와 검토를 하는 회의실이에요.", en: "This is the meeting room for meetings and reviews." },
  "creator-plaza": { ko: "모두가 오가는 중앙 광장이에요.", en: "This is the central plaza everyone passes through." },
  "event-stage": { ko: "발표와 이벤트를 여는 무대예요.", en: "This stage hosts talks and events." },
  arcade: { ko: "머리를 식히는 미니게임 공간이에요.", en: "This is the mini-game corner for a quick break." },
  beach: { ko: "바람 쐬며 쉬는 테라스예요.", en: "This terrace is for a breath of fresh air." },
  "review-gallery": { ko: "완성 원고를 걸어 두고 함께 보는 갤러리예요.", en: "This gallery shows finished pages for everyone to review." },
};

function listLabels(labels: readonly string[], conjunction: string): string {
  const unique = [...new Set(labels.map((label) => label.trim()).filter(Boolean))].slice(0, 4);
  if (unique.length <= 1) return unique.join("");
  return `${unique.slice(0, -1).join(", ")}${conjunction}${unique.at(-1) ?? ""}`;
}

/** 구역 안내: 쓰임새 + 이 구역에서 가까이 가서 X로 할 수 있는 일(실제 상호작용 라벨). */
export function spaceNpcZoneGuide(input: {
  readonly roomId: string | null | undefined;
  readonly roomLabelKo: string;
  readonly roomLabelEn: string;
  readonly interactions: readonly { readonly labelKo: string; readonly labelEn: string }[];
}): SpaceNpcLine {
  const purpose = (input.roomId ? ZONE_PURPOSE[input.roomId] : undefined)
    ?? { ko: `여기는 ${input.roomLabelKo}이에요.`, en: `This is ${input.roomLabelEn}.` };
  const ko = listLabels(input.interactions.map((item) => item.labelKo), ", ");
  const en = listLabels(input.interactions.map((item) => item.labelEn), " and ");
  return {
    ko: ko ? `${purpose.ko} 가까이 다가가서 X를 누르면 ${ko} 같은 걸 바로 쓸 수 있어요.` : `${purpose.ko} 반짝이는 대상에 가까이 가면 X로 상호작용할 수 있어요.`,
    en: en ? `${purpose.en} Walk up close and press X to use ${en}.` : `${purpose.en} Walk up to anything that glows and press X to interact.`,
    moment: "info",
  };
}

/** 오늘의 팁. 날짜와 '다른 팁' 횟수로 돌아가며 보여 준다. */
export const SPACE_NPC_TIPS: readonly SpaceNpcLine[] = [
  { ko: "책상·게시판·화이트보드에 가까이 다가가 X를 누르면 앉거나 바로 열 수 있어요.", en: "Walk up to a desk, board or whiteboard and press X to sit or open it.", moment: "tip" },
  { ko: "⌘/Ctrl+K로 방이나 팀원을 찾아 그 자리까지 바로 걸어갈 수 있어요.", en: "Press ⌘/Ctrl+K to find a room or teammate and walk straight there.", moment: "tip" },
  { ko: "집중이 필요하면 도크의 '나'에서 '집중 작업 중'으로 바꾸세요. 새 대화 요청을 잠시 받지 않아요.", en: "Need focus? Switch to 'Focusing' from 'Me' in the dock. New conversation requests pause.", moment: "tip" },
  { ko: "검수는 '검수 초대'로 같은 검수본을 함께 열면 코멘트가 엇갈리지 않아요.", en: "Use 'Review invite' to open the same review snapshot together so comments stay in sync.", moment: "tip" },
  { ko: "M을 누르면 전체 지도가 열려요. 가고 싶은 곳을 누르면 그곳까지 걸어가요.", en: "Press M for the full map. Tap a spot and you walk there.", moment: "tip" },
  { ko: "1~9 키 리액션은 근처 사람에게 보여요. Z를 누르면 춤을 춰요.", en: "Reactions on keys 1–9 show to people nearby. Press Z to dance.", moment: "tip" },
  { ko: "회의 전에 '오늘의 제작 동선'에서 마감과 검수 대기를 먼저 확인해 보세요.", en: "Before a meeting, check deadlines and pending reviews in 'Today'.", moment: "tip" },
  { ko: "도크의 카메라로 '가까이 가면 영상'을 한 번 켜 두면, 근처 팀원과 영상이 자동으로 연결돼요. 상대도 켜야 서로 보여요.", en: "Turn on 'proximity video' once from the dock camera and video connects with nearby teammates automatically. Both sides need it on.", moment: "tip" },
];

/** 같은 날에는 같은 팁부터, '다른 팁'을 누를 때마다 다음 팁으로 넘어간다. */
export function spaceNpcTip(dayIndex: number, offset: number): SpaceNpcLine {
  const count = SPACE_NPC_TIPS.length;
  const safe = Number.isFinite(dayIndex) ? Math.abs(Math.floor(dayIndex)) : 0;
  const index = (safe + Math.max(0, Math.floor(offset))) % count;
  return SPACE_NPC_TIPS[index] ?? SPACE_NPC_TIPS[0]!;
}

/** 로컬 날짜 기준 일 번호(팁 순환용). */
export function spaceNpcDayIndex(now: Date = new Date()): number {
  return Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 86_400_000);
}
