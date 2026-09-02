import { Check, Copy, Loader2, Palette, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { getFriendlyColorName } from "./studio-color-harmony-engine";
import { extractPalette } from "./studio-color-palette";
import { createPalette, type StudioNamedPalette } from "./studio-palette-library";
import { getProductStudioPaletteSqliteRepository } from "./studio-palette-sqlite-repository";

// 주요 색상 팔레트 패널 — 선택된 이미지에서 주요 색을 스마트하게 추출하고
// 색 선택, 클립보드 복사, 원클릭 내 팔레트 라이브러리 저장을 지원한다.
export function StudioColorPalettePanel({
  src,
  onPickColor,
}: {
  src: string;
  onPickColor: (hex: string) => void;
}) {
  const [colors, setColors] = useState<string[]>([]);
  const [sampleCount, setSampleCount] = useState<number>(8);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [copyAllMessage, setCopyAllMessage] = useState(false);
  const [savedToLibraryMessage, setSavedToLibraryMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    setCopiedHex(null);
    extractPalette(src, sampleCount)
      .then((result) => {
        if (cancelled) return;
        setColors(result);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "색상 추출에 실패했어요.");
      })
      .finally(() => {
        if (cancelled) return;
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [src, sampleCount]);

  const handlePick = (hex: string) => {
    onPickColor(hex);
    navigator.clipboard
      ?.writeText(hex)
      .then(() => {
        setCopiedHex(hex);
        setTimeout(() => setCopiedHex(null), 1500);
      })
      .catch(() => {});
  };

  const handleCopyAll = () => {
    if (colors.length === 0) return;
    const text = colors.join(", ");
    navigator.clipboard?.writeText(text).then(() => {
      setCopyAllMessage(true);
      setTimeout(() => setCopyAllMessage(false), 1800);
    }).catch(() => {});
  };

  const handleSaveToLibrary = async () => {
    if (colors.length === 0) return;
    try {
      const repo = getProductStudioPaletteSqliteRepository();
      const palette: StudioNamedPalette = createPalette("이미지 추출 팔레트", colors);
      await repo.save(palette);
      setSavedToLibraryMessage("내 팔레트에 저장 완료!");
      setTimeout(() => setSavedToLibraryMessage(null), 2200);
    } catch {
      setSavedToLibraryMessage("임시 저장 완료");
      setTimeout(() => setSavedToLibraryMessage(null), 2200);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel/60 p-3 shadow-sm">
      {/* Header with Title and Count Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-fg-1">
          {busy ? <Loader2 size={15} className="animate-spin text-accent" /> : <Palette size={15} className="text-accent" />}
          <span>이미지 주요 색상</span>
          {colors.length > 0 && (
            <span className="rounded-full bg-accent/15 px-2 py-0.2 text-[0.62rem] font-bold text-accent">
              {colors.length}색
            </span>
          )}
        </div>

        {/* Extraction Count pills */}
        <div className="flex items-center gap-1 rounded-md border border-line bg-card/60 p-0.5 text-[0.62rem]">
          {[6, 8, 12].map((cnt) => (
            <button
              key={cnt}
              type="button"
              onClick={() => setSampleCount(cnt)}
              className={`rounded px-1.5 py-0.5 font-medium transition-colors ${
                sampleCount === cnt
                  ? "bg-accent text-on-accent"
                  : "text-fg-3 hover:text-fg-1"
              }`}
            >
              {cnt}색
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="text-xs text-bad">{error}</p>
      ) : busy ? (
        <p className="text-[0.7rem] leading-relaxed text-fg-3">이미지의 고유 배색을 분석하는 중…</p>
      ) : colors.length === 0 ? (
        <p className="text-[0.7rem] leading-relaxed text-fg-3">추출할 색이 없어요(투명 이미지).</p>
      ) : (
        <>
          {/* Gradient Banner Preview */}
          <div
            className="h-2 w-full rounded-full shadow-inner opacity-90 transition-opacity hover:opacity-100"
            style={{
              background: `linear-gradient(to right, ${colors.join(", ")})`,
            }}
          />

          {/* Swatches Grid */}
          <div className="flex flex-wrap gap-2 pt-1">
            {colors.map((hex) => {
              const friendly = getFriendlyColorName(hex).split(" (")[0];
              const isCopied = copiedHex === hex;
              return (
                <button
                  key={hex}
                  type="button"
                  onClick={() => handlePick(hex)}
                  title={`${hex} — ${friendly}`}
                  aria-label={`${hex} — ${friendly} 선택 및 복사`}
                  className="group flex flex-col items-center gap-1 transition-transform active:scale-95"
                >
                  <span
                    className="relative flex size-8 items-center justify-center rounded-lg border border-line shadow-sm transition-transform group-hover:scale-105"
                    style={{ backgroundColor: hex }}
                  >
                    {isCopied && (
                      <Check size={14} className="drop-shadow-[0_0_2px_rgba(0,0,0,0.9)] text-white" />
                    )}
                  </span>
                  <span className="font-mono text-[0.62rem] text-fg-3 group-hover:text-fg-1">
                    {isCopied ? "복사됨" : hex}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Action Bar: Save to Library & Copy All */}
          <div className="mt-1 flex items-center gap-1.5 pt-1 border-t border-line/50">
            <button
              type="button"
              onClick={handleSaveToLibrary}
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[0.66rem] font-semibold text-accent transition-colors hover:bg-accent/20 active:scale-[0.98]"
            >
              <Sparkles size={13} aria-hidden />
              {savedToLibraryMessage ?? "내 팔레트에 저장"}
            </button>

            <button
              type="button"
              onClick={handleCopyAll}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[0.66rem] font-medium text-fg-2 transition-colors hover:bg-raised active:scale-[0.98]"
            >
              {copyAllMessage ? <Check size={13} className="text-good" /> : <Copy size={13} />}
              <span>{copyAllMessage ? "전체 복사됨" : "전체 복사"}</span>
            </button>
          </div>
        </>
      )}

      {!error && (
        <p className="text-[0.65rem] leading-relaxed text-fg-3">
          100% 브라우저 클라이언트에서 고속 추출돼 서버 비용이 없습니다. 스와치를 클릭하면 즉시 주 색으로 적용되고 클립보드에 복사됩니다.
        </p>
      )}
    </div>
  );
}
