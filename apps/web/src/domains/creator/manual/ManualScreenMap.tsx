import {
  Box,
  Brush,
  Camera,
  Download,
  Eraser,
  Eye,
  ImageIcon,
  Info,
  MousePointer2,
  Move3d,
  PaintBucket,
  Play,
  Rotate3d,
  Scaling,
  SendHorizontal,
  Sparkles,
  Type,
  type LucideIcon,
} from "lucide-react";
import { useId, type CSSProperties } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  MANUAL_SURFACES,
  manualRegionCopy,
  manualRegionNumber,
  manualSurfaceRegions,
  type ManualScreen,
  type ManualSurface,
} from "./manual-screen-map";

/** 영역 안에 그리는 작은 화면 요소. 모두 장식이며, 뜻은 범례(figcaption)가 전달한다. */
type RegionArt =
  | { readonly kind: "icons"; readonly icons: readonly LucideIcon[]; readonly direction: "row" | "column" }
  | { readonly kind: "lines"; readonly count: number }
  | { readonly kind: "thumbs"; readonly count: number }
  | { readonly kind: "panels" }
  | { readonly kind: "figure" }
  | { readonly kind: "input" }
  | { readonly kind: "chips"; readonly count: number };

const REGION_ART: Readonly<Record<string, RegionArt>> = {
  "editor:topbar": { kind: "chips", count: 3 },
  "editor:tools": { kind: "icons", icons: [Brush, Eraser, MousePointer2, PaintBucket, Type], direction: "column" },
  "editor:canvas": { kind: "panels" },
  "editor:panel": { kind: "lines", count: 4 },
  "editor:pages": { kind: "thumbs", count: 6 },
  "three:library": { kind: "lines", count: 4 },
  "three:gizmo": { kind: "icons", icons: [MousePointer2, Move3d, Rotate3d, Scaling, Camera], direction: "column" },
  "three:viewport": { kind: "figure" },
  "three:inspector": { kind: "chips", count: 4 },
  "three:poses": { kind: "thumbs", count: 5 },
  "ai:director": { kind: "icons", icons: [Sparkles], direction: "row" },
  "ai:suggestions": { kind: "lines", count: 4 },
  "ai:request": { kind: "input" },
  "ai:answer": { kind: "lines", count: 2 },
  "music:mode": { kind: "chips", count: 2 },
  "music:presets": { kind: "chips", count: 3 },
  "music:brief": { kind: "lines", count: 3 },
  "music:library": { kind: "icons", icons: [Play, Play, Play], direction: "column" },
  "toolchain:connection": { kind: "input" },
  "toolchain:tools": { kind: "lines", count: 4 },
  "toolchain:queue": { kind: "lines", count: 3 },
  "toolchain:results": { kind: "icons", icons: [Download, Download], direction: "row" },
  "publish:manuscript": { kind: "thumbs", count: 3 },
  "publish:distribution": { kind: "chips", count: 3 },
  "publish:preview": { kind: "icons", icons: [Eye, ImageIcon], direction: "row" },
  "publish:result": { kind: "icons", icons: [SendHorizontal, Box], direction: "row" },
};

function RegionArtView({ art }: { readonly art: RegionArt | undefined }) {
  if (!art) return null;
  switch (art.kind) {
    case "icons":
      return (
        <span className="manual-screen-icons" data-direction={art.direction}>
          {art.icons.map((Icon, index) => <Icon key={index} size={12} />)}
        </span>
      );
    case "lines":
      return (
        <span className="manual-screen-lines">
          {Array.from({ length: art.count }, (_, index) => <span key={index} />)}
        </span>
      );
    case "thumbs":
      return (
        <span className="manual-screen-thumbs">
          {Array.from({ length: art.count }, (_, index) => <span key={index} />)}
        </span>
      );
    case "chips":
      return (
        <span className="manual-screen-chips">
          {Array.from({ length: art.count }, (_, index) => <span key={index} />)}
        </span>
      );
    case "panels":
      return (
        <span className="manual-screen-panels">
          <span />
          <span />
          <span className="manual-screen-balloon" />
        </span>
      );
    case "figure":
      return <span className="manual-screen-figure" />;
    case "input":
      return (
        <span className="manual-screen-input">
          <span />
          <SendHorizontal size={11} />
        </span>
      );
  }
}

function gridStyle(surface: ManualSurface): CSSProperties {
  const info = MANUAL_SURFACES[surface];
  return {
    gridTemplateAreas: info.areas.map((row) => `"${row}"`).join(" "),
    gridTemplateColumns: info.columns,
    gridTemplateRows: info.rows,
  };
}

/**
 * "화면에서 찾기" — 문서가 다루는 작업 공간의 영역 배치를 단순화해 그리고, 단계가 일어나는 영역에 번호를 붙인다.
 * 실제 캡처가 아니라는 점을 캡션으로 밝힌다. 번호는 단계 목록의 위치 표시와 같다.
 */
export function ManualScreenMap({ screen }: { readonly screen: ManualScreen }) {
  const bt = useBilingual("StudioManualPage.screen");
  const titleId = useId();
  const surface = MANUAL_SURFACES[screen.surface];
  const regions = manualSurfaceRegions(screen.surface);

  return (
    <figure className="manual-screen" aria-labelledby={titleId}>
      <div className="manual-screen-frame" aria-hidden="true">
        <div className="manual-screen-chrome">
          <span /><span /><span />
          <strong>{bt(surface.title.ko, surface.title.en)}</strong>
        </div>
        <div className="manual-screen-grid" style={gridStyle(screen.surface)}>
          {regions.map((region) => {
            const number = manualRegionNumber(screen, region);
            const copy = manualRegionCopy(screen, region);
            return (
              <div
                key={region}
                className="manual-screen-region"
                data-focus={number ? "true" : undefined}
                style={{ gridArea: region }}
              >
                <RegionArtView art={REGION_ART[`${screen.surface}:${region}`]} />
                {number ? <span className="manual-screen-badge">{number}</span> : null}
                {copy ? <span className="manual-screen-region-name">{bt(copy.name.ko, copy.name.en)}</span> : null}
              </div>
            );
          })}
        </div>
      </div>
      <figcaption>
        <p id={titleId} className="manual-screen-title">
          {bt(`화면에서 찾기 · ${surface.title.ko}`, `Find it on screen · ${surface.title.en}`)}
        </p>
        <ol className="manual-screen-legend">
          {screen.focus.map((region, index) => {
            const copy = manualRegionCopy(screen, region);
            if (!copy) return null;
            return (
              <li key={region}>
                <span className="manual-screen-badge" aria-hidden="true">{index + 1}</span>
                <span>
                  <strong>{bt(copy.name.ko, copy.name.en)}</strong>
                  <span>{bt(copy.hint.ko, copy.hint.en)}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <p className="manual-screen-note">
          <Info size={14} aria-hidden="true" />
          {bt(
            "실제 화면을 단순화한 위치 도식이에요. 번호는 아래 단계에 붙은 위치 번호와 같아요.",
            "A simplified map of the real screen. Numbers match the location tags on the steps below.",
          )}
        </p>
      </figcaption>
    </figure>
  );
}
