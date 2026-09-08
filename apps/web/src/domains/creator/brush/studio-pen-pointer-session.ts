import {
  beginStudioStrokePointerSession as beginBaseStudioStrokePointerSession,
  type StudioPointerEventLike,
  type StudioStrokePointerSession,
} from "../canvas/studio-pointer-input";

import {
  resolveStudioPenContactAction,
  type StudioPenButtonPolicy,
} from "./studio-pen-button-policy";
import { getStudioPenButtonPolicySnapshot } from "./studio-pen-button-policy-store";

/**
 * Admits standards-based pen eraser contacts without weakening the shared pointer-input contract.
 * The base session still sees one normalized primary contact and therefore keeps every existing
 * pointer identity, coalescing, cancellation and deduplication invariant.
 */
export function beginStudioStrokePointerSession(
  event: StudioPointerEventLike,
  policy: StudioPenButtonPolicy = getStudioPenButtonPolicySnapshot(),
): StudioStrokePointerSession | null {
  const action = resolveStudioPenContactAction(event, policy);
  if (action === "ignore") return null;
  if (action === "primary") return beginBaseStudioStrokePointerSession(event);

  return beginBaseStudioStrokePointerSession({
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    isPrimary: event.isPrimary,
    // Normalize the admitted eraser contact only for base session admission. The original event is
    // still used by pressure, tilt, rendering, capture and release pipelines.
    button: 0,
    buttons: 1,
    clientX: event.clientX,
    clientY: event.clientY,
    pressure: event.pressure,
    tangentialPressure: event.tangentialPressure,
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    altitudeAngle: event.altitudeAngle,
    azimuthAngle: event.azimuthAngle,
    twist: event.twist,
    width: event.width,
    height: event.height,
    timeStamp: event.timeStamp,
  });
}
