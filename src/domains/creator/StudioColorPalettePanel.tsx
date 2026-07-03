import { Check, Loader2, Palette } from "lucide-react";
import { useEffect, useState } from "react";

import { extractPalette } from "./studio-color-palette";

// 주요 색상 팔레트 패널 — 선택된 이미지에서 자주 쓰인 색을 추출해 스와치로 보여준다.
// 스와치 클릭 시 onPickColor 로 헥스를 넘기고(호출부가 의미를 정한다 — 예: 버킷 채우기 색 지정),
// 동시에 클립보드에도 복사해(best-effort) 다른 곳(브러시 색 등)에 바로 붙여넣을 수 있게 한다.
export function StudioColorPalettePanel({
  src,
  onPickColor,
}: {
  src: string;
  onPickColor: (hex: string) => void;
}) {
  const [colors, setColors] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    setCopiedHex(null);
    extractPalette(src)
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
  }, [src]);

  const handlePick = (hex: string) => {
    onPickColor(hex);
    // 클립보드 권한이 없어도 스와치 클릭(색 지정) 자체는 항상 성공해야 하므로 실패를 삼킨다.
    navigator.clipboard
      ?.writeText(hex)
      .then(() => setCopiedHex(hex))
      .catch(() => {});
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-panel/50 p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-fg-1">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Palette size={14} />}
        주요 색상
      </div>
      {error ? (
        <p className="text-xs text-bad">{error}</p>
      ) : busy ? (
        <p className="text-[0.7rem] leading-relaxed text-fg-3">색상을 분석하는 중…</p>
      ) : colors.length === 0 ? (
        <p className="text-[0.7rem] leading-relaxed text-fg-3">추출할 색이 없어요(투명 이미지).</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {colors.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => handlePick(hex)}
              title={hex}
              className="group flex flex-col items-center gap-1"
            >
              <span
                className="relative flex size-7 items-center justify-center rounded-lg border border-line transition-transform group-hover:scale-105"
                style={{ backgroundColor: hex }}
              >
                {copiedHex === hex && (
                  <Check size={13} className="drop-shadow-[0_0_2px_rgba(0,0,0,0.8)] text-white" />
                )}
              </span>
              <span className="font-mono text-[0.65rem] text-fg-3">
                {copiedHex === hex ? "복사됨" : hex}
              </span>
            </button>
          ))}
        </div>
      )}
      {!error && (
        <p className="text-[0.7rem] leading-relaxed text-fg-3">
          이미지의 주요 색상을 추출해요 — 100% 브라우저 실행(무료). 스와치를 누르면 색이 선택되고
          클립보드에도 복사돼요.
        </p>
      )}
    </div>
  );
}
