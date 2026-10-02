import {
  MARKET_RESOURCE_FAMILIES,
  type MarketResourceFamily,
  type MarketResourceFamilyId,
} from "../models/market-resource-taxonomy";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

/** 선택기 한 칸 — `all`은 작업군을 고르지 않은 "전체". */
export type MarketFamilyChoice = MarketResourceFamilyId | "all";

/**
 * 칸을 눌렀을 때의 동작.
 * - `link`: 다른 화면(탐색 결과)으로 이동한다. 선택된 칸은 `aria-current="page"`.
 * - `button`: 같은 화면의 필터를 바꾼다(검색어 등 다른 조건 유지). 선택된 칸은 `aria-pressed`.
 */
export type MarketFamilyPickerTarget =
  | { readonly kind: "link"; readonly hrefFor: (family: MarketResourceFamily | null) => string }
  | { readonly kind: "button"; readonly onSelect: (family: MarketResourceFamily | null) => void };

export interface MarketFamilyPickerProps {
  /** 현재 선택된 칸. 아무것도 표시하지 않으려면 null. */
  readonly selected: MarketFamilyChoice | null;
  readonly target: MarketFamilyPickerTarget;
  /** 묶음 이름으로 쓸 화면에 보이는 제목 요소의 id. */
  readonly labelledBy: string;
  readonly className?: string;
}

const CHOICES: ReadonlyArray<{ readonly id: MarketFamilyChoice; readonly family: MarketResourceFamily | null }> = [
  { id: "all", family: null },
  ...MARKET_RESOURCE_FAMILIES.map((family) => ({ id: family.id, family })),
];

function chipClass(selected: boolean): string {
  return cn(
    // 좁은 화면에서는 3열 격자, sm 이상에서는 한 줄. 라벨은 줄바꿈·글자 단위 깨짐 없이 한 줄로 유지한다.
    "inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-2 text-xs font-semibold transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 sm:shrink-0 sm:px-3.5 sm:text-xs",
    selected
      ? "border-accent/50 bg-accent-soft text-accent"
      : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg",
  );
}

function FamilyIcon({ family, selected }: { readonly family: MarketResourceFamily; readonly selected: boolean }) {
  const Icon = family.icon;
  return (
    <Icon
      className="size-4 shrink-0"
      // 작업군 고유 색은 선택되지 않았을 때만 아이콘 식별용으로 쓴다(선택 상태는 액센트).
      style={selected ? undefined : { color: `oklch(0.74 0.12 ${family.accentHue})` }}
      aria-hidden="true"
    />
  );
}

/**
 * 마켓 작업군 선택기 — 마켓 홈(바로가기 링크)과 탐색(필터 버튼)이 같은 모양·순서·라벨을 쓰게 한다.
 */
export function MarketFamilyPicker({ selected, target, labelledBy, className }: MarketFamilyPickerProps) {
  const bt = useBilingual("MarketFamilyPicker");
  return (
    <div role="group" aria-labelledby={labelledBy} className={cn("grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap", className)}>
      {CHOICES.map(({ id, family }) => {
        const isSelected = selected === id;
        const content = (
          <>
            {family ? <FamilyIcon family={family} selected={isSelected} /> : null}
            <span className="truncate">{family ? bt(family.label, family.labelEn) : bt("전체", "All")}</span>
          </>
        );
        if (target.kind === "button") {
          return (
            <button key={id} type="button" aria-pressed={isSelected} onClick={() => target.onSelect(family)} className={chipClass(isSelected)}>
              {content}
            </button>
          );
        }
        return (
          <Link key={id} href={target.hrefFor(family)} aria-current={isSelected ? "page" : undefined} className={chipClass(isSelected)}>
            {content}
          </Link>
        );
      })}
    </div>
  );
}
