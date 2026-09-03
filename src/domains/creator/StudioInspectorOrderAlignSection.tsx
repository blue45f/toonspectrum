import {
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalJustifyCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalJustifyCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  Boxes,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Sparkles,
  Trash2,
} from "lucide-react";

import { preloadStudioBackground3D } from "./studio-background-3d-loader";
import { parseStudio3dTool } from "./studio-background-3d-metadata";
import { StudioInspectorSection } from "./StudioInspectorSection";

import type { StudioBg3dSceneDocument } from "./bg3d/studio-bg3d-scene-document";
import type { El } from "./studio-element-model";

import { buttonClass } from "@/components/ui/button-utils";

interface StudioInspectorOrderAlignSectionProps {
  selected: El;
  selectedBg3dEditSource: { readonly scene?: StudioBg3dSceneDocument; readonly legacyDataUrl?: string } | null;
  patchEl: (id: string, patch: Partial<El>) => void;
  reorder: (dir: "front" | "back" | "forward" | "backward") => void;
  alignSelected: (mode: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom" | "distributeH" | "distributeV") => void;
  duplicateSelected: () => void;
  removeSelected: () => void;
  setPoserInitialDataUrl: (url: string | undefined) => void;
  setPoserInitialElementId: (id: string | undefined) => void;
  setPoserVrmOpen: (open: boolean) => void;
  setBg3dInitialScene: (scene: StudioBg3dSceneDocument | undefined) => void;
  setBg3dInitialDataUrl: (url: string | undefined) => void;
  setBg3dInitialElementId: (id: string | undefined) => void;
  setBg3dOpen: (open: boolean) => void;
}

export function StudioInspectorOrderAlignSection({
  selected,
  selectedBg3dEditSource,
  patchEl,
  reorder,
  alignSelected,
  duplicateSelected,
  removeSelected,
  setPoserInitialDataUrl,
  setPoserInitialElementId,
  setPoserVrmOpen,
  setBg3dInitialScene,
  setBg3dInitialDataUrl,
  setBg3dInitialElementId,
  setBg3dOpen,
}: StudioInspectorOrderAlignSectionProps) {
  return (
    <>
      <StudioInspectorSection sectionId="element.order-align" loadingLabel="정렬·순서를 여는 중...">
        <div className="flex flex-wrap gap-1.5">
          {selected.type === "image" && (
            <>
              {(selected.vrmScene || parseStudio3dTool(selected.src) === "vrm-poser") && (
                <button
                  type="button"
                  onClick={() => {
                    setPoserInitialDataUrl(selected.src);
                    setPoserInitialElementId(selected.id);
                    setPoserVrmOpen(true);
                  }}
                  className={buttonClass({ size: "sm", variant: "solid", className: "gap-1 font-semibold" })}
                  title="3D 캐릭터 재편집"
                >
                  <Sparkles size={14} /> 3D 재편집
                </button>
              )}
              {selectedBg3dEditSource && (
                <button
                  type="button"
                  onClick={() => {
                    setBg3dInitialScene(selectedBg3dEditSource.scene);
                    setBg3dInitialDataUrl(selectedBg3dEditSource.legacyDataUrl);
                    setBg3dInitialElementId(selected.id);
                    setBg3dOpen(true);
                  }}
                  onPointerEnter={preloadStudioBackground3D}
                  onPointerDown={preloadStudioBackground3D}
                  onFocus={preloadStudioBackground3D}
                  className={buttonClass({ size: "sm", variant: "solid", className: "gap-1 font-semibold" })}
                  title="3D 배경 재편집"
                >
                  <Boxes size={14} /> 배경 재편집
                </button>
              )}
              <button
                type="button"
                onClick={() => patchEl(selected.id, { flipped: !selected.flipped } as Partial<El>)}
                className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })}
                title="좌우 반전"
              >
                <FlipHorizontal2 size={14} />
              </button>
              <button
                type="button"
                onClick={() => patchEl(selected.id, { flippedY: !selected.flippedY } as Partial<El>)}
                className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })}
                title="상하 반전"
              >
                <FlipVertical2 size={14} />
              </button>
            </>
          )}
          <button type="button" onClick={() => reorder("front")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="맨 앞으로">
            <ArrowUpToLine size={14} />
          </button>
          <button type="button" onClick={() => reorder("back")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="맨 뒤로">
            <ArrowDownToLine size={14} />
          </button>
          <button type="button" onClick={() => alignSelected("left")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="왼쪽 정렬">
            <AlignStartVertical size={14} />
          </button>
          <button type="button" onClick={() => alignSelected("hcenter")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="가로 가운데 정렬">
            <AlignHorizontalJustifyCenter size={14} />
          </button>
          <button type="button" onClick={() => alignSelected("right")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="오른쪽 정렬">
            <AlignEndVertical size={14} />
          </button>
          <button type="button" onClick={() => alignSelected("top")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="위쪽 정렬">
            <AlignStartHorizontal size={14} />
          </button>
          <button type="button" onClick={() => alignSelected("vcenter")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="세로 가운데 정렬">
            <AlignVerticalJustifyCenter size={14} />
          </button>
          <button type="button" onClick={() => alignSelected("bottom")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="아래쪽 정렬">
            <AlignEndHorizontal size={14} />
          </button>
          <button type="button" onClick={() => alignSelected("distributeH")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="가로 등간격 분포 (CSP 2.0)">
            <AlignHorizontalJustifyCenter size={14} className="rotate-90" />
          </button>
          <button type="button" onClick={() => alignSelected("distributeV")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="세로 등간격 분포 (CSP 2.0)">
            <AlignVerticalJustifyCenter size={14} className="rotate-90" />
          </button>
        </div>
      </StudioInspectorSection>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button type="button" onClick={duplicateSelected} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="복제 (⌘J)">
          <Copy size={14} />
        </button>
        <button type="button" onClick={removeSelected} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1 text-bad" })} title="삭제 (Delete)">
          <Trash2 size={14} /> 삭제
        </button>
      </div>
    </>
  );
}
