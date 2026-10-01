import { useId } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { SpaceDockMenuItem } from "./space-dock-model";

const GROUP_LABELS = {
  work: ["작업", "Work"],
  space: ["공간", "Space"],
  help: ["도움", "Help"],
} as const;

/** ⋯ 메뉴 목록. 비활성 항목은 사유를 함께 보여 주고 누르면 아무 것도 하지 않는다. */
export function SpaceMenuList({ items, onSelected }: {
  readonly items: readonly SpaceDockMenuItem[];
  readonly onSelected: () => void;
}) {
  const bt = useBilingual("SpaceMenuList");
  const baseId = useId();
  const groups = (Object.keys(GROUP_LABELS) as (keyof typeof GROUP_LABELS)[])
    .map((group) => ({ group, items: items.filter((item) => item.group === group) }))
    .filter((entry) => entry.items.length > 0);
  return <div className="space-menu-list">
    {groups.map(({ group, items: groupItems }) => <section key={group} className="space-menu-list__group" aria-labelledby={`${baseId}-${group}`}>
      <h3 id={`${baseId}-${group}`}>{bt(GROUP_LABELS[group][0], GROUP_LABELS[group][1])}</h3>
      {groupItems.map((item) => {
        const Icon = item.icon;
        const reason = item.disabledReasonKo && item.disabledReasonEn ? bt(item.disabledReasonKo, item.disabledReasonEn) : null;
        const reasonId = `${baseId}-${item.id}-reason`;
        return <button key={item.id} type="button" className="space-menu-row" data-menu-item={item.id}
          aria-disabled={reason ? true : undefined} aria-describedby={reason ? reasonId : undefined}
          aria-keyshortcuts={item.shortcut}
          onClick={() => { if (reason) return; onSelected(); item.onSelect(); }}>
          <Icon size={17} aria-hidden />
          <span className="space-menu-row__label">
            {bt(item.labelKo, item.labelEn)}
            {reason ? <small id={reasonId}>{reason}</small> : null}
          </span>
          {item.shortcut ? <kbd aria-hidden>{item.shortcut}</kbd> : null}
        </button>;
      })}
    </section>)}
  </div>;
}
