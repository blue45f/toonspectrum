import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";

interface TurntableControls {
  autoRotate: boolean;
  autoRotateSpeed: number;
  enableDamping: boolean;
}

// OrbitControls is an imperative Three runtime object, not React-owned state.
function ownTurntableControls(controls: TurntableControls, active: boolean) {
  const originalRotation = controls.autoRotate;
  const originalSpeed = controls.autoRotateSpeed;
  const originalDamping = controls.enableDamping;
  controls.autoRotate = active;
  // Automatic steps must not accumulate damping inertia that keeps moving after Stop.
  if (active) controls.enableDamping = false;
  return () => {
    controls.autoRotate = originalRotation;
    controls.autoRotateSpeed = originalSpeed;
    controls.enableDamping = originalDamping;
  };
}

function setTurntableFrameSpeed(controls: TurntableControls, speed: number) {
  controls.autoRotateSpeed = speed;
}

/** Drive the existing OrbitControls without replacing camera or pointer ownership. */
export function StudioBg3dTurntableMotion({ active, speedRpm }: {
  readonly active: boolean;
  readonly speedRpm: number;
}) {
  const candidate = useThree((state) => state.controls);
  const controls = candidate && "autoRotate" in candidate && "autoRotateSpeed" in candidate
    && "enableDamping" in candidate
    ? candidate as TurntableControls : null;
  const invalidate = useThree((state) => state.invalidate);
  const primed = useRef(false);

  useEffect(() => {
    if (!controls) return;
    primed.current = false;
    const release = ownTurntableControls(controls, active);
    if (active) invalidate();
    return release;
  }, [active, controls, invalidate]);

  // Drei updates three-stdlib controls at priority -1 without a delta argument. Compensate
  // before that update so RPM follows elapsed time on both fast and software renderers.
  useFrame((_, deltaSeconds) => {
    if (!active || !controls) return;
    // A demand loop can have been idle for minutes before Play. Its first delta is not rotation time.
    setTurntableFrameSpeed(controls, primed.current ? speedRpm * 60 * deltaSeconds : 0);
    primed.current = true;
    invalidate();
  }, -2);

  return null;
}
