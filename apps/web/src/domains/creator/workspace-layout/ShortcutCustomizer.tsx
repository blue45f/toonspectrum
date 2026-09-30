/**
 * T9. 단축키 커스텀 UI (간이).
 *
 * - 명령 ID → 키 바인딩 매핑 테이블
 * - 중복 키 검증 (같은 키가 두 명령에 배정되면 오류 표시)
 * - 기본값 복원
 *
 * 키 입력은 읽기 전용 input의 keydown으로 캡처한다.
 * 순수 헬퍼(normalize/findDuplicates)는 테스트에서 직접 검증한다.
 */
import { RotateCcw, X } from "lucide-react";
import { useMemo, useState } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { cn } from "@/shared/lib/utils";

import {
  captureShortcutFromKeyboardEvent,
  DEFAULT_SHORTCUT_BINDINGS,
  findDuplicateShortcutKeys,
  normalizeShortcutKeys,
  type ShortcutCommandBinding,
} from "./shortcut-bindings";

export interface ShortcutCustomizerProps {
  initialBindings?: ReadonlyArray<ShortcutCommandBinding>;
  onBindingsChange?: (bindings: ShortcutCommandBinding[]) => void;
}

/** 한국어 라벨 상수 (i18n 파일 직접 수정 금지 정책에 따라 컴포넌트 내 상수). */
const LABELS = {
  title: "단축키 설정",
  description: "명령을 클릭한 뒤 원하는 키를 누르세요. 같은 키는 두 명령에 쓸 수 없어요.",
  command: "명령",
  shortcut: "단축키",
  inputPlaceholder: "키 입력",
  clear: "지우기",
  restoreDefaults: "기본값 복원",
  duplicate: "중복된 키예요",
  duplicateSummary: "중복된 단축키가 있어요. 다른 키로 바꿔 주세요.",
  restored: "단축키를 기본값으로 되돌렸어요.",
  cleared: "단축키를 지웠어요.",
  updated: "단축키를 변경했어요.",
} as const;

export function ShortcutCustomizer({
  initialBindings = DEFAULT_SHORTCUT_BINDINGS,
  onBindingsChange,
}: ShortcutCustomizerProps) {
  const [bindings, setBindings] = useState<ShortcutCommandBinding[]>(() =>
    initialBindings.map((binding) => ({ ...binding })),
  );
  const [notice, setNotice] = useState("");

  const duplicates = useMemo(() => new Set(findDuplicateShortcutKeys(bindings)), [bindings]);

  function commit(next: ShortcutCommandBinding[], message: string) {
    setBindings(next);
    onBindingsChange?.(next);
    setNotice(message);
  }

  function updateKeys(commandId: string, keys: string) {
    commit(
      bindings.map((binding) =>
        binding.commandId === commandId ? { ...binding, keys } : binding,
      ),
      keys ? LABELS.updated : LABELS.cleared,
    );
  }

  function restoreDefaults() {
    commit(
      DEFAULT_SHORTCUT_BINDINGS.map((binding) => ({ ...binding })),
      LABELS.restored,
    );
  }

  const inputClass = (duplicated: boolean) =>
    cn(
      "h-9 w-36 cursor-pointer rounded-md border bg-card px-2 text-center text-xs font-semibold tabular-nums text-fg",
      "placeholder:font-normal placeholder:text-fg-3",
      duplicated
        ? "border-red-500/70 bg-red-500/10"
        : "border-line hover:border-line-strong",
      STUDIO_FOCUS_RING,
    );

  return (
    <section aria-labelledby="shortcut-customizer-title" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 id="shortcut-customizer-title" className="text-xs font-semibold text-fg-2">
            {LABELS.title}
          </h2>
          <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
            {LABELS.description}
          </p>
        </div>
        <button
          type="button"
          onClick={restoreDefaults}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-line bg-card px-2.5 text-xs font-semibold text-fg-2",
            "hover:bg-raised hover:text-fg",
            STUDIO_FOCUS_RING,
          )}
        >
          <RotateCcw size={14} aria-hidden />
          {LABELS.restoreDefaults}
        </button>
      </div>

      {duplicates.size > 0 ? (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-2 text-[0.7rem] font-medium text-fg">
          {LABELS.duplicateSummary} ({[...duplicates].join(", ")})
        </p>
      ) : null}

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line/70 text-[0.68rem] font-semibold text-fg-3">
            <th scope="col" className="py-1.5 pr-2 font-semibold">{LABELS.command}</th>
            <th scope="col" className="py-1.5 pr-2 font-semibold">{LABELS.shortcut}</th>
            <th scope="col" className="w-20 py-1.5"><span className="sr-only">{LABELS.clear}</span></th>
          </tr>
        </thead>
        <tbody>
          {bindings.map((binding) => {
            const normalized = normalizeShortcutKeys(binding.keys);
            const duplicated = normalized.length > 0 && duplicates.has(normalized);
            return (
              <tr key={binding.commandId} className="border-b border-line/40 last:border-0">
                <td className="py-1.5 pr-2 text-xs text-fg-2">{binding.label}</td>
                <td className="py-1.5 pr-2">
                  <input
                    readOnly
                    aria-label={`${binding.label} ${LABELS.shortcut}`}
                    aria-invalid={duplicated}
                    aria-describedby={duplicated ? `shortcut-dup-${binding.commandId}` : undefined}
                    placeholder={LABELS.inputPlaceholder}
                    value={binding.keys}
                    onKeyDown={(event) => {
                      const captured = captureShortcutFromKeyboardEvent(event);
                      if (!captured) return;
                      event.preventDefault();
                      updateKeys(binding.commandId, captured);
                    }}
                    className={inputClass(duplicated)}
                  />
                  {duplicated ? (
                    <p id={`shortcut-dup-${binding.commandId}`} className="mt-0.5 text-[0.66rem] font-medium text-red-500">
                      {LABELS.duplicate}
                    </p>
                  ) : null}
                </td>
                <td className="py-1.5">
                  <button
                    type="button"
                    aria-label={`${binding.label} ${LABELS.clear}`}
                    disabled={binding.keys.length === 0}
                    onClick={() => updateKeys(binding.commandId, "")}
                    className={cn(
                      "grid size-8 place-items-center rounded-md text-fg-3 hover:bg-raised hover:text-fg disabled:opacity-30",
                      STUDIO_FOCUS_RING,
                    )}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p role="status" aria-live="polite" className={cn("text-[0.68rem] text-fg-2", !notice && "sr-only")}>
        {notice}
      </p>
    </section>
  );
}

export default ShortcutCustomizer;
