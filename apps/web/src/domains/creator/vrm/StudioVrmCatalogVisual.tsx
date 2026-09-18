import { useId, type ReactNode } from "react";

import type { CostumePreset } from "./studio-vrm-poser-catalogs";
import type { WardrobeItemDef, WardrobeSet } from "./studio-vrm-wardrobe";

interface VisualFrameProps {
  readonly label: string;
  readonly className?: string;
  readonly children: (gradientId: string) => ReactNode;
}

function VisualFrame({ label, className = "size-8", children }: VisualFrameProps) {
  const gradientId = `vrm-catalog-${useId().replaceAll(":", "")}`;
  return (
    <svg
      role="img"
      aria-label={label}
      className={`${className} shrink-0 overflow-visible`}
      viewBox="0 0 96 96"
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{label}</title>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="var(--color-card, #fffaf5)" />
          <stop offset="1" stopColor="var(--color-panel, #eadfd5)" />
        </linearGradient>
      </defs>      <rect x="2" y="2" width="92" height="92" rx="20" fill={`url(#${gradientId})`} />
      <ellipse cx="48" cy="82" rx="30" ry="6" fill="var(--color-line, #8b786a)" opacity="0.12" />
      {children(gradientId)}
    </svg>
  );
}

function garmentBase(color: string, children?: ReactNode) {
  return (
    <g stroke="var(--color-line, #705f55)" strokeWidth="2" strokeLinejoin="round">
      <path d="M31 31 41 25h14l10 6 8 18-10 5-4-11v34H37V43L33 54l-10-5 8-18Z" fill={color} />
      <path d="M40 27c2 5 14 5 16 0" fill="none" opacity="0.58" />
      <path d="M40 41c5 2 11 2 16 0" fill="none" opacity="0.3" />
      {children}
    </g>
  );
}

function outerDetail(id: string, color: string) {
  if (id === "armor") return <><path d="M28 34 17 40l8 12 9-7m34-11 11 6-8 12-9-7" fill={color} /><path d="M38 34h20l5 24-15 8-15-8 5-24Z" fill="#cbd5e1" opacity="0.6" /></>;
  if (id === "hoodie") return <path d="M38 27c1-10 19-10 20 0l-5 8H43l-5-8Z" fill={color} opacity="0.9" />;
  if (["coat", "robe", "labcoat"].includes(id)) return <path d="M37 48h22l8 35H29l8-35Z" fill={color} opacity="0.96" />;
  if (id === "blazer") return <><path d="m38 31 10 13 10-13" fill="none" strokeWidth="3" /><path d="M48 44v30" fill="none" opacity="0.55" /></>;
  if (id === "cardigan") return <path d="M48 31v44" fill="none" strokeWidth="3" opacity="0.62" />;
  return null;
}

function topDetail(id: string) {
  if (id === "shirt") return <><path d="m41 27 7 8 7-8" fill="#fff" opacity="0.85" /><path d="M48 35v38" fill="none" opacity="0.55" /></>;
  if (id === "sweater") return <path d="M40 26h16v12H40Z" fill="none" strokeWidth="3" />;
  if (id === "sailor") return <path d="M35 30 48 45 61 30 57 47H39l-4-17Z" fill="#fff" opacity="0.88" />;
  if (id === "tank") return <path d="M38 28h6v13h8V28h6" fill="none" strokeWidth="4" />;
  if (id === "scrubs") return <path d="m39 28 9 12 9-12" fill="none" strokeWidth="3" />;
  return null;
}
function bottomVisual(id: string, color: string) {
  const stroke = "var(--color-line, #705f55)";
  if (["pleated", "longskirt"].includes(id)) {
    const bottom = id === "longskirt" ? 83 : 69;
    return (
      <g stroke={stroke} strokeWidth="2" strokeLinejoin="round">
        <path d={`M34 35h28l${id === "longskirt" ? 10 : 7} ${bottom - 35}H${id === "longskirt" ? 24 : 27}l7-${bottom - 35}Z`} fill={color} />
        <path d={`M40 38 37 ${bottom - 3}M48 38v${bottom - 41}M56 38l3 ${bottom - 41}`} opacity="0.35" />
      </g>
    );
  }
  const short = id === "shorts";
  return (
    <g stroke={stroke} strokeWidth="2" strokeLinejoin="round" fill={color}>
      <path d={`M34 34h28l-2 ${short ? 28 : 48}-12-3-12 3-2-${short ? 28 : 48}Z`} />
      <path d={`M48 39v${short ? 20 : 39}`} fill="none" opacity="0.45" />
      {id === "jeans" ? <path d="M36 44h9m6 0h9" fill="none" opacity="0.5" /> : null}
      {id === "wide" ? <path d="M37 52 31 82m28-30 6 30" fill="none" opacity="0.35" /> : null}
    </g>
  );
}

function shoesVisual(id: string, color: string) {
  const tall = id === "longboots";
  const heel = id === "heels";
  return (
    <g stroke="var(--color-line, #705f55)" strokeWidth="2" strokeLinejoin="round" fill={color}>
      <path d={tall ? "M23 28h19v43l-4 11H18l5-11V28Z" : "M23 51h19v20l-4 11H18l5-11V51Z"} />
      <path d={tall ? "M54 28h19v43l5 11H58l-4-11V28Z" : "M54 51h19v20l5 11H58l-4-11V51Z"} />
      {heel ? <path d="M34 79v9m28-9v9" fill="none" strokeWidth="4" /> : null}
      {id === "sneakers" ? <path d="M20 68h22m12 0h22" fill="none" stroke="#fff" opacity="0.72" /> : null}
    </g>
  );
}
export function StudioVrmWardrobeItemVisual({
  item,
  className = "size-8",
}: {
  readonly item: WardrobeItemDef;
  readonly className?: string;
}) {
  return (
    <VisualFrame label={`${item.label} 3D 의상 미리보기`} className={className}>
      {() => (
        <>
          {item.slot === "outer" ? garmentBase(item.defaultColor, outerDetail(item.id, item.defaultColor)) : null}
          {item.slot === "top" ? (
            item.id === "dress"
              ? <g stroke="var(--color-line, #705f55)" strokeWidth="2" strokeLinejoin="round"><path d="M36 27h24l-4 24 15 32H25l15-32-4-24Z" fill={item.defaultColor} /><path d="m41 29 7 9 7-9" fill="none" opacity="0.6" /></g>
              : garmentBase(item.defaultColor, topDetail(item.id))
          ) : null}
          {item.slot === "bottom" ? bottomVisual(item.id, item.defaultColor) : null}
          {item.slot === "shoes" ? shoesVisual(item.id, item.defaultColor) : null}
          <path d="M18 86h60" stroke="var(--color-line, #705f55)" strokeWidth="2" opacity="0.18" strokeLinecap="round" />
        </>
      )}
    </VisualFrame>
  );
}

function resolvedSetColors(set: WardrobeSet) {
  const outer = set.equips.outer?.color ?? "#64748b";
  const top = set.equips.top?.color ?? outer;
  const bottom = set.equips.bottom?.color ?? "#334155";
  const shoes = set.equips.shoes?.color ?? "#292524";
  return { outer, top, bottom, shoes };
}
export function StudioVrmWardrobeSetVisual({
  set,
  className = "size-8",
}: {
  readonly set: WardrobeSet;
  readonly className?: string;
}) {
  const colors = resolvedSetColors(set);
  return (
    <VisualFrame label={`${set.label} 코디 미리보기`} className={className}>
      {() => (
        <g stroke="var(--color-line, #705f55)" strokeWidth="1.8" strokeLinejoin="round">
          <circle cx="48" cy="21" r="10" fill="#e8bca4" />
          <path d="M36 35c3-7 21-7 24 0l5 23H31l5-23Z" fill={colors.top} />
          {set.equips.outer ? <path d="M31 36 20 51l9 7 8-12 2 15h18l2-15 8 12 9-7-11-15-9-6H40l-9 6Z" fill={colors.outer} opacity="0.88" /> : null}
          <path d="M35 57h26l-3 23H50l-2-15-2 15h-8l-3-23Z" fill={colors.bottom} />
          <path d="M37 78h10v8H31l6-8Zm12 0h10l6 8H49v-8Z" fill={colors.shoes} />
          <path d="M42 14c4-5 11-5 15 0" fill="none" stroke="#2f2624" strokeWidth="6" strokeLinecap="round" />
        </g>
      )}
    </VisualFrame>
  );
}

export function StudioVrmCostumePresetVisual({
  preset,
  className = "size-8",
}: {
  readonly preset: CostumePreset;
  readonly className?: string;
}) {
  const colors = preset.colors;
  return (
    <VisualFrame label={`${preset.name} 색상 프리셋 미리보기`} className={className}>
      {() => (
        <g stroke="var(--color-line, #705f55)" strokeWidth="1.8" strokeLinejoin="round">
          <circle cx="48" cy="24" r="14" fill={colors.face ?? "#e8bca4"} />
          <path d="M35 23c1-14 25-18 29 0l-5-7-5 4-6-6-5 7-8 2Z" fill={colors.hair ?? "#342824"} />
          <path d="M31 43c4-8 30-8 34 0l4 22H27l4-22Z" fill={colors.tops ?? "#64748b"} />
          <path d="M28 64h40l-4 20H32l-4-20Z" fill={colors.bottoms ?? "#334155"} />
          <path d="M39 29q9 6 18 0" fill="none" stroke="#9f665e" opacity="0.55" />
        </g>
      )}
    </VisualFrame>
  );
}