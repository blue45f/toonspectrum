import {
  forwardRef,
  useEffect,
  useState,
  type ComponentProps,
} from "react";
import { Transformer } from "react-konva/lib/ReactKonvaCore";

import {
  STUDIO_TRANSFORM_ROTATION_SNAPS,
  STUDIO_TRANSFORM_ROTATION_SNAP_TOLERANCE_DEG,
} from "./studio-transform-interaction";

import type Konva from "konva";

type NativeTransformerProps = ComponentProps<typeof Transformer>;

export type StudioNaturalTransformerProps = Omit<
  NativeTransformerProps,
  | "ref"
  | "centeredScaling"
  | "keepRatio"
  | "rotationSnaps"
  | "rotationSnapTolerance"
  | "shiftBehavior"
> & {
  naturalRatioMode: "always" | "shift";
  naturalRotationEnabled: boolean;
};

interface StudioTransformModifierState {
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

const EMPTY_MODIFIERS: StudioTransformModifierState = {
  altKey: false,
  shiftKey: false,
};

function modifierState(
  event: Pick<KeyboardEvent | PointerEvent, "altKey" | "shiftKey">,
): StudioTransformModifierState {
  return { altKey: event.altKey, shiftKey: event.shiftKey };
}

/**
 * Shared PPT/Figma-style transform contract for ordinary objects, ink and multi-selection.
 */
export const StudioNaturalTransformer = forwardRef<
  Konva.Transformer,
  StudioNaturalTransformerProps
>(function StudioNaturalTransformer(
  { naturalRatioMode, naturalRotationEnabled, rotateEnabled, ...props },
  ref,
) {
  const [modifiers, setModifiers] = useState<StudioTransformModifierState>(EMPTY_MODIFIERS);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;
    const publish = (next: StudioTransformModifierState) => {
      setModifiers((current) =>
        current.altKey === next.altKey && current.shiftKey === next.shiftKey ? current : next,
      );
    };
    const readKeyboard = (event: KeyboardEvent) => publish(modifierState(event));
    const readPointer = (event: PointerEvent) => publish(modifierState(event));
    const reset = () => publish(EMPTY_MODIFIERS);
    const resetWhenHidden = () => {
      if (document.visibilityState === "hidden") reset();
    };

    window.addEventListener("keydown", readKeyboard, true);
    window.addEventListener("keyup", readKeyboard, true);
    window.addEventListener("pointerdown", readPointer, true);
    window.addEventListener("pointermove", readPointer, true);
    window.addEventListener("pointerup", readPointer, true);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", resetWhenHidden);
    return () => {
      window.removeEventListener("keydown", readKeyboard, true);
      window.removeEventListener("keyup", readKeyboard, true);
      window.removeEventListener("pointerdown", readPointer, true);
      window.removeEventListener("pointermove", readPointer, true);
      window.removeEventListener("pointerup", readPointer, true);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", resetWhenHidden);
    };
  }, []);

  const rotationEnabled = naturalRotationEnabled && rotateEnabled !== false;
  const snapRotation = rotationEnabled && modifiers.shiftKey;
  const ratioAlwaysLocked = naturalRatioMode === "always";

  return (
    <Transformer
      {...props}
      ref={ref}
      rotateEnabled={rotationEnabled}
      rotationSnaps={snapRotation ? STUDIO_TRANSFORM_ROTATION_SNAPS : []}
      rotationSnapTolerance={
        snapRotation ? STUDIO_TRANSFORM_ROTATION_SNAP_TOLERANCE_DEG : 0
      }
      keepRatio={ratioAlwaysLocked}
      shiftBehavior={ratioAlwaysLocked ? "none" : "default"}
      centeredScaling={modifiers.altKey}
    />
  );
});
