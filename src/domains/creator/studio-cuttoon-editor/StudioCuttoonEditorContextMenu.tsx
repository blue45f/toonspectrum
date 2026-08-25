/* Extracted render tree from StudioCuttoonEditor.
 * Session props are an `any` bag matching the original editor closure. */
// @ts-nocheck
import { StudioCanvasContextMenu } from "../canvas/StudioCanvasContextMenu";
import { preloadStudioBackground3D } from "../studio-background-3d-loader";
import { parseStudio3dTool } from "../studio-background-3d-metadata";
import { isEffectivelyLocked } from "../studio-layers";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

export function StudioCuttoonEditorContextMenu(s: StudioCuttoonEditorViewSession) {
  const {
    activatePrimaryCanvasTool,
    addBubble,
    addPage,
    addText,
    completeSelectedGroupId,
    contextMenu,
    contextMenuBg3dEditSource,
    contextMenuEl,
    duplicateSelected,
    groups,
    marqueeIdsRef,
    patchEl,
    removeSelected,
    reorder,
    saveElementAsEmeresLibraryItem,
    selectedIdRef,
    setBg3dInitialDataUrl,
    setBg3dInitialElementId,
    setBg3dInitialScene,
    setBg3dOpen,
    setContextMenu,
    setPoserInitialDataUrl,
    setPoserInitialElementId,
    setPoserVrmOpen,
    setQuickShapeActive,
    toggleSelectedElementsLocked,
  } = s;
  return (
      <StudioCanvasContextMenu
        open={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        hasElement={contextMenu.elId !== null}
        locked={
          contextMenuEl
            ? isEffectivelyLocked(contextMenuEl, groups)
            : false
        }
        onEditVrm={
          contextMenuEl?.type === "image" &&
          (contextMenuEl.vrmScene || parseStudio3dTool(contextMenuEl.src) === "vrm-poser")
            ? () => {
                setPoserInitialDataUrl(contextMenuEl.src);
                setPoserInitialElementId(contextMenuEl.id);
                setPoserVrmOpen(true);
              }
            : undefined
        }
        onEditBackground3d={
          contextMenuEl?.type === "image" && contextMenuBg3dEditSource
            ? () => {
                setBg3dInitialScene(contextMenuBg3dEditSource.scene);
                setBg3dInitialDataUrl(contextMenuBg3dEditSource.legacyDataUrl);
                setBg3dInitialElementId(contextMenuEl.id);
                setBg3dOpen(true);
              }
            : undefined
        }
        onPreloadBackground3d={preloadStudioBackground3D}
        onSaveAsEmeres={() => {
          if (contextMenu.elId) void saveElementAsEmeresLibraryItem(contextMenu.elId);
        }}
        onDuplicate={duplicateSelected}
        onReorder={reorder}
        onToggleLock={() => {
          if (contextMenuEl) {
            const contextTargetSelected =
              selectedIdRef.current === contextMenuEl.id ||
              marqueeIdsRef.current.includes(contextMenuEl.id);
            if (contextTargetSelected && completeSelectedGroupId()) {
              toggleSelectedElementsLocked();
            } else {
              patchEl(contextMenuEl.id, {
                locked: !isEffectivelyLocked(contextMenuEl, groups),
              });
            }
          }
        }}
        onDelete={removeSelected}
        onSelectPen={() => {
          activatePrimaryCanvasTool("draw", "pen");
        }}
        onAddSpeechBubble={() => addBubble("speech")}
        onAddText={() => addText()}
        onAddPage={addPage}
        onEnableQuickShape={() => {
          activatePrimaryCanvasTool("draw", "pen");
          setQuickShapeActive(true);
        }}
        onClose={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
      />
  );
}
