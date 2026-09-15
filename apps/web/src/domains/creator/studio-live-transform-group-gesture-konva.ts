/**
 * Konva renderer adapter for a MULTI-SELECTION draw transform.
 *
 * The preferred lane is a commit-equivalent model draft. Group resize preserves authored stroke
 * width, so scaling the existing wrappers would thicken the ink during the gesture and snap it
 * thin again at pointer-up. The exact lane therefore runs the same selection planner the durable
 * commit will use and publishes the resulting draw elements on the isolated transform Layer.
 *
 * Exact presentation remains atomic across the selection: every member is admitted, published and
 * hidden together. A partial exact draft would tear the selection apart. What changed is the
 * failure mode. Work budgets, unsupported brush topology, cached composition or authored paint
 * above the selection now degrade the whole gesture to one bounded centre-line guide instead of
 * restoring a motionless source under moving handles. The guide samples once at gesture start,
 * applies one matrix per frame and leaves the dimmed authored wrappers in their original stacking
 * context. Once degraded, the gesture stays in that mode until release, eliminating threshold
 * flicker when the user reverses an enlargement.
 *
 * Pointer-up is still the only document/history/CRDT mutation. A successful exact terminal frame
 * may hand its pixels across the authoritative receipt; a guide frame is always cleared before the
 * durable commit and never claims to reproduce blend, eraser or renderer-specific brush texture.
 */

import { flushSync } from "react-dom";

import {
  studioDrawHasEffectivePerSampleOrientation,
  studioDrawObjectTransformScale,
  studioDrawShapeIsBoundsDerived,
} from "./brush/studio-draw-object-transform";
import { studioKonvaRuntime } from "./render/studio-konva-runtime";
import { planStudioGroupUniformResizeSelection } from "./studio-group-uniform-resize";
import { studioLiveTransformCommittedClip } from "./studio-live-transform-clip-tracking";
import {
  admitStudioLiveTransformDrawCompilation,
  compileStudioLiveTransformDrawSnapshot,
} from "./studio-live-transform-draw-compiler";
import {
  STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS,
  STUDIO_LIVE_TRANSFORM_EXACT_MAX_SCENE_ELEMENTS,
  STUDIO_LIVE_TRANSFORM_EXACT_MAX_SELECTION_MEMBERS,
  STUDIO_LIVE_TRANSFORM_EXACT_MAX_SELECTION_WORK,
  admitStudioLiveTransformExactDraft,
} from "./studio-live-transform-exact-draft-admission";
import { studioKonvaDrawTransformIsBusy } from "./studio-live-transform-gesture-konva";
import { studioLiveTransformPreviewBlockedForElement } from "./studio-live-transform-preview-eligibility";
import {
  studioLiveTransformPreviewEligible,
  studioLiveTransformPreviewHasCachedDuplicate,
} from "./studio-live-transform-preview-konva";
import { createStudioLiveTransformPreviewSession } from "./studio-live-transform-preview-session";
import {
  createStudioLiveTransformWireframeFallback,
  STUDIO_LIVE_TRANSFORM_WIREFRAME_MAX_MEMBERS,
} from "./studio-live-transform-wireframe-fallback-konva";
import {
  STUDIO_DRAW_SELECTION_INDICATOR_NAME,
  STUDIO_GROUP_SELECTION_OVERLAY_NAME,
  drainStudioLateParkedChrome,
  STUDIO_LIVE_TRANSFORM_PREVIEW_ACTIVE_ATTR,
  findStudioDrawWrapperNode,
} from "./studio-selection-chrome-mirror";
import {
  beginStudioSingleDrawTransformChromeLayer,
  restoreStudioSingleObjectDragLayer,
  studioLiveTransformGroupStackingIsolatable,
} from "./studio-single-object-drag-layer";

import type { DrawEl, El } from "./studio-element-model";
import type { StudioGroupUniformResizeBounds } from "./studio-group-uniform-resize";
import type {
  StudioLiveCanvasGestureTransientAdapter,
  StudioLiveSelectionTransformFrame,
} from "./studio-live-canvas-gesture";
import type {
  StudioLiveTransformDraftClaim,
  StudioLiveTransformDraftEntry,
  StudioLiveTransformDraftStore,
} from "./studio-live-transform-draft-store";
import type { StudioLiveTransformDrawSnapshot } from "./studio-live-transform-draw-compiler";
import type { StudioLiveTransformPreviewScheduler } from "./studio-live-transform-preview-session";
import type { StudioLiveTransformWireframeFallback } from "./studio-live-transform-wireframe-fallback-konva";
import type { StudioSingleObjectDragLayerSession } from "./studio-single-object-drag-layer";
import type Konva from "konva";

export interface BeginStudioKonvaGroupDrawTransformGestureOptions {
  readonly preview: {
    readonly scope: string;
    /** The selected elements, in the order the commit will republish them. */
    readonly selection: readonly El[];
    /** The whole page composition, for clip resolution and scene budgeting. */
    readonly elements: readonly El[];
    readonly dragLayer: Konva.Layer | null;
    readonly draftStore?: StudioLiveTransformDraftStore;
    readonly scheduler?: StudioLiveTransformPreviewScheduler;
    readonly isLocked: (element: El) => boolean;
    readonly flushDraftPublication?: (mutation: () => void) => void;
  };
  readonly sourceBounds: StudioGroupUniformResizeBounds;
  readonly stage: Konva.Stage;
  readonly proxy: Konva.Rect;
  readonly transformer: Konva.Transformer;
  readonly onError?: (error: unknown) => void;
  readonly onFatalError?: (error: unknown) => void;
}

interface StudioGroupTransformMember {
  readonly element: DrawEl;
  readonly node: Konva.Node;
  readonly snapshot: StudioLiveTransformDrawSnapshot | null;
  /**
   * This member's OWN box, padded by the radius its renderer can paint outside the centre line.
   *
   * Work admission is a per-element gate, so it has to be asked about a per-element box. Handing
   * it the whole selection box instead makes its footprint term a per-frame constant, and summing
   * that across members multiplies one union by N -- which refused three ordinary 12px brush
   * strokes over a 400x400 box outright. The padding also keeps the box non-degenerate: a
   * perfectly horizontal stroke spans zero height, and a zero-extent box has no derivable scale.
   */
  readonly paintBounds: StudioGroupUniformResizeBounds | null;
}

function drawPointBounds(points: readonly number[]): {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
} | null {
  if (points.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = 0; index + 1 < points.length; index += 2) {
    const x = points[index]!;
    const y = points[index + 1]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * One member's box carried through the selection's own uniform frame.
 *
 * Deliberately ignores the gesture angle: work admission reads only `width`/`height` from this
 * box -- the ribbon and generic lanes turn them into `hypot(w, h)`, the causal-ink lane into a
 * scale factor -- and a rotation leaves both alone, so turning the box would move numbers nothing
 * downstream consults.
 */
function mapBoundsThroughFrame(
  bounds: StudioGroupUniformResizeBounds,
  sourceBounds: StudioGroupUniformResizeBounds,
  targetBounds: StudioGroupUniformResizeBounds,
  scale: number,
): StudioGroupUniformResizeBounds {
  return {
    x: targetBounds.x + (bounds.x - sourceBounds.x) * scale,
    y: targetBounds.y + (bounds.y - sourceBounds.y) * scale,
    width: bounds.width * scale,
    height: bounds.height * scale,
  };
}

function studioLiveTransformRasterMetrics(
  stage: Konva.Stage,
  layer: Konva.Layer | null,
): { readonly rasterScale: number; readonly sceneCanvasBackingPixels: number } {
  const stageScale = Math.max(Math.abs(stage.scaleX()), Math.abs(stage.scaleY()));
  const sceneCanvas = layer?.getCanvas();
  const nativeSceneCanvas = layer?.getNativeCanvasElement();
  const pixelRatio = sceneCanvas?.getPixelRatio() ?? studioKonvaRuntime.pixelRatio;
  return {
    rasterScale: stageScale * pixelRatio,
    sceneCanvasBackingPixels: nativeSceneCanvas
      ? nativeSceneCanvas.width * nativeSceneCanvas.height
      : Number.NaN,
  };
}

/**
 * Claims a whole valid multi-selection and chooses exact or bounded-guide presentation.
 */
export function beginStudioKonvaGroupDrawTransformGesture(
  options: BeginStudioKonvaGroupDrawTransformGestureOptions,
): StudioLiveCanvasGestureTransientAdapter<StudioLiveSelectionTransformFrame> | null {
  const { selection, elements, dragLayer } = options.preview;
  if (
    selection.length < 2
    || selection.length > STUDIO_LIVE_TRANSFORM_WIREFRAME_MAX_MEMBERS
  ) {
    return null;
  }
  // These ceilings decide whether the exact React/Konva draft is affordable. They no longer decide
  // whether the gesture gets visual feedback at all: an over-budget selection takes the bounded
  // wireframe lane instead of making the ink appear to freeze under moving handles.
  let exactPreviewEligible =
    selection.length <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_SELECTION_MEMBERS
    && elements.length <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_SCENE_ELEMENTS;
  const selectedIdSet = new Set(selection.map((element) => element.id));
  if (selectedIdSet.size !== selection.length) return null;
  // Members are taken in DOCUMENT order, never the caller's selection order.
  //
  // `StudioLiveTransformDraftNode` paints the entries as Konva children in the order it receives
  // them, so member order IS the exact draft's stacking. The fallback keeps this order too, while
  // leaving authored wrappers in their original parents as dimmed composition context.
  const orderedSelection = elements.filter((element) => selectedIdSet.has(element.id));
  if (orderedSelection.length !== selection.length) return null;

  const members: StudioGroupTransformMember[] = [];
  for (const element of orderedSelection) {
    if (element.type !== "draw") return null;
    const draw = element as DrawEl & El;
    if (options.preview.isLocked(element)) return null;
    const node = findStudioDrawWrapperNode(options.stage, element.id);
    if (
      !node
      // A member still being dragged by another pointer, or one whose previous gesture's Layer
      // cleanup has not finished, already has a writer on its wrapper. Even a guide must not race
      // that writer's source styling or terminal receipt.
      || studioKonvaDrawTransformIsBusy(options.stage, element.id, node)
    ) {
      return null;
    }

    let snapshot: StudioLiveTransformDrawSnapshot | null = null;
    let paintBounds: StudioGroupUniformResizeBounds | null = null;
    if (exactPreviewEligible) {
      const compilation = admitStudioLiveTransformDrawCompilation(draw, elements.length);
      if (
        studioLiveTransformPreviewBlockedForElement(
          element,
          studioDrawShapeIsBoundsDerived(draw.kind),
        )
        || !studioLiveTransformPreviewEligible(node)
        || studioLiveTransformPreviewHasCachedDuplicate(options.stage, element.id, node)
        || !compilation.admitted
        || studioDrawHasEffectivePerSampleOrientation(draw)
      ) {
        exactPreviewEligible = false;
      } else {
        snapshot = compileStudioLiveTransformDrawSnapshot(draw);
        const bounds = drawPointBounds(draw.points);
        if (!bounds) {
          exactPreviewEligible = false;
          snapshot = null;
        } else {
          const complexity = snapshot.exactDraftComplexity;
          const paintRadius = Math.max(
            0.5,
            complexity.rendererMaxPaintRadius
              ?? complexity.causalMaxDabRadius
              ?? draw.strokeWidth / 2,
          );
          paintBounds = {
            x: bounds.x - paintRadius,
            y: bounds.y - paintRadius,
            width: bounds.w + paintRadius * 2,
            height: bounds.h + paintRadius * 2,
          };
        }
      }
    }
    members.push({ element: draw, node, snapshot, paintBounds });
  }
  const selectedIds = members.map((member) => member.element.id);
  const mainLayer = members[0]!.node.getLayer();
  if (!mainLayer || !dragLayer || mainLayer === dragLayer) return null;
  // Bound after the guard because `restoreSources` below is a hoisted `function` declaration, and
  // TypeScript resets a const's narrowing for those -- they are callable before the guard runs.
  const draftLayer: Konva.Layer = dragLayer;

  let parkedIndicators: Konva.Node[] = [];
  let chromeLift: StudioSingleObjectDragLayerSession | null = null;
  let previewSession: ReturnType<typeof createStudioLiveTransformPreviewSession> | null = null;
  let fallbackPreview: StudioLiveTransformWireframeFallback | null = null;
  let draftClaim: StudioLiveTransformDraftClaim | null = null;
  let terminalDraft: readonly DrawEl[] | null = null;
  let presentationMode: "exact" | "fallback" = exactPreviewEligible ? "exact" : "fallback";
  let handoffRegistered = false;
  let handoffReleaseRequested = false;
  let handoffSourceRestored = false;
  /**
   * The members currently hidden for the draft, each mapped to the visibility it owes back.
   *
   * Membership IS the state -- there is deliberately no parallel "are they hidden" flag. A flag
   * has to be written either side of the loop and both choices are wrong: written after, a throw
   * part-way leaves members hidden while the flag says otherwise and the next call no-ops; written
   * before, the same thing happens in the RESTORE direction, which is the one that must never fail
   * silently. Per-member entries make both directions idempotent and resumable, so a retry after a
   * partial failure picks up exactly the members still owed.
   */
  const sourceVisibility = new Map<Konva.Node, boolean>();
  let closeState: "open" | "closing" | "closed" = "open";
  let closeOutcome: Parameters<
    StudioLiveCanvasGestureTransientAdapter<StudioLiveSelectionTransformFrame>["close"]
  >[0] | null = null;
  let terminalFramePrepared = false;

  const flushDraftPublication = options.preview.flushDraftPublication ?? flushSync;

  /**
   * Hide or restore every source wrapper at once, repainting the document Layer only when the
   * hidden state actually flips.
   *
   * The single-element lane lifts its source into the isolated Layer and can therefore repaint
   * cheaply every frame. A whole selection is not liftable without reordering the document, so
   * this lane leaves the sources in place and pays one main-Layer raster on the way in and one on
   * the way out; the per-frame cost stays confined to the isolated draft Layer.
   */
  const setSourcesHidden = (hidden: boolean): void => {
    const autoDrawEnabled = studioKonvaRuntime.autoDrawEnabled;
    const failures: unknown[] = [];
    let mutated = false;
    try {
      studioKonvaRuntime.autoDrawEnabled = false;
      for (const member of members) {
        // A member already in the wanted state is skipped individually, so one throwing node never
        // decides anything for its neighbours and a retry resumes on exactly what is still owed.
        if (sourceVisibility.has(member.node) === hidden) continue;
        try {
          if (hidden) {
            sourceVisibility.set(member.node, member.node.visible());
            member.node.visible(false);
          } else {
            member.node.visible(sourceVisibility.get(member.node) ?? true);
            sourceVisibility.delete(member.node);
          }
          mutated = true;
        } catch (error) {
          failures.push(error);
        }
      }
    } finally {
      studioKonvaRuntime.autoDrawEnabled = autoDrawEnabled;
    }
    if (!mutated && failures.length === 0) return;
    try {
      mainLayer.drawScene();
    } catch (error) {
      failures.push(error);
    }
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `Failed to ${hidden ? "hide" : "restore"} every group live-transform source`,
      );
    }
  };

  const frameAdmitted = (frame: StudioLiveSelectionTransformFrame): boolean => {
    if (!exactPreviewEligible) return false;
    const rasterMetrics = studioLiveTransformRasterMetrics(options.stage, dragLayer);
    const frameScale = studioDrawObjectTransformScale(options.sourceBounds, frame.targetBounds);
    if (!frameScale || !frameScale.uniform) return false;
    let totalWork = 0;
    let totalBackingPixels = 0;
    for (const member of members) {
      const snapshot = member.snapshot;
      const paintBounds = member.paintBounds;
      if (!snapshot || !paintBounds) return false;
      // Each member is graded on its OWN box mapped through this frame, not on the selection box.
      // The scale is identical either way -- the group planner applies one uniform factor to every
      // member -- so the sample and path-length terms are unchanged, while the footprint term
      // becomes the member's own fill instead of a copy of the union.
      const memberTarget = mapBoundsThroughFrame(
        paintBounds,
        options.sourceBounds,
        frame.targetBounds,
        frameScale.uniformEquivalent,
      );
      const decision = admitStudioLiveTransformExactDraft({
        complexity: snapshot.exactDraftComplexity,
        sourceBounds: paintBounds,
        targetBounds: memberTarget,
        sceneElementCount: elements.length,
        rasterScale: rasterMetrics.rasterScale,
        sceneCanvasBackingPixels: rasterMetrics.sceneCanvasBackingPixels,
        // The commit this frame previews preserves stroke width, so the charge must not shrink
        // with the box; see the field's own note.
        strokeWidthPolicy: "preserve",
      });
      if (!decision.admitted) return false;
      totalWork += decision.estimatedWork;
      totalBackingPixels += decision.estimatedBackingPixels;
    }
    // Per-member admission bounds one stroke; the frame draws all of them in one main-thread pass,
    // so the SUM has to fit the same UI-thread path-operation ceiling a single stroke gets.
    // Operation count and shaded area are independent dimensions and a frame pays both. Counting
    // alone would admit sixty two-point dots at a 500px width -- two dabs of work each, ninety
    // million shaded pixels between them -- because every per-element ceiling sees only its own
    // member. Charging the summed area against the same whole-frame ceiling one stroke gets closes
    // that: the selection may shade what a single admitted stroke may shade, and no more.
    return totalWork <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_SELECTION_WORK
      && totalBackingPixels <= STUDIO_LIVE_TRANSFORM_EXACT_MAX_BACKING_PIXELS;
  };

  const exactPresentation = (
    frame: StudioLiveSelectionTransformFrame,
  ): readonly DrawEl[] | null => {
    if (!draftClaim) return null;
    if (!Number.isFinite(frame.rotationDeg) || !frameAdmitted(frame)) {
      restoreSources();
      return null;
    }
    // The planner is asked for the angle too, and it is the authority on whether the selection can
    // take one: a member that cannot carry an angle makes it return null, and this frame then
    // hands the whole selection to the bounded guide like any other exact-lane refusal.
    const planned = planStudioGroupUniformResizeSelection({
      items: elements,
      selectedIds,
      sourceBounds: options.sourceBounds,
      targetBounds: frame.targetBounds,
      rotationDeg: frame.rotationDeg,
      isLocked: options.preview.isLocked,
    });
    if (!planned || planned.length !== members.length) {
      restoreSources();
      return null;
    }
    // The planner returns its selection in DOCUMENT order; the claim owns the caller's selection
    // order. Re-key by id rather than assuming the two agree -- a mismatch would otherwise refuse
    // every frame of an otherwise perfectly eligible gesture.
    const plannedById = new Map(planned.map((element) => [element.id, element]));
    const entries: StudioLiveTransformDraftEntry[] = [];
    for (const member of members) {
      const element = plannedById.get(member.element.id);
      const snapshot = member.snapshot;
      if (element?.type !== "draw" || !snapshot) {
        restoreSources();
        return null;
      }
      const transformedBounds = drawPointBounds(element.points);
      entries.push({
        element,
        clip: studioLiveTransformCommittedClip({
          targetBounds: frame.targetBounds,
          rotationDeg: frame.rotationDeg,
          elements,
          ...(transformedBounds ? { transformedBounds } : {}),
          ...(snapshot.noClip !== undefined ? { noClip: snapshot.noClip } : {}),
        }),
      });
    }
    const drafted = entries.map((entry) => entry.element);
    let published = false;
    const autoDrawEnabled = studioKonvaRuntime.autoDrawEnabled;
    try {
      studioKonvaRuntime.autoDrawEnabled = false;
      flushDraftPublication(() => {
        draftClaim?.present(entries);
      });
      // A subscriber may synchronously supersede this generation while the publication barrier is
      // open. Never hide the sources unless this exact publication is still the store authority.
      const publishedSnapshot = options.preview.draftStore?.getSnapshot();
      if (
        publishedSnapshot?.scope === options.preview.scope
        && publishedSnapshot.entries.length === entries.length
        && publishedSnapshot.entries.every((entry, index) => entry.element === drafted[index])
      ) {
        setSourcesHidden(true);
        terminalDraft = drafted;
        published = true;
      }
    } finally {
      studioKonvaRuntime.autoDrawEnabled = autoDrawEnabled;
    }
    if (!published) {
      restoreSources();
      return null;
    }
    draftLayer.drawScene();
    return drafted;
  };

  /**
   * Prefer commit-equivalent pixels while they fit. The first exact refusal permanently degrades
   * this gesture to the bounded wireframe so crossing a work threshold cannot make the ink blink
   * off and back on as the user reverses direction.
   */
  const presentFrame = (frame: StudioLiveSelectionTransformFrame): boolean => {
    if (presentationMode === "exact") {
      if (exactPresentation(frame) !== null) return true;
      presentationMode = "fallback";
    }
    return fallbackPreview?.present(frame) ?? false;
  };

  /** Give the document its pixels back and surrender any presented draft. */
  function restoreSources(mode: "clear" | "release" = "clear"): void {
    const autoDrawEnabled = studioKonvaRuntime.autoDrawEnabled;
    try {
      studioKonvaRuntime.autoDrawEnabled = false;
      setSourcesHidden(false);
      const draftWasPresented = draftClaim?.hasPresentation() === true;
      if (draftClaim && (mode === "release" || draftWasPresented)) {
        let claimReceipt: boolean | null = null;
        flushDraftPublication(() => {
          claimReceipt = mode === "release"
            ? draftClaim?.release() ?? false
            : draftClaim?.clear() ?? false;
        });
        if (claimReceipt !== true && !draftClaim.isReleased()) {
          throw new Error(`Failed to ${mode} the group live-transform draft claim`);
        }
        if (draftWasPresented) draftLayer.drawScene();
      }
      terminalDraft = null;
    } finally {
      studioKonvaRuntime.autoDrawEnabled = autoDrawEnabled;
    }
  }

  const paintSourceReceiptSynchronously = (): void => {
    const autoDrawEnabled = studioKonvaRuntime.autoDrawEnabled;
    try {
      studioKonvaRuntime.autoDrawEnabled = false;
      setSourcesHidden(false);
    } finally {
      studioKonvaRuntime.autoDrawEnabled = autoDrawEnabled;
    }
  };

  const cleanup = (
    outcome: Parameters<
      StudioLiveCanvasGestureTransientAdapter<StudioLiveSelectionTransformFrame>["close"]
    >[0],
  ): void => {
    if (closeState === "closed") return;
    if (closeState === "closing") {
      throw new Error("Konva group live-transform renderer cleanup is already in progress");
    }
    closeOutcome ??= outcome;
    const ownedOutcome = closeOutcome;
    closeState = "closing";
    const criticalFailures: unknown[] = [];
    const critical = (operation: () => void): void => {
      try {
        operation();
      } catch (error) {
        criticalFailures.push(error);
      }
    };
    critical(() => previewSession?.dispose());
    if (!terminalFramePrepared) {
      if (ownedOutcome.kind === "commit") {
        critical(() => {
          terminalDraft = presentationMode === "exact"
            ? exactPresentation(ownedOutcome.terminalFrame)
            : null;
          terminalFramePrepared = true;
        });
      } else {
        terminalDraft = null;
        terminalFramePrepared = true;
      }
    }
    let fallbackRestored = fallbackPreview === null;
    if (fallbackPreview) {
      critical(() => {
        fallbackPreview?.clear();
        fallbackRestored = true;
      });
    }
    let ownershipRestored = true;
    critical(() => {
      if (chromeLift && !chromeLift.restored && !restoreStudioSingleObjectDragLayer(chromeLift)) {
        ownershipRestored = false;
        throw new Error("Failed to restore the group transform chrome Layer ownership");
      }
    });
    critical(() => {
      for (const member of members) {
        member.node.setAttr(STUDIO_LIVE_TRANSFORM_PREVIEW_ACTIVE_ATTR, undefined);
      }
    });
    if ((ownedOutcome.kind !== "commit" || terminalDraft === null) && ownershipRestored) {
      critical(() => {
        restoreSources("release");
      });
    }
    if (fallbackRestored) {
      critical(() => {
        fallbackPreview?.dispose();
        fallbackPreview = null;
      });
    }
    for (const indicator of parkedIndicators) {
      try {
        indicator.visible(true);
      } catch {
        // Ignore destroyed chrome; authoritative geometry cleanup continues.
      }
    }
    try {
      drainStudioLateParkedChrome(options.stage);
    } catch {
      // A stale hidden indicator is recoverable; a stuck renderer transform is not.
    }
    try {
      mainLayer.drawScene();
    } catch {
      // Cosmetic redraw only; the next authoritative render will repaint the Layer.
    }
    if (criticalFailures.length > 0) {
      closeState = "open";
      throw new AggregateError(
        criticalFailures,
        "Failed to completely release a Konva group live-transform renderer claim",
      );
    }
    closeState = "closed";
  };

  try {
    parkedIndicators = [
      ...options.stage.find(`.${STUDIO_DRAW_SELECTION_INDICATOR_NAME}`),
      ...options.stage.find(`.${STUDIO_GROUP_SELECTION_OVERLAY_NAME}`),
    ].filter((indicator) => indicator.visible());
    for (const indicator of parkedIndicators) indicator.visible(false);

    const autoDrawEnabled = studioKonvaRuntime.autoDrawEnabled;
    try {
      studioKonvaRuntime.autoDrawEnabled = false;
      for (const member of members) {
        member.node.setAttr(STUDIO_LIVE_TRANSFORM_PREVIEW_ACTIVE_ATTR, true);
      }
    } finally {
      studioKonvaRuntime.autoDrawEnabled = autoDrawEnabled;
    }

    // Only the handles are lifted. Sources stay in the document Layer, so the isolated Layer holds
    // the chrome plus the draft root and a handle frame never repaints the page.
    chromeLift = beginStudioSingleDrawTransformChromeLayer({
      elementId: members[0]!.element.id,
      wrapper: members[0]!.node,
      proxy: options.proxy,
      transformer: options.transformer,
      dragLayer,
    });
    if (!chromeLift) {
      cleanup({ kind: "cancel", reason: "preview-error" });
      return null;
    }
    fallbackPreview = createStudioLiveTransformWireframeFallback({
      members,
      sourceBounds: options.sourceBounds,
      dragLayer: draftLayer,
      strokeWidthPolicy: "preserve",
    });
    if (!fallbackPreview) {
      cleanup({ kind: "cancel", reason: "preview-error" });
      return null;
    }

    // Deliberately after the chrome lift and the indicator parking, not before: the proxy and its
    // Transformer are ordinary later siblings of the strokes until they move to the isolated
    // Layer. Stacking now disables only the exact top-Layer draft; the bounded guide leaves the
    // authored wrappers in their original composition and remains available.
    if (
      exactPreviewEligible
      && !studioLiveTransformGroupStackingIsolatable(members.map((member) => member.node))
    ) {
      exactPreviewEligible = false;
    }
    if (exactPreviewEligible) {
      draftClaim = options.preview.draftStore?.claim(options.preview.scope, selectedIds) ?? null;
      if (!draftClaim) exactPreviewEligible = false;
    }
    presentationMode = exactPreviewEligible ? "exact" : "fallback";

    previewSession = createStudioLiveTransformPreviewSession({
      sourceBounds: options.sourceBounds,
      // Forces every projectable frame down the exact lane: there is no retained affine that can
      // reproduce a width-preserving group resize.
      renderRoute: {
        retainedAffinePolicy: "model-draft-only",
        strokeWidth: 0,
        strokeDistance: 0,
        pointCount: 0,
      },
      scheduler: options.preview.scheduler ?? {
        requestFrame: (callback) => globalThis.requestAnimationFrame(callback),
        cancelFrame: (handle) => globalThis.cancelAnimationFrame(handle),
      },
      adapter: {
        presentationEnvironmentKey: () => {
          const metrics = studioLiveTransformRasterMetrics(options.stage, dragLayer);
          return `rasterScale:${metrics.rasterScale};backingPixels:${metrics.sceneCanvasBackingPixels}`;
        },
        // Unreachable while the route above says model-draft-only, and a refusal is the correct
        // answer if that ever changes: a retained affine here would show scaled line weight.
        apply: () => false,
        applyExact: (frame) => presentFrame({
          targetBounds: frame.targetBounds,
          rotationDeg: frame.rotationDeg,
        }),
        neutralize: () => {
          fallbackPreview?.clear();
          restoreSources();
        },
      },
      ...(options.onError !== undefined ? { onError: options.onError } : {}),
      ...(options.onFatalError !== undefined ? { onFatalError: options.onFatalError } : {}),
    });

    return {
      offer: (frame) => previewSession?.push(frame),
      close: cleanup,
      settle: ({ committed }) => {
        if (committed && terminalDraft) {
          if (!draftClaim) {
            restoreSources("release");
            return true;
          }
          if (!handoffRegistered) {
            const retained = draftClaim.handoff([...terminalDraft], () => {
              handoffReleaseRequested = true;
              paintSourceReceiptSynchronously();
              handoffSourceRestored = true;
            });
            handoffRegistered = retained;
            if (!retained) {
              if (!(handoffSourceRestored && draftClaim.isReleased())) {
                restoreSources("release");
              }
              return true;
            }
          }
          if (handoffSourceRestored && draftClaim.isReleased()) return true;
          if (handoffReleaseRequested) {
            const released = draftClaim.release();
            if (!released && !draftClaim.isReleased()) return false;
            if (!(handoffSourceRestored && draftClaim.isReleased())) {
              restoreSources("release");
            }
            return true;
          }
          // Registration alone is not settlement: hold the writer lease until the authoritative
          // document receipt (or the store's timeout) restores the sources.
          return false;
        }
        restoreSources("release");
        return true;
      },
    };
  } catch (error) {
    cleanup({ kind: "cancel", reason: "preview-error" });
    throw error;
  }
}
