import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { QUICK_ADD_MAX_CARDS, QUICK_ADD_MAX_TITLE, splitQuickAddTitles } from "./board-quick-add-model";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly processes: readonly { readonly key: string; readonly label: string }[];
  readonly defaultProcess: string;
  readonly disabled: boolean;
  /** 이 줄에서 추가하면 어떤 값이 미리 채워지는지(예: "12화 · 최가은"). */
  readonly contextLabel?: string | null;
  /** 저장에 실패하면 false — 입력하던 글을 되살린다. */
  readonly onSubmit: (titles: readonly string[], processKey: string) => Promise<boolean>;
}

/** 열 아래 "+ 카드 추가": 제목만 쓰고 Enter. 여러 줄을 붙여 넣으면 줄마다 카드 한 장이 된다. */
export function BoardQuickAdd({ open, onOpenChange, processes, defaultProcess, disabled, contextLabel, onSubmit }: Props) {
  const bt = useBilingual("ProductionBoardQuickAdd");
  const [text, setText] = useState("");
  /** 빈 값이면 기본 공정(보고 있는 공정 필터나 첫 공정)을 쓴다. */
  const [process, setProcess] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);
  const titles = splitQuickAddTitles(text);
  const submit = async () => {
    if (titles.length === 0 || disabled) return;
    const previous = text;
    setText("");
    const saved = await onSubmit(titles, process || defaultProcess);
    if (!saved) setText((current) => current || previous);
    field.current?.focus();
  };
  const close = () => {
    onOpenChange(false);
    window.requestAnimationFrame(() => trigger.current?.focus());
  };
  if (!open) {
    return (
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        onClick={() => onOpenChange(true)}
        className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line bg-transparent px-3 text-sm font-semibold text-fg-2 outline-none transition-colors hover:border-accent/60 hover:bg-accent-soft hover:text-accent focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 motion-reduce:transition-none"
      >
        <Plus className="size-4" aria-hidden="true" />
        {bt("카드 추가", "Add a card")}
        <kbd aria-hidden="true" className="ml-1 rounded border border-line bg-raised px-1.5 text-[0.6875rem] text-fg-3">C</kbd>
      </button>
    );
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };
  return (
    <form
      aria-label={bt("새 카드 추가", "Add new cards")}
      className="mt-3 rounded-2xl border border-accent/50 bg-card p-2.5 shadow-sm"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void submit();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && text.trim() === "") onOpenChange(false);
      }}
    >
      <textarea
        ref={field}
        value={text}
        rows={2}
        maxLength={QUICK_ADD_MAX_TITLE * QUICK_ADD_MAX_CARDS}
        disabled={disabled}
        aria-label={bt("새 카드 제목", "New card title")}
        placeholder={bt("카드 제목을 입력하세요", "Type a card title")}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className="min-h-[4.5rem] w-full resize-none rounded-xl border border-line bg-canvas px-3 py-2 text-sm leading-6 text-fg outline-none placeholder:text-fg-3 focus-visible:ring-2 focus-visible:ring-accent"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 basis-32 items-center gap-1.5 text-xs text-fg-2">
          <span className="shrink-0">{bt("공정", "Process")}</span>
          <select
            value={process || defaultProcess}
            onChange={(event) => setProcess(event.target.value)}
            disabled={disabled}
            aria-label={bt("새 카드의 공정", "Process for new cards")}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {processes.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={disabled || titles.length === 0}
          className={cn(
            "inline-flex min-h-11 items-center gap-1 rounded-xl bg-accent px-3 text-sm font-bold text-on-accent outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-45",
          )}
        >
          <Plus className="size-4" aria-hidden="true" />
          {titles.length > 1 ? bt(`카드 ${titles.length}장 추가`, `Add ${titles.length} cards`) : bt("추가", "Add")}
        </button>
        <button
          type="button"
          onClick={close}
          aria-label={bt("카드 추가 닫기", "Close add card")}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-fg-3 outline-none hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-2 text-[0.6875rem] leading-5 text-fg-3">
        {contextLabel ? <span className="mr-1 font-semibold text-fg-2">{contextLabel} ·</span> : null}
        {bt("Enter로 추가 · Shift+Enter 줄바꿈 · 여러 줄을 붙여 넣으면 카드가 여러 장 만들어집니다. 새 카드는 항상 '초안'으로 시작합니다.", "Enter to add · Shift+Enter for a new line · paste several lines to create several cards. New cards always start as drafts.")}
      </p>
    </form>
  );
}
