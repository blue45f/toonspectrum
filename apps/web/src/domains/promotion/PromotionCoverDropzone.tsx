import { ImagePlus, LoaderCircle } from "lucide-react";
import { useId, useRef, useState } from "react";
import { validPromotionCover } from "../../../../../packages/core/src/promotion";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export function PromotionCoverDropzone({ cover, busy, disabled, onSelect, onRemove }: {
  readonly cover: string;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onSelect: (file: File) => void;
  readonly onRemove: () => void;
}) {
  const bt = useBilingual("PromotionCoverDropzone");
  const id = useId();
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const locked = busy || disabled;
  const select = (files: readonly File[]) => {
    if (locked || !files.length) return;
    const file = files[0];
    if (files.length !== 1 || !file) { setError(bt("표지 이미지는 한 번에 한 개만 선택하세요.", "Choose one cover image at a time.")); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size === 0 || file.size > 8 * 1024 * 1024) {
      setError(bt("8MB 이하의 JPEG·PNG·WebP 이미지 파일을 선택하세요.", "Choose a JPEG, PNG or WebP image up to 8 MB.")); return;
    }
    setError(""); onSelect(file);
  };
  return <section aria-label={bt("홍보 표지 업로드", "Promotion cover upload")} aria-busy={busy}
    className={cn("rounded-2xl border-2 border-dashed p-4 transition-colors motion-reduce:transition-none", over && !locked ? "border-accent bg-accent-soft" : "border-line bg-panel")}
    onDragEnter={(event) => {
      if (!Array.from(event.dataTransfer.types).includes("Files")) return;
      event.preventDefault(); if (!locked) { depth.current += 1; setOver(true); }
    }}
    onDragOver={(event) => {
      if (!Array.from(event.dataTransfer.types).includes("Files")) return;
      event.preventDefault(); event.dataTransfer.dropEffect = locked ? "none" : "copy";
    }}
    onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); }}
    onDrop={(event) => {
      event.preventDefault(); depth.current = 0; setOver(false);
      select(Array.from(event.dataTransfer.files));
    }}>
    <label htmlFor={id} className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl text-center text-sm font-semibold focus-within:ring-2 focus-within:ring-accent">
      {busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <ImagePlus aria-hidden="true" />}
      {busy ? bt("표지를 안전하게 변환 중…", "Preparing cover…") : bt("표지를 끌어 놓거나 파일 선택", "Drop a cover here or choose a file")}
      <input id={id} aria-label={bt("표지 이미지 선택", "Choose cover image")} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={locked}
        onChange={(event) => { select(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
    </label>
    <p className="mt-2 text-xs leading-6 text-fg-2">
      {bt("JPEG·PNG·WebP, 최대 8MB. 이 기기에서 표지용 JPEG로 변환하며 원본 파일을 외부 이미지 서비스로 보내지 않습니다.", "JPEG, PNG or WebP, up to 8 MB. Converted locally to a cover JPEG without sending the original to an external image service.")}
    </p>
    {error ? <p role="alert" className="mt-2 text-sm text-bad">{error}</p> : null}
    {cover && validPromotionCover(cover) ? <div className="mt-3 flex flex-wrap items-end gap-3">
      <img src={cover} alt={bt("표지 미리 보기", "Cover preview")} className="max-h-56 max-w-full rounded-xl border border-line object-contain" />
      <button type="button" disabled={locked} className="min-h-11 rounded-xl border border-line bg-card px-3 text-sm disabled:opacity-50"
        onClick={() => { if (!locked) { setError(""); onRemove(); } }}>{bt("표지 제거", "Remove cover")}</button>
    </div> : null}
  </section>;
}
