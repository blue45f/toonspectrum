import { Check, Copy, Download, Palette } from "lucide-react";
import { useState } from "react";

import { buttonClass } from "@/components/ui/button-utils";

interface MarketPalettePreviewProps {
  readonly colors: readonly string[];
  readonly paletteName?: string;
  className?: string;
}

function getLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const a = [r, g, b].map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

export function MarketPalettePreview({
  colors,
  paletteName = "팔레트",
  className,
}: MarketPalettePreviewProps) {
  const [copiedColor, setCopiedColor] = useState<string | null>(null);

  const handleCopyColor = async (color: string) => {
    try {
      await navigator.clipboard.writeText(color);
      setCopiedColor(color);
      setTimeout(() => setCopiedColor(null), 1800);
    } catch {
      // Fallback
    }
  };

  const handleDownloadPaletteJson = () => {
    const data = {
      name: paletteName,
      colors,
      exportedAt: new Date().toISOString(),
      generator: "ToonSpectrum Creator Market",
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${paletteName.toLowerCase().replace(/\s+/g, "-")}-palette.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`overflow-hidden rounded-xl border border-line bg-card ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 bg-panel/50">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-accent" aria-hidden="true" />
          <h3 id="market-palette-heading" className="text-xs font-semibold text-fg">색상 구성 ({colors.length}색)</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPaletteJson}
            className={buttonClass({ variant: "ghost", size: "sm", className: "h-7 px-2 text-[0.68rem]" })}
            title="JSON 파일로 다운로드"
          >
            <Download className="h-3 w-3 mr-1" aria-hidden="true" />
            JSON 저장
          </button>
        </div>
      </div>

      {/* Harmonized Gradient Bar */}
      <div
        className="h-6 w-full"
        style={{
          background: `linear-gradient(to right, ${colors.join(", ")})`,
        }}
        aria-hidden="true"
      />

      {/* Swatches Grid */}
      <div className="p-4">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {colors.map((color, index) => {
            const isLight = getLuminance(color) > 0.45;
            const isCopied = copiedColor === color;

            return (
              <li key={`${color}-${index}`}>
                <button
                  type="button"
                  onClick={() => void handleCopyColor(color)}
                  aria-label={`${color} 색상 복사`}
                  className="group relative flex w-full flex-col overflow-hidden rounded-lg border border-line text-left transition-transform duration-150 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <div
                    className="relative flex aspect-[4/3] w-full items-center justify-center p-2 transition-opacity group-hover:opacity-95"
                    style={{ backgroundColor: color }}
                  >
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold opacity-0 transition-opacity duration-150 group-hover:opacity-100 ${
                        isLight ? "bg-black/75 text-white" : "bg-white/85 text-black"
                      }`}
                    >
                      {isCopied ? (
                        <>
                          <Check className="h-3 w-3 text-good" aria-hidden="true" />
                          복사됨
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" aria-hidden="true" />
                          복사
                        </>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-line bg-card px-2 py-1.5">
                    <span className="numeral tnum text-[0.68rem] font-semibold text-fg">{color}</span>
                    <span className="text-[0.6rem] text-fg-3">#{index + 1}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-line px-4 py-2 text-[0.68rem] text-fg-3 bg-panel/30 flex items-center justify-between">
        <span>클릭하여 HEX 코드를 복사하거나 스튜디오에서 바로 사용할 수 있습니다.</span>
        {copiedColor ? (
          <span className="font-semibold text-good inline-flex items-center gap-1" aria-live="polite">
            <Check className="h-3 w-3" aria-hidden="true" /> {copiedColor} 복사 완료
          </span>
        ) : null}
      </div>
    </div>
  );
}
