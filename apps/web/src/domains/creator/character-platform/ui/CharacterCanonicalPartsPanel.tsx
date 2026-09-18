import {
  Boxes,
  Layers3,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { STUDIO_FOCUS_RING } from "../../studio-panel-ui";

import type { CharacterCanonicalPartSlot } from "../assets/character-canonical-manifest";
import type { CharacterCanonicalPartsWorkbench } from "./use-character-canonical-parts";

import { cn } from "@/shared/lib/utils";

const SLOT_LABELS = Object.freeze({
  eyes: "눈",
  irises: "눈동자",
  nose: "코",
  mouth: "입",
  ears: "귀",
  hair: "헤어",
  top: "상의",
  bottom: "하의",
  shoes: "신발",
  accessory: "액세서리",
} as const satisfies Record<CharacterCanonicalPartSlot, string>);

const SLOT_ORDER = Object.freeze(Object.keys(SLOT_LABELS) as CharacterCanonicalPartSlot[]);

type SlotFilter = "all" | CharacterCanonicalPartSlot;

function bindingLabel(kind: "skinned-transplant" | "socket" | "rigid-follow"): string {
  if (kind === "skinned-transplant") return "스킨 피팅";
  if (kind === "socket") return "소켓";
  return "본 추적";
}

function normalizedSearch(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function CharacterCanonicalPartsPanel({ workbench }: {
  readonly workbench: CharacterCanonicalPartsWorkbench;
}) {
  const [query, setQuery] = useState("");
  const [slotFilter, setSlotFilter] = useState<SlotFilter>("all");

  const supportedCount = workbench.options.filter((option) => option.status === "supported").length;
  const unavailableCount = workbench.options.length - supportedCount;
  const selectedOptions = workbench.options.filter((option) => option.selected);
  const presentSlots = useMemo(() => SLOT_ORDER.filter((slot) => (
    workbench.options.some((option) => option.part.slot === slot)
  )), [workbench.options]);
  const visibleOptions = useMemo(() => {
    const needle = normalizedSearch(query);
    return workbench.options.filter((option) => {
      if (slotFilter !== "all" && option.part.slot !== slotFilter) return false;
      if (!needle) return true;
      const haystack = normalizedSearch([
        option.part.label,
        SLOT_LABELS[option.part.slot],
        option.part.provenance.creatorId,
        option.part.provenance.sourceLicense,
        option.part.binding.kind,
      ].join(" "));
      return haystack.includes(needle);
    }).sort((left, right) => {
      if (left.selected !== right.selected) return left.selected ? -1 : 1;
      if (left.status !== right.status) return left.status === "supported" ? -1 : 1;
      return left.part.label.localeCompare(right.part.label, "ko");
    });
  }, [query, slotFilter, workbench.options]);

  if (workbench.options.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-panel/50 p-4 text-[0.7rem] leading-relaxed text-fg-3">
        <div className="mb-2 flex items-center gap-2 font-bold text-fg-2">
          <Boxes size={15} aria-hidden />Production Library
        </div>
        승인된 교체 파츠가 아직 없습니다. 품질 리포트, 라이선스, 원본 SHA-256, 리그/토폴로지 호환 조건을 모두 통과한 실제 메시만 이 라이브러리에 노출됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Boxes size={16} className="text-accent" aria-hidden />
            <p className="text-[0.76rem] font-bold text-fg">Production Library</p>
          </div>
          <p className="mt-1 text-[0.63rem] leading-relaxed text-fg-3">
            실제 authored donor/GLB만 사용합니다. 적용 전 무결성·권리·호환성을 재검증하고 실패하면 현재 캐릭터를 그대로 유지합니다.
          </p>
        </div>
        <button
          type="button"
          disabled={selectedOptions.length === 0 || workbench.busyPartId !== null}
          onClick={() => void workbench.clear()}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-[0.66rem] font-semibold text-fg-2",
            "hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40",
            STUDIO_FOCUS_RING,
          )}
        >
          <RotateCcw size={13} aria-hidden />모두 원본
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2" aria-label="Production Library 현황">
        <div className="rounded-xl border border-good/30 bg-good/8 p-2.5">
          <span className="block text-[0.58rem] font-semibold text-fg-3">사용 가능</span>
          <strong className="mt-0.5 block text-base text-good">{supportedCount}</strong>
        </div>
        <div className="rounded-xl border border-accent/30 bg-accent-soft/70 p-2.5">
          <span className="block text-[0.58rem] font-semibold text-fg-3">적용 중</span>
          <strong className="mt-0.5 block text-base text-accent">{selectedOptions.length}</strong>
        </div>
        <div className="rounded-xl border border-warn/30 bg-warn/8 p-2.5">
          <span className="block text-[0.58rem] font-semibold text-fg-3">호환 불가</span>
          <strong className="mt-0.5 block text-base text-warn">{unavailableCount}</strong>
        </div>
      </div>

      {selectedOptions.length > 0 ? (
        <div className="rounded-2xl border border-accent/30 bg-accent-soft/45 p-2.5">
          <div className="mb-2 flex items-center gap-1.5 text-[0.64rem] font-bold text-accent">
            <Layers3 size={13} aria-hidden />현재 조합
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedOptions.map((option) => (
              <button
                key={option.part.id}
                type="button"
                disabled={workbench.busyPartId !== null}
                onClick={() => void workbench.remove(option.part.slot)}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-accent/35 bg-card px-2.5 text-[0.62rem] font-semibold text-fg-2",
                  "hover:bg-raised disabled:opacity-40",
                  STUDIO_FOCUS_RING,
                )}
                aria-label={`${SLOT_LABELS[option.part.slot]} ${option.part.label} 원본으로 복원`}
              >
                <span className="text-accent">{SLOT_LABELS[option.part.slot]}</span>
                <span className="max-w-28 truncate">{option.part.label}</span>
                <X size={11} aria-hidden />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="relative">
        <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="파츠, 제작자, 라이선스 검색"
          aria-label="Production Library 검색"
          className={cn(
            "h-11 w-full rounded-xl border border-line bg-panel pl-9 pr-3 text-sm text-fg placeholder:text-fg-3",
            STUDIO_FOCUS_RING,
          )}
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="파츠 종류 필터">
        <button
          type="button"
          aria-pressed={slotFilter === "all"}
          onClick={() => setSlotFilter("all")}
          className={cn(
            "min-h-9 shrink-0 rounded-full border px-3 text-[0.62rem] font-semibold",
            slotFilter === "all" ? "border-accent/50 bg-accent-soft text-accent" : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
            STUDIO_FOCUS_RING,
          )}
        >
          전체 {workbench.options.length}
        </button>
        {presentSlots.map((slot) => {
          const count = workbench.options.filter((option) => option.part.slot === slot).length;
          return (
            <button
              key={slot}
              type="button"
              aria-pressed={slotFilter === slot}
              onClick={() => setSlotFilter(slot)}
              className={cn(
                "min-h-9 shrink-0 rounded-full border px-3 text-[0.62rem] font-semibold",
                slotFilter === slot ? "border-accent/50 bg-accent-soft text-accent" : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
                STUDIO_FOCUS_RING,
              )}
            >
              {SLOT_LABELS[slot]} {count}
            </button>
          );
        })}
      </div>

      {visibleOptions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-5 text-center text-[0.68rem] text-fg-3">
          조건에 맞는 production part가 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {visibleOptions.map((option) => {
            const selected = option.selected;
            const applying = workbench.busyPartId === option.part.id;
            const disabled = option.status !== "supported" || (workbench.busyPartId !== null && !applying);
            return (
              <button
                key={option.part.id}
                type="button"
                aria-pressed={selected}
                aria-disabled={disabled}
                disabled={disabled}
                title={option.reason ?? undefined}
                onClick={() => void workbench.apply(option.part.id)}
                className={cn(
                  "group relative min-h-44 overflow-hidden rounded-2xl border bg-card text-left transition-[border-color,background-color,transform] motion-reduce:transition-none",
                  selected ? "border-accent/70 bg-accent-soft" : "border-line hover:-translate-y-0.5 hover:border-accent/35 hover:bg-raised",
                  disabled && "cursor-not-allowed opacity-55 hover:translate-y-0",
                  STUDIO_FOCUS_RING,
                )}
              >
                <div className="relative h-24 overflow-hidden bg-raised">
                  {option.part.thumbnail ? (
                    <img
                      src={option.part.thumbnail}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-[0.62rem] font-bold tracking-wider text-fg-3">3D PART</div>
                  )}
                  <span className={cn(
                    "absolute left-2 top-2 rounded-full border px-1.5 py-0.5 text-[0.54rem] font-extrabold backdrop-blur",
                    option.status === "supported" ? "border-good/45 bg-panel/85 text-good" : "border-warn/45 bg-panel/85 text-warn",
                  )}>
                    {option.status === "supported" ? `Q${Math.round(option.part.quality.minimumScore)}` : "호환 불가"}
                  </span>
                  {selected ? (
                    <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-accent text-on-accent shadow">
                      <ShieldCheck size={13} aria-hidden />
                    </span>
                  ) : null}
                </div>
                <span className="block p-2.5">
                  <span className="block truncate text-[0.7rem] font-bold text-fg">{option.part.label}</span>
                  <span className="mt-0.5 block text-[0.58rem] font-semibold text-accent">{SLOT_LABELS[option.part.slot]}</span>
                  <span className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[0.55rem] text-fg-3">
                    <span>{bindingLabel(option.part.binding.kind)}</span>
                    <span>{option.part.lods.length > 0 ? `LOD ${option.part.lods.length}` : "LOD 원본"}</span>
                    <span className="truncate">{option.part.provenance.sourceLicense}</span>
                    <span className="truncate text-right">{option.part.provenance.creatorId}</span>
                  </span>
                  <span className={cn(
                    "mt-2 block min-h-7 text-[0.57rem] leading-snug",
                    option.status === "supported" ? selected ? "font-semibold text-accent" : "text-good" : "text-warn",
                  )}>
                    {applying ? "SHA·리그·품질 검증 후 적용 중…" : selected ? "현재 캐릭터에 적용됨" : option.status === "supported" ? "즉시 미리보기 가능" : option.reason}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {workbench.error ? (
        <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 p-2.5 text-[0.64rem] leading-relaxed text-bad">
          {workbench.error}
        </p>
      ) : null}
    </div>
  );
}
