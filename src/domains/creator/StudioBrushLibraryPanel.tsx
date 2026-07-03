// 브러시 라이브러리 패널 — StudioPaletteLibraryPanel.tsx(색상 팔레트 저장/불러오기)의 브러시 버전.
// "그리기 도구 설정" 패널 안에 인라인으로 얹히는 자기완결형(self-contained) 하위 섹션이다(팔레트
// 패널과 달리 툴바 드롭다운으로 뜨는 floating 오버레이가 아니라, 이미 열려 있는 패널의 일부이므로
// position:fixed/absolute를 쓰지 않는다 — 자세한 배치는 docs/studio-brush-library-integration.md 참고).
//
// 이름 붙은 브러시 설정(펜 종류·크기·투명도·색상·손떨림 보정·필압 옵션)을 저장·이름변경·삭제하고,
// 이 앱 전용 JSON 포맷으로 가져오기/내보내기 한다. 캔버스 제스처를 가로채지 않으므로(그냥 상태
// 스냅샷 저장/적용) disarmAllPixelTools() 대상에 포함되지 않는다.
import { Download, Pencil, Save, Upload, X } from "lucide-react";
import { useState, type ChangeEvent, type KeyboardEvent } from "react";

import { BRUSH_PRESETS } from "./studio-brush";
import {
  brushFileName,
  createBrush,
  deleteBrush,
  importBrushFromJson,
  listBrushes,
  renameBrush,
  saveBrush,
  writeBrushJson,
  type StudioBrushSnapshot,
  type StudioSavedBrush,
} from "./studio-brush-library";
import { downloadBlob } from "./studio-export";

import { cx } from "@/lib/cx";

const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024; // 2MB — studio-palette-library 가져오기와 동일한 저비용 가드.
const PREVIEW_SWATCH_MIN = 10;
const PREVIEW_SWATCH_MAX = 30;

function brushPresetLabel(brushId: string): string {
  return BRUSH_PRESETS.find((p) => p.id === brushId)?.name ?? brushId;
}

function previewSize(strokeWidth: number): number {
  // strokeWidth(1~48)를 스와치 지름(10~30px)으로 매핑 — 실제 굵기 비율이 아니라 "대충 느낌"만 준다.
  return Math.round(PREVIEW_SWATCH_MIN + (Math.min(48, Math.max(1, strokeWidth)) / 48) * (PREVIEW_SWATCH_MAX - PREVIEW_SWATCH_MIN));
}

export interface StudioBrushLibraryPanelProps {
  /** 현재 캔버스에서 실제로 그리기에 쓰이는 라이브 브러시 설정 스냅샷. "현재 브러시 저장"이 이 값을 이름 붙여 저장한다. */
  currentSnapshot: StudioBrushSnapshot;
  /** 저장된 브러시를 고르면 호출 — 어떤 setter를 호출해 되돌릴지는 전적으로 호출부(StudioPage)가 결정한다(onPickColor와 동일한 위임 패턴). */
  onApplyBrush: (brush: StudioSavedBrush) => void;
}

export function StudioBrushLibraryPanel({ currentSnapshot, onApplyBrush }: StudioBrushLibraryPanelProps) {
  // lazy 초기화 — StudioPaletteLibraryPanel과 동일하게 마운트 시점에 동기 로드(이 컴포넌트 자체가
  // lazyRetry로 필요할 때만 로드되므로 이미 "필요할 때만"이다).
  const [brushes, setBrushes] = useState<StudioSavedBrush[]>(() => listBrushes(globalThis.localStorage));
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");

  function handleDelete(id: string) {
    setBrushes(deleteBrush(globalThis.localStorage, id));
  }

  function startRename(b: StudioSavedBrush) {
    setRenamingId(b.id);
    setRenamingName(b.name);
  }

  function commitRename() {
    if (!renamingId) return;
    setBrushes(renameBrush(globalThis.localStorage, renamingId, renamingName));
    setRenamingId(null);
  }

  function handleRenameKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commitRename();
    else if (e.key === "Escape") setRenamingId(null);
  }

  function handleSaveCurrent() {
    const created = createBrush(newName, currentSnapshot); // createBrush는 절대 던지지 않는다(항상 clamp/보정).
    setBrushes(saveBrush(globalThis.localStorage, created));
    setError(null);
    setDoneMsg(`"${created.name}" 브러시를 저장했어요.`);
    setNewName("");
    setCreatorOpen(false);
  }

  function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 시에도 onChange가 다시 발생하도록 즉시 리셋(StudioPaletteLibraryPanel과 동일 관례).
    if (!file) return;
    setError(null);
    setDoneMsg(null);
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setError("파일이 너무 커요. 2MB 이하 브러시 설정(.json) 파일만 가져올 수 있어요.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text !== "string") {
        setError("브러시 설정 파일을 읽지 못했어요.");
        return;
      }
      try {
        const fallbackName = file.name.replace(/\.json$/i, "");
        const { brush: imported, adjustedFields } = importBrushFromJson(text, fallbackName);
        setBrushes(saveBrush(globalThis.localStorage, imported));
        const parts = [`"${imported.name}" 브러시를 가져왔어요.`];
        if (adjustedFields.length > 0) parts.push(`일부 값(${adjustedFields.join(", ")})은 범위를 벗어나 기본값으로 보정했어요.`);
        setDoneMsg(parts.join(" "));
      } catch (err) {
        setError(err instanceof Error ? err.message : "브러시 설정 파일을 가져오지 못했어요.");
      }
    };
    reader.onerror = () => setError("브러시 설정 파일을 읽지 못했어요.");
    reader.readAsText(file);
  }

  function handleExport(b: StudioSavedBrush) {
    downloadBlob(new Blob([writeBrushJson(b)], { type: "application/json;charset=utf-8" }), brushFileName(b));
  }

  return (
    <div className="space-y-1.5 pt-1.5 border-t border-line/35">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.66rem] font-medium text-fg-3">내 브러시 — 저장·가져오기(.json)·내보내기</p>
        <label className="flex shrink-0 cursor-pointer items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[0.62rem] font-semibold text-fg-2 transition-colors hover:bg-raised">
          <Upload size={10} /> 가져오기
          <input type="file" accept=".json,application/json" className="hidden" onChange={handleImportFile} />
        </label>
      </div>

      {error && (
        <p className="text-[0.64rem] text-bad" role="alert">
          {error}
        </p>
      )}
      {doneMsg && !error && (
        <p className="text-[0.64rem] text-good" role="status">
          {doneMsg}
        </p>
      )}

      <button
        type="button"
        onClick={() => setCreatorOpen((v) => !v)}
        aria-expanded={creatorOpen}
        className={cx(
          "flex w-full items-center justify-center gap-1 rounded-lg border border-line py-1.5 text-[0.66rem] font-semibold transition-colors hover:bg-raised",
          creatorOpen ? "bg-raised text-fg-2" : "text-fg-2"
        )}
      >
        <Save size={11} /> 현재 브러시 저장
      </button>
      {creatorOpen && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-card p-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="브러시 이름"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- 저장 폼은 사용자 액션으로만 열리고, 곧바로 이름을 입력할 것이므로 즉시 포커스가 정답
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveCurrent();
              else if (e.key === "Escape") setCreatorOpen(false);
            }}
            className="h-7 rounded border border-line bg-panel px-2 text-xs text-fg outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={handleSaveCurrent}
            className="rounded-lg bg-accent py-1.5 text-[0.66rem] font-semibold text-on-accent transition-colors hover:opacity-90"
          >
            저장
          </button>
        </div>
      )}

      {brushes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-2 py-3 text-center text-[0.64rem] leading-relaxed text-fg-3">
          저장된 브러시가 없어요. 위에서 현재 설정을 저장하거나 .json 파일을 가져와보세요.
        </p>
      ) : (
        <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
          {brushes.map((b) => (
            <div key={b.id} className="rounded-lg border border-line bg-card px-1.5 py-1.5">
              <div className="mb-1 flex items-center gap-0.5">
                {renamingId === b.id ? (
                  <input
                    type="text"
                    value={renamingName}
                    onChange={(e) => setRenamingName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={handleRenameKeyDown}
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- inline rename field opens only on user action; focusing it immediately is correct edit-on-demand UX
                    autoFocus
                    className="min-w-0 flex-1 rounded border border-accent bg-panel px-1 py-0.5 text-[0.68rem] text-fg outline-none"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-[0.68rem] font-medium text-fg" title={b.name}>
                    {b.name}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => startRename(b)}
                  aria-label={`${b.name} 이름 변경`}
                  title="이름 변경"
                  className="shrink-0 text-fg-3 transition-colors hover:text-accent"
                >
                  <Pencil size={10} />
                </button>
                <button
                  type="button"
                  onClick={() => handleExport(b)}
                  aria-label={`${b.name} 내보내기`}
                  title="JSON으로 내보내기"
                  className="shrink-0 text-fg-3 transition-colors hover:text-accent"
                >
                  <Download size={10} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(b.id)}
                  aria-label={`${b.name} 브러시 삭제`}
                  title="삭제"
                  className="shrink-0 text-fg-3 transition-colors hover:text-bad"
                >
                  <X size={10} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => onApplyBrush(b)}
                title={`${b.name} 불러오기`}
                className="flex w-full items-center gap-1.5 rounded border border-line/60 bg-panel/50 px-1.5 py-1 text-left transition-colors hover:border-accent hover:bg-accent-soft/30"
              >
                <span
                  className="shrink-0 rounded-full border border-line"
                  style={{
                    width: previewSize(b.strokeWidth),
                    height: previewSize(b.strokeWidth),
                    background: b.color,
                    opacity: Math.max(0.15, b.brushOpacity),
                  }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-[0.6rem] leading-tight text-fg-3">
                  <span className="block truncate">{brushPresetLabel(b.brushId)}</span>
                  <span className="numeral block">
                    {b.strokeWidth}px · {Math.round(b.brushOpacity * 100)}%
                  </span>
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
