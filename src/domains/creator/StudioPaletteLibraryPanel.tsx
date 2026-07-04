// 팔레트 라이브러리 패널 — "스타일" 툴바 그룹 팝오버 안에 서브탭 콘텐츠로 얹히는 컴포넌트.
// 이름 붙은 색상 팔레트를 저장·이름변경·삭제하고, GIMP .gpl 파일로 가져오기/내보내기 한다.
// StudioColorPalettePanel(이미지 추출)과 달리 이 패널은 사용자가 직접 만들거나 가져온
// 팔레트를 "보관"하는 라이브러리 매니저다.
// 팝오버 위치·z-index·max-height는 호출부(StudioPage.tsx의 스타일 그룹 wrapper)가 담당한다 —
// 이 컴포넌트는 자체 fixed/absolute wrapper를 갖지 않는다(2026-07-05 툴바 그룹화로 이관).
import { Download, Pencil, Plus, Upload, X } from "lucide-react";
import { useState, type ChangeEvent, type KeyboardEvent } from "react";

import { downloadBlob } from "./studio-export";
import {
  createPalette,
  deletePalette,
  importPaletteFromGpl,
  listPalettes,
  MAX_COLORS_PER_PALETTE,
  paletteFileName,
  renamePalette,
  savePalette,
  writeGplPalette,
  type StudioNamedPalette,
} from "./studio-palette-library";

import { cx } from "@/lib/cx";

const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024; // 2MB — 병적으로 큰 파일의 메인스레드 파싱 지연 방지용 저비용 가드.
const SWATCH_PREVIEW_COUNT = 8;

export interface StudioPaletteLibraryPanelProps {
  /** 스와치를 클릭하면 호출 — 전역 브러시/도형 색(StudioPage의 `color`)을 갱신하도록 호출부가 결정한다. */
  onPickColor: (hex: string) => void;
  /** "최근 사용 색으로 새 팔레트" 시드로 쓸 후보(StudioPage의 recentColors). 비어 있으면 해당 버튼 비활성. */
  seedColors?: string[];
}

export function StudioPaletteLibraryPanel({ onPickColor, seedColors }: StudioPaletteLibraryPanelProps) {
  // lazy 초기화 — 모듈은 정적 import라 useEffect 없이 마운트 시점에 동기 로드 가능(클립과 달리
  // 동적 import가 필요 없다: 이 패널 자체가 menu === "palette"일 때만 마운트되므로 이미 "필요할 때만"이다).
  const [palettes, setPalettes] = useState<StudioNamedPalette[]>(() => listPalettes(globalThis.localStorage));
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null); // StudioMotionExportPanel.tsx의 doneMsg 관례
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColorsText, setNewColorsText] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");

  function handleDelete(id: string) {
    setPalettes(deletePalette(globalThis.localStorage, id));
  }

  function startRename(p: StudioNamedPalette) {
    setRenamingId(p.id);
    setRenamingName(p.name);
  }

  function commitRename() {
    if (!renamingId) return;
    setPalettes(renamePalette(globalThis.localStorage, renamingId, renamingName));
    setRenamingId(null);
  }

  function handleRenameKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commitRename();
    else if (e.key === "Escape") setRenamingId(null);
  }

  function handleCreateFromRecent() {
    if (!seedColors || seedColors.length === 0) return;
    try {
      const palette = createPalette("최근 사용 색", seedColors);
      setPalettes(savePalette(globalThis.localStorage, palette));
      setError(null);
      setDoneMsg(`"${palette.name}" 팔레트를 만들었어요 (${palette.colors.length}색).`);
    } catch (e) {
      setDoneMsg(null);
      setError(e instanceof Error ? e.message : "팔레트를 만들지 못했어요.");
    }
  }

  function handleCreateFromPaste() {
    const colors = newColorsText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const palette = createPalette(newName, colors);
      setPalettes(savePalette(globalThis.localStorage, palette));
      setError(null);
      setDoneMsg(`"${palette.name}" 팔레트를 만들었어요 (${palette.colors.length}색).`);
      setNewName("");
      setNewColorsText("");
      setCreatorOpen(false);
    } catch (e) {
      setDoneMsg(null);
      setError(e instanceof Error ? e.message : "팔레트를 만들지 못했어요.");
    }
  }

  function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 시에도 onChange가 다시 발생하도록 즉시 리셋(중요: StudioPage.tsx의
    // handleImportProject와 동일한 관례 — file input의 근본적 함정).
    if (!file) return;
    setError(null);
    setDoneMsg(null);
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setError("파일이 너무 커요. 2MB 이하 .gpl 파일만 가져올 수 있어요.");
      return;
    }
    const reader = new FileReader(); // StudioPage.tsx의 handleImportProject와 동일한 FileReader 관례(Blob.text() 아님).
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text !== "string") {
        setError("팔레트 파일을 읽지 못했어요.");
        return;
      }
      try {
        const fallbackName = file.name.replace(/\.gpl$/i, "");
        const { palette, skippedLines, truncated } = importPaletteFromGpl(text, fallbackName);
        setPalettes(savePalette(globalThis.localStorage, palette));
        const parts = [`"${palette.name}" 팔레트에 ${palette.colors.length}개 색을 가져왔어요.`];
        if (skippedLines > 0) parts.push(`인식하지 못한 줄 ${skippedLines}개는 건너뛰었어요.`);
        if (truncated) parts.push(`색이 너무 많아 앞쪽 ${MAX_COLORS_PER_PALETTE}개만 저장했어요.`);
        setDoneMsg(parts.join(" "));
      } catch (err) {
        setError(err instanceof Error ? err.message : "팔레트 파일을 가져오지 못했어요.");
      }
    };
    reader.onerror = () => setError("팔레트 파일을 읽지 못했어요.");
    reader.readAsText(file);
  }

  function handleExport(p: StudioNamedPalette) {
    downloadBlob(new Blob([writeGplPalette(p)], { type: "text/plain;charset=utf-8" }), paletteFileName(p));
  }

  return (
    <>
      <p className="mb-1.5 text-[0.66rem] font-medium text-fg-3">내 팔레트 — 저장·가져오기(.gpl)·내보내기</p>

      {error && (
        <p className="mb-1.5 text-[0.66rem] text-bad" role="alert">
          {error}
        </p>
      )}
      {doneMsg && !error && (
        <p className="mb-1.5 text-[0.66rem] text-good" role="status">
          {doneMsg}
        </p>
      )}

      <div className="mb-2 grid grid-cols-2 gap-1.5">
        <label className="flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-line bg-card py-1.5 text-[0.66rem] font-semibold text-fg-2 transition-colors hover:bg-raised">
          <Upload size={11} /> 가져오기(.gpl)
          <input type="file" accept=".gpl,text/plain" className="hidden" onChange={handleImportFile} />
        </label>
        <button
          type="button"
          onClick={handleCreateFromRecent}
          disabled={!seedColors || seedColors.length === 0}
          title={seedColors && seedColors.length > 0 ? "최근 사용한 색으로 새 팔레트 만들기" : "최근 사용한 색이 없어요"}
          className="flex items-center justify-center gap-1 rounded-lg border border-line bg-card py-1.5 text-[0.66rem] font-semibold text-fg-2 transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={11} /> 최근 색으로 만들기
        </button>
      </div>

      <button
        type="button"
        onClick={() => setCreatorOpen((v) => !v)}
        aria-expanded={creatorOpen}
        className={cx(
          "mb-2 w-full rounded-lg py-1.5 text-[0.66rem] font-semibold transition-colors hover:bg-raised",
          creatorOpen ? "bg-raised text-fg-2" : "text-fg-3 hover:text-fg-2"
        )}
      >
        직접 입력
      </button>
      {creatorOpen && (
        <div className="mb-2 flex flex-col gap-1.5 rounded-lg border border-line bg-card p-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="팔레트 이름"
            className="h-7 rounded border border-line bg-panel px-2 text-xs text-fg outline-none focus:border-accent"
          />
          <textarea
            value={newColorsText}
            onChange={(e) => setNewColorsText(e.target.value)}
            placeholder="#ff0000 #00ff00 #0000ff 처럼 스페이스나 쉼표로 구분해 입력하세요"
            rows={2}
            className="resize-none rounded border border-line bg-panel px-2 py-1 text-xs leading-relaxed text-fg outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={handleCreateFromPaste}
            disabled={!newColorsText.trim()}
            className="rounded-lg bg-accent py-1.5 text-[0.66rem] font-semibold text-on-accent transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            팔레트 만들기
          </button>
        </div>
      )}

      {palettes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-2 py-4 text-center text-[0.66rem] leading-relaxed text-fg-3">
          저장된 팔레트가 없어요. .gpl 파일을 가져오거나 최근 사용 색으로 새로 만들어보세요.
        </p>
      ) : (
        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {palettes.map((p) => (
            <div key={p.id} className="rounded-lg border border-line bg-card px-2 py-1.5">
              <div className="flex items-center gap-1">
                {renamingId === p.id ? (
                  <input
                    type="text"
                    value={renamingName}
                    onChange={(e) => setRenamingName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={handleRenameKeyDown}
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- inline rename field opens only on user action; focusing it immediately is correct edit-on-demand UX
                    autoFocus
                    className="min-w-0 flex-1 rounded border border-accent bg-panel px-1 py-0.5 text-xs text-fg outline-none"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg" title={p.name}>
                    {p.name}
                    <span className="ml-1 text-[0.6rem] text-fg-3">{p.colors.length}색</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => startRename(p)}
                  aria-label={`${p.name} 이름 변경`}
                  title="이름 변경"
                  className="shrink-0 text-fg-3 transition-colors hover:text-accent"
                >
                  <Pencil size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => handleExport(p)}
                  aria-label={`${p.name} 내보내기`}
                  title="GIMP 팔레트(.gpl)로 내보내기"
                  className="shrink-0 text-fg-3 transition-colors hover:text-accent"
                >
                  <Download size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(p.id)}
                  aria-label={`${p.name} 팔레트 삭제`}
                  title="삭제"
                  className="shrink-0 text-fg-3 transition-colors hover:text-bad"
                >
                  <X size={11} />
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {p.colors.slice(0, SWATCH_PREVIEW_COUNT).map((hex, idx) => (
                  <button
                    key={`${hex}-${idx}`}
                    type="button"
                    onClick={() => onPickColor(hex)}
                    title={hex}
                    className="h-5 w-5 rounded border border-line"
                    style={{ background: hex }}
                  />
                ))}
                {p.colors.length > SWATCH_PREVIEW_COUNT && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded border border-line px-0.5 text-[0.55rem] font-medium text-fg-3">
                    +{p.colors.length - SWATCH_PREVIEW_COUNT}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
