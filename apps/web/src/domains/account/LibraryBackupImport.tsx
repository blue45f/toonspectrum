import { Upload } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { MAX_LIBRARY_BACKUP_BYTES, parseLibraryBackup } from "./library-backup";

import type { HydratePayload } from "@/shared/lib/store-types";

export function LibraryBackupImport({ onRestore, locale, ownerId }: {
  onRestore: (data: HydratePayload) => void;
  locale: "ko" | "en";
  ownerId: string | null;
}) {
  const korean = locale === "ko";
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const returnFocus = useRef(false);
  const [pending, setPending] = useState<{ data: HydratePayload; fileName: string; ownerId: string | null } | null>(null);
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    generation.current += 1;
    returnFocus.current = false;
    setPending(null);
    setReading(false);
    setMessage("");
    return () => { generation.current += 1; };
  }, [ownerId]);
  // Restore focus after React removes the preview and re-enables the trigger.
  useEffect(() => {
    if (pending) preview.current?.focus();
    else if (!reading && returnFocus.current) {
      returnFocus.current = false;
      trigger.current?.focus({ preventScroll: true });
    }
  }, [pending, reading]);

  async function selectFile(file: File) {
    const ticket = ++generation.current;
    setPending(null); setMessage(""); setFailed(false); setReading(true);
    try {
      if (file.size > MAX_LIBRARY_BACKUP_BYTES) throw new Error("backup-too-large");
      const data = parseLibraryBackup(await file.text());
      if (generation.current !== ticket) return;
      setPending({ data, fileName: file.name, ownerId });
    } catch {
      if (generation.current !== ticket) return;
      setFailed(true);
      setMessage(korean ? "올바른 ToonStudio 서재 백업 JSON 파일(최대 5MB)을 선택해 주세요. 기존 기록은 변경하지 않았습니다." : "Choose a valid ToonStudio library backup JSON file (up to 5MB). Existing records were not changed.");
    } finally {
      if (generation.current === ticket) setReading(false);
    }
  }
  return (
    <div className="w-full min-w-0 max-w-md text-sm" data-library-import="">
      <button ref={trigger} type="button" disabled={reading} onClick={() => input.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 py-2 font-medium text-fg-2 hover:bg-raised disabled:opacity-60">
        <Upload size={14} aria-hidden="true" />{reading ? (korean ? "백업 확인 중…" : "Checking backup…") : (korean ? "백업 가져오기" : "Import backup")}
      </button>
      <input ref={input} type="file" accept="application/json,.json" className="hidden" aria-label={korean ? "서재 백업 파일" : "Library backup file"} onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (file) void selectFile(file);
      }} />
      {message && <p className={`mt-3 break-words text-xs leading-6 ${failed ? "text-bad" : "text-good"}`} role={failed ? "alert" : "status"}>{message}</p>}
      {pending && <div ref={preview} tabIndex={-1} role="region" aria-labelledby={id} className="mt-3 rounded-xl border border-accent/35 bg-accent-soft/35 p-4 outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <h3 id={id} className="font-semibold text-fg">{korean ? "백업 복원 미리보기" : "Review backup before restoring"}</h3>
        <p className="mt-2 break-all text-xs text-fg-2">{pending.fileName}</p>
        <p className="mt-2 text-xs leading-6 text-fg-2">{korean
          ? `별점 ${Object.keys(pending.data.ratings).length} · 읽기 기록 ${Object.keys(pending.data.reads).length} · 리뷰 ${Object.keys(pending.data.reviews).length} · 컬렉션 ${pending.data.collections.length}`
          : `${Object.keys(pending.data.ratings).length} ratings · ${Object.keys(pending.data.reads).length} reading records · ${Object.keys(pending.data.reviews).length} reviews · ${pending.data.collections.length} collections`}</p>
        <p className="mt-2 text-xs leading-6 text-fg">{korean ? "확인하면 현재 브라우저의 서재 기록을 이 백업으로 교체합니다. 필요한 현재 기록은 먼저 내보내세요." : "Confirming replaces this browser’s library with this backup. Export any current records you need first."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="min-h-11 rounded-lg border border-line bg-panel px-3 py-2 text-fg" onClick={() => { generation.current += 1; returnFocus.current = true; setReading(false); setPending(null); }}>{korean ? "취소" : "Cancel"}</button>
          <button type="button" className="min-h-11 rounded-lg bg-accent px-3 py-2 font-semibold text-on-accent" onClick={() => {
            if (pending.ownerId !== ownerId) { setPending(null); return; }
            try {
              onRestore(pending.data); returnFocus.current = true; setReading(false); setPending(null); setFailed(false);
              setMessage(korean ? "서재 백업을 복원했습니다." : "Library backup restored.");
            } catch {
              setFailed(true);
              setMessage(korean ? "브라우저 저장소에 기록하지 못했습니다. 저장 공간과 접근 권한을 확인해 주세요." : "Could not persist the library. Check browser storage space and permissions.");
            }
          }}>{korean ? "기존 기록 교체 확인" : "Confirm replacing existing records"}</button>
        </div>
      </div>}
    </div>
  );
}
