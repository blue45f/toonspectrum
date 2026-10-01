/**
 * 변환 페이지의 파일 선택 칸. 기본 파일 입력은 그대로 두고(키보드·보조기술 동작 유지) 겉모습만
 * 끌어 놓기 영역으로 바꾼다. 형식·크기 검사는 기존 준비 단계가 그대로 맡는다.
 */
import { FileUp } from "lucide-react";
import { useId, useState } from "react";

import type { DragEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export function ConversionFilePicker({ label, accept, fileName, hint, onFile }: {
  readonly label: string;
  readonly accept: string;
  readonly fileName: string | undefined;
  readonly hint: string;
  readonly onFile: (file: File | undefined) => void;
}) {
  const bt = useBilingual("ConversionFilePicker");
  const inputId = useId();
  const hintId = useId();
  const [dragging, setDragging] = useState(false);
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  };
  return (
    <div className="text-sm" data-conversion-file-picker="true">
      <span className="block">{label}</span>
      <input
        id={inputId}
        type="file"
        accept={accept}
        aria-describedby={hintId}
        className="peer sr-only"
        onChange={(event) => onFile(event.target.files?.[0])}
      />
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "mt-1.5 flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 transition-colors motion-reduce:transition-none",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
          dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-canvas/40 hover:border-accent/60 hover:bg-accent-soft/40",
        )}
      >
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <FileUp size={18} />
        </span>
        <span className="min-w-0">
          <span className={cn("block truncate font-semibold", fileName ? "text-fg" : "text-fg-2")}>
            {fileName ?? bt("파일 선택 또는 여기로 끌어 놓기", "Choose a file or drop it here")}
          </span>
          <span id={hintId} className="mt-0.5 block text-xs text-fg-3">{hint}</span>
        </span>
      </label>
    </div>
  );
}
