import { LayoutTemplate } from "lucide-react";

import type { TemplatePreviewData } from "../models/market-preview";

interface MarketTemplatePreviewProps {
  readonly template: TemplatePreviewData;
  className?: string;
}

export function MarketTemplatePreview({ template, className }: MarketTemplatePreviewProps) {
  // Infer panel layout configuration based on templateId
  const isScroll = template.templateId.includes("scroll") || template.templateId.includes("vertical") || template.templateId.includes("webtoon");
  const is4Cut = template.templateId.includes("4cut") || template.templateId.includes("4-cut") || template.templateId.includes("yonkoma");

  return (
    <div className={`overflow-hidden rounded-xl border border-line bg-card ${className ?? ""}`}>
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5 bg-panel/50">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="h-4 w-4 text-accent" aria-hidden="true" />
          <h3 id="market-template-heading" className="text-xs font-semibold text-fg">템플릿 레이아웃 구조</h3>
        </div>
        <span className="rounded bg-raised px-2 py-0.5 text-[0.65rem] text-fg-3">
          ID: {template.templateId}
        </span>
      </div>

      <div className="flex items-center justify-center p-6 bg-canvas/40">
        <div className="relative w-full max-w-[280px] rounded-lg border-2 border-dashed border-accent/40 bg-panel/80 p-3 shadow-inner">
          <div className="mb-2 flex items-center justify-between text-[0.62rem] text-fg-3">
            <span>웹툰 캔버스 규격 (690x1000+)</span>
            <span className="font-semibold text-accent">{is4Cut ? "4컷 연출" : isScroll ? "스크롤 배치" : "표준 컷 분할"}</span>
          </div>

          {is4Cut ? (
            <div className="grid grid-cols-1 gap-2.5">
              {[1, 2, 3, 4].map((cut) => (
                <div
                  key={cut}
                  className="flex h-14 items-center justify-center rounded border border-line bg-card/90 text-xs font-bold text-fg-2 shadow-sm transition-colors hover:border-accent hover:text-accent"
                >
                  컷 #{cut}
                </div>
              ))}
            </div>
          ) : isScroll ? (
            <div className="space-y-3">
              <div className="flex h-20 items-center justify-center rounded border border-line bg-card/90 text-xs font-bold text-fg-2 shadow-sm">
                도입부 와이드 컷
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex h-16 items-center justify-center rounded border border-line bg-card/90 text-[0.68rem] font-bold text-fg-2 shadow-sm">
                  클로즈업 A
                </div>
                <div className="flex h-16 items-center justify-center rounded border border-line bg-card/90 text-[0.68rem] font-bold text-fg-2 shadow-sm">
                  반응 컷 B
                </div>
              </div>
              <div className="flex h-24 items-center justify-center rounded border border-line bg-card/90 text-xs font-bold text-fg-2 shadow-sm">
                메인 액션 롱 컷
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex h-16 items-center justify-center rounded border border-line bg-card/90 text-xs font-bold text-fg-2 shadow-sm">
                상단 패널
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <div className="flex h-14 items-center justify-center rounded border border-line bg-card/90 text-[0.65rem] font-bold text-fg-2 shadow-sm">
                  1
                </div>
                <div className="flex h-14 items-center justify-center rounded border border-line bg-card/90 text-[0.65rem] font-bold text-fg-2 shadow-sm">
                  2
                </div>
                <div className="flex h-14 items-center justify-center rounded border border-line bg-card/90 text-[0.65rem] font-bold text-fg-2 shadow-sm">
                  3
                </div>
              </div>
              <div className="flex h-20 items-center justify-center rounded border border-line bg-card/90 text-xs font-bold text-fg-2 shadow-sm">
                하단 강조 패널
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-line px-4 py-2 text-[0.68rem] text-fg-3 bg-panel/30 flex items-center justify-between">
        <span>스튜디오 캔버스에서 1클릭으로 해당 컷 가이드와 여백을 자동 설정합니다.</span>
      </div>
    </div>
  );
}
