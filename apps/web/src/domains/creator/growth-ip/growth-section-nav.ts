// 작가 성장·IP 작업대 단계 탭의 규칙(탭·패널 id, 쌓인 항목 수). 탭 UI·해시 동기화는 publishing/의 공용 조각을 쓴다.
// 컴포넌트 파일(GrowthSectionTabs.tsx)과 분리해 두어 Fast Refresh 규칙을 지키고 화면 없이 테스트할 수 있다.
import { sectionFromHash, useSectionTabHash } from "../publishing/section-tabs";
import type { CreatorGrowthIpState } from "./creator-growth-ip-model";
import { GROWTH_SECTIONS, type GrowthSectionId } from "./growth-ip-labels";

export const growthTabId = (id: GrowthSectionId) => `growth-ip-tab-${id}`;
export const growthPanelId = (id: GrowthSectionId) => `growth-ip-panel-${id}`;

const SECTION_IDS: readonly GrowthSectionId[] = GROWTH_SECTIONS.map((section) => section.id);

export function growthSectionFromHash(hash: string): GrowthSectionId | null {
  return sectionFromHash(SECTION_IDS, hash);
}

/** 단계 탭 옆에 붙이는 "쌓인 항목 수" — 0건인 단계는 담지 않는다(탭에 숫자를 그리지 않기 위해). */
export function growthSectionCounts(state: CreatorGrowthIpState): Partial<Record<GrowthSectionId, number>> {
  const counts: Partial<Record<GrowthSectionId, number>> = {
    support: state.rookieProfiles.length + state.supportRequests.length,
    assistants: state.assistantCandidates.length,
    story: state.novelChapters.length,
    voice: state.voiceDialogues.length,
    rights: state.rightsInquiries.length,
    education: state.educationPrograms.length,
  };
  const present: Partial<Record<GrowthSectionId, number>> = {};
  for (const id of SECTION_IDS) {
    const value = counts[id];
    if (value) present[id] = value;
  }
  return present;
}

/** 선택 단계 ↔ 주소 해시 동기화(공용 훅에 성장 작업대의 단계 목록을 묶은 것). */
export function useGrowthSectionHash(fallback: GrowthSectionId, onHashNavigate?: (id: GrowthSectionId) => void) {
  return useSectionTabHash(SECTION_IDS, fallback, onHashNavigate);
}
