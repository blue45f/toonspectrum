// 작가 성장·IP 작업대의 단계 탭 — 9개 섹션을 세로로 쌓지 않고 한 번에 한 단계만 보여 준다(탭 UI는 publishing/SectionTabs).
// 주소의 해시(#age 등)와 선택 탭을 맞춰 두어, 섹션 안 "연령 정책으로 이동" 같은 해시 링크와 공유 주소가 그대로 동작한다.
import type { LucideIcon } from "lucide-react";

import { SectionTabs, SectionTabsFooter } from "../publishing/SectionTabs";
import { GROWTH_SECTIONS, type GrowthSectionId } from "./growth-ip-labels";
import { bi, biLabel } from "./growth-ip-shared";
import { growthPanelId, growthTabId } from "./growth-section-nav";

export function GrowthSectionTabs({
  active,
  icons,
  counts,
  onSelect,
}: {
  readonly active: GrowthSectionId;
  readonly icons: Readonly<Record<GrowthSectionId, LucideIcon>>;
  /** 단계별로 쌓인 항목 수(없는 단계는 표시하지 않음). */
  readonly counts: Readonly<Partial<Record<GrowthSectionId, number>>>;
  readonly onSelect: (id: GrowthSectionId) => void;
}) {
  return (
    <SectionTabs
      label={bi("작업대 단계", "Workspace steps")}
      tabs={GROWTH_SECTIONS.map((section) => ({ id: section.id, label: biLabel(section.label), icon: icons[section.id], count: counts[section.id] }))}
      active={active}
      onSelect={onSelect}
      tabId={growthTabId}
      panelId={growthPanelId}
      numbered
      countLabel={bi(" · 항목 ", " · items ")}
      className="mt-5"
    />
  );
}

/** 단계 아래의 이전·다음 이동 — 위에서부터 차례로 진행하는 흐름을 탭에서도 이어 간다. */
export function GrowthStepFooter({ active, onSelect }: { readonly active: GrowthSectionId; readonly onSelect: (id: GrowthSectionId) => void }) {
  return (
    <SectionTabsFooter
      label={bi("이전·다음 단계", "Previous and next step")}
      tabs={GROWTH_SECTIONS.map((section) => ({ id: section.id, label: biLabel(section.label) }))}
      active={active}
      onSelect={onSelect}
      previousLabel={bi("이전", "Previous")}
      nextLabel={bi("다음", "Next")}
    />
  );
}
