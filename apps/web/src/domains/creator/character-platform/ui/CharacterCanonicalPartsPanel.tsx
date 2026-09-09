import { RotateCcw } from "lucide-react";

import { STUDIO_FOCUS_RING } from "../../studio-panel-ui";

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
  accessory: "악세서리",
} as const);

export function CharacterCanonicalPartsPanel({ workbench }: {
  readonly workbench: CharacterCanonicalPartsWorkbench;
}) {
  if (workbench.options.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line p-2.5 text-[0.68rem] leading-relaxed text-fg-3">
        연결한 Canonical Character 매니페스트에 승인된 교체 파츠가 없습니다. 파츠는 품질 리포트, 라이선스, 원본 SHA, 리그/토폴로지 호환 조건이 모두 있어야 표시됩니다.
      </div>
    );
  }

  const grouped = Object.entries(Object.groupBy(workbench.options, (option) => option.part.slot));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[0.7rem] font-bold text-fg">Production Parts · {workbench.options.length}개</p>
          <p className="mt-0.5 text-[0.62rem] text-fg-3">실제 donor/GLB 메시만 적용하며 실패 시 원본을 유지합니다.</p>
        </div>
        <button
          type="button"
          disabled={Object.keys(workbench.selections).length === 0 || workbench.busyPartId !== null}
          onClick={() => void workbench.clear()}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-[0.66rem] font-semibold text-fg-2",
            "hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40",
            STUDIO_FOCUS_RING,
          )}
        >
          <RotateCcw size={13} aria-hidden />원본
        </button>
      </div>
      {grouped.map(([slot, options]) => (
        <section key={slot} className="space-y-1.5">
          <h4 className="text-[0.66rem] font-bold text-fg-2">{SLOT_LABELS[slot as keyof typeof SLOT_LABELS] ?? slot}</h4>
          <div className="grid grid-cols-2 gap-2">
            {options!.map((option) => {
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
                    "min-h-24 overflow-hidden rounded-xl border bg-card text-left transition-colors motion-reduce:transition-none",
                    selected ? "border-accent/70 bg-accent-soft" : "border-line hover:bg-raised",
                    disabled && "cursor-not-allowed opacity-55",
                    STUDIO_FOCUS_RING,
                  )}
                >
                  {option.part.thumbnail ? (
                    <img
                      src={option.part.thumbnail}
                      alt=""
                      loading="lazy"
                      className="h-20 w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-20 place-items-center bg-raised text-[0.62rem] text-fg-3">3D PART</div>
                  )}
                  <span className="block p-2">
                    <span className="block truncate text-[0.68rem] font-bold text-fg">{option.part.label}</span>
                    <span className={cn("mt-0.5 block text-[0.58rem]", option.status === "supported" ? "text-good" : "text-warn")}>
                      {applying ? "검증·적용 중…" : selected ? "적용됨" : option.status === "supported" ? `품질 ${option.part.quality.minimumScore}` : option.reason}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {workbench.error ? <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 p-2 text-[0.64rem] text-bad">{workbench.error}</p> : null}
    </div>
  );
}
