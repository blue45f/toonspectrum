/* eslint-disable react-refresh/only-export-components -- 순수 좌표/종료 헬퍼도 포인터 경계 테스트의 공개 계약이다. */

import { Html } from "@react-three/drei/web/Html.js";
import { useFrame, useThree } from "@react-three/fiber";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as THREE from "three";

import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

const POSITION_EPSILON = 1e-8;
const DEFAULT_DRAG_THRESHOLD_PX = 3;
const DEFAULT_KEYBOARD_STEP = 0.025;

export type StudioVrmJointHandleBone =
  | "hips"
  | "head"
  | "leftShoulder"
  | "rightShoulder"
  | "leftLowerArm"
  | "rightLowerArm"
  | "leftHand"
  | "rightHand"
  | "leftLowerLeg"
  | "rightLowerLeg"
  | "leftFoot"
  | "rightFoot";

export type StudioVrmIkEffectorBone =
  | "leftHand"
  | "rightHand"
  | "leftFoot"
  | "rightFoot";

export type StudioVrmJointWorldPoint = readonly [number, number, number];

type StudioVrmJointSide = "center" | "left" | "right";

export interface StudioVrmJointHandleDefinition {
  bone: StudioVrmJointHandleBone;
  label: string;
  side: StudioVrmJointSide;
  effector: boolean;
}

export const STUDIO_VRM_JOINT_HANDLE_DEFINITIONS = [
  { bone: "hips", label: "골반", side: "center", effector: false },
  { bone: "head", label: "머리", side: "center", effector: false },
  { bone: "leftShoulder", label: "왼쪽 어깨", side: "left", effector: false },
  { bone: "rightShoulder", label: "오른쪽 어깨", side: "right", effector: false },
  { bone: "leftLowerArm", label: "왼쪽 팔꿈치", side: "left", effector: false },
  { bone: "rightLowerArm", label: "오른쪽 팔꿈치", side: "right", effector: false },
  { bone: "leftHand", label: "왼손", side: "left", effector: true },
  { bone: "rightHand", label: "오른손", side: "right", effector: true },
  { bone: "leftLowerLeg", label: "왼쪽 무릎", side: "left", effector: false },
  { bone: "rightLowerLeg", label: "오른쪽 무릎", side: "right", effector: false },
  { bone: "leftFoot", label: "왼발", side: "left", effector: true },
  { bone: "rightFoot", label: "오른발", side: "right", effector: true },
] as const satisfies readonly StudioVrmJointHandleDefinition[];

export interface StudioVrmJointNodeBinding extends StudioVrmJointHandleDefinition {
  node: THREE.Object3D;
}

interface StudioVrmNormalizedHumanoidLike {
  getNormalizedBoneNode(name: VRMHumanBoneName): THREE.Object3D | null;
}

export interface StudioVrmJointDragSnapshot {
  bone: StudioVrmIkEffectorBone;
  startWorld: StudioVrmJointWorldPoint;
  latestWorld: StudioVrmJointWorldPoint;
  didPreview: boolean;
}

export type StudioVrmJointDragOutcome =
  | {
      kind: "selection-only";
      bone: StudioVrmIkEffectorBone;
    }
  | {
      kind: "commit";
      bone: StudioVrmIkEffectorBone;
      worldPosition: StudioVrmJointWorldPoint;
    }
  | {
      kind: "rollback";
      bone: StudioVrmIkEffectorBone;
      worldPosition: StudioVrmJointWorldPoint;
    };

export interface StudioVrmJointHandlesProps {
  vrm: Pick<VRM, "humanoid"> | null;
  selectedBone?: StudioVrmJointHandleBone | null;
  effectorTargets?: Partial<Record<StudioVrmIkEffectorBone, StudioVrmJointWorldPoint>>;
  dragPlane?: THREE.Plane | null;
  screenSize?: number;
  keyboardStep?: number;
  disabled?: boolean;
  visible?: boolean;
  onSelectBone?: (bone: StudioVrmJointHandleBone) => void;
  onHoverBoneChange?: (bone: StudioVrmJointHandleBone | null) => void;
  onEffectorPreview?: (
    bone: StudioVrmIkEffectorBone,
    worldPosition: StudioVrmJointWorldPoint
  ) => void;
  onEffectorCommit?: (
    bone: StudioVrmIkEffectorBone,
    worldPosition: StudioVrmJointWorldPoint
  ) => void;
  onEffectorRollback?: (
    bone: StudioVrmIkEffectorBone,
    originalWorldPosition: StudioVrmJointWorldPoint
  ) => void;
  /** OrbitControls의 enabled 값을 반대로 연결하기 위한 일시적 상호작용 잠금 신호다. */
  onInteractionActiveChange?: (active: boolean) => void;
}

interface DragSession {
  pointerId: number;
  bone: StudioVrmIkEffectorBone;
  startClientX: number;
  startClientY: number;
  startWorld: THREE.Vector3;
  latestWorld: THREE.Vector3;
  plane: THREE.Plane;
  didPreview: boolean;
}

interface CanvasRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

function isFiniteVector(vector: THREE.Vector3 | null | undefined): vector is THREE.Vector3 {
  return Boolean(vector)
    && Number.isFinite(vector!.x)
    && Number.isFinite(vector!.y)
    && Number.isFinite(vector!.z);
}

function isFiniteWorldPoint(
  point: StudioVrmJointWorldPoint | null | undefined
): point is StudioVrmJointWorldPoint {
  return Boolean(point)
    && point!.length === 3
    && point!.every(Number.isFinite);
}

function isStudioVrmIkEffectorBone(
  bone: StudioVrmJointHandleBone
): bone is StudioVrmIkEffectorBone {
  return bone === "leftHand"
    || bone === "rightHand"
    || bone === "leftFoot"
    || bone === "rightFoot";
}

function worldPoint(vector: THREE.Vector3): StudioVrmJointWorldPoint {
  return [vector.x, vector.y, vector.z];
}

function stopPointerEvent(event: ReactPointerEvent<HTMLButtonElement>) {
  event.preventDefault();
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation?.();
}

function stopKeyboardEvent(event: ReactKeyboardEvent<HTMLButtonElement>) {
  event.preventDefault();
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation?.();
}

/** 누락되거나 예외를 던지는 비표준 VRM 본은 개별적으로 건너뛴다. */
export function resolveStudioVrmJointNodeBindings(
  humanoid: StudioVrmNormalizedHumanoidLike | null | undefined
): StudioVrmJointNodeBinding[] {
  if (!humanoid) return [];

  const bindings: StudioVrmJointNodeBinding[] = [];
  for (const definition of STUDIO_VRM_JOINT_HANDLE_DEFINITIONS) {
    try {
      const node = humanoid.getNormalizedBoneNode(definition.bone);
      if (node instanceof THREE.Object3D) bindings.push({ ...definition, node });
    } catch {
      // 손상된 개별 bone accessor 때문에 나머지 핸들까지 숨기지 않는다.
    }
  }
  return bindings;
}

/** 명시된 평면이 유효하면 복사해 쓰고, 아니면 시작점을 지나는 카메라 정면 평면을 만든다. */
export function createStudioVrmJointDragPlane(
  camera: THREE.Camera,
  startWorld: THREE.Vector3,
  explicitPlane?: THREE.Plane | null
): THREE.Plane {
  if (
    explicitPlane
    && isFiniteVector(explicitPlane.normal)
    && explicitPlane.normal.lengthSq() > POSITION_EPSILON
    && Number.isFinite(explicitPlane.constant)
  ) {
    return explicitPlane.clone().normalize();
  }

  const normal = camera.getWorldDirection(new THREE.Vector3());
  if (!isFiniteVector(normal) || normal.lengthSq() <= POSITION_EPSILON) {
    normal.set(0, 0, -1);
  }
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(), startWorld);
}

/** DOM 포인터 좌표를 캔버스 NDC로 바꾼 뒤 주어진 3D 평면과 교차시킨다. */
export function projectStudioVrmJointPointerToPlane(
  clientX: number,
  clientY: number,
  canvasRect: CanvasRectLike,
  camera: THREE.Camera,
  plane: THREE.Plane,
  target = new THREE.Vector3()
): THREE.Vector3 | null {
  if (
    !Number.isFinite(clientX)
    || !Number.isFinite(clientY)
    || !Number.isFinite(canvasRect.left)
    || !Number.isFinite(canvasRect.top)
    || !Number.isFinite(canvasRect.width)
    || !Number.isFinite(canvasRect.height)
    || canvasRect.width <= 0
    || canvasRect.height <= 0
  ) {
    return null;
  }

  const pointer = new THREE.Vector2(
    ((clientX - canvasRect.left) / canvasRect.width) * 2 - 1,
    -((clientY - canvasRect.top) / canvasRect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  camera.updateMatrixWorld();
  raycaster.setFromCamera(pointer, camera);
  const intersection = raycaster.ray.intersectPlane(plane, target);
  return isFiniteVector(intersection) ? intersection : null;
}

/** 취소 계열은 항상 시작점 롤백, 정상 종료는 실제 preview가 있었을 때만 확정한다. */
export function resolveStudioVrmJointDragOutcome(
  snapshot: StudioVrmJointDragSnapshot,
  cancelled: boolean
): StudioVrmJointDragOutcome {
  if (cancelled) {
    return {
      kind: "rollback",
      bone: snapshot.bone,
      worldPosition: [...snapshot.startWorld],
    };
  }
  if (!snapshot.didPreview) return { kind: "selection-only", bone: snapshot.bone };
  return {
    kind: "commit",
    bone: snapshot.bone,
    worldPosition: [...snapshot.latestWorld],
  };
}

function handleColor(side: StudioVrmJointSide): string {
  if (side === "left") return "#38bdf8";
  if (side === "right") return "#f472b6";
  return "#fbbf24";
}

function Handle({
  binding,
  selected,
  controlledTarget,
  dragPlane,
  screenSize,
  keyboardStep,
  disabled,
  onSelectBone,
  onHoverBoneChange,
  onEffectorPreview,
  onEffectorCommit,
  onEffectorRollback,
  onInteractionActiveChange,
}: {
  binding: StudioVrmJointNodeBinding;
  selected: boolean;
  controlledTarget?: StudioVrmJointWorldPoint;
  dragPlane?: THREE.Plane | null;
  screenSize: number;
  keyboardStep: number;
  disabled: boolean;
  onSelectBone?: StudioVrmJointHandlesProps["onSelectBone"];
  onHoverBoneChange?: StudioVrmJointHandlesProps["onHoverBoneChange"];
  onEffectorPreview?: StudioVrmJointHandlesProps["onEffectorPreview"];
  onEffectorCommit?: StudioVrmJointHandlesProps["onEffectorCommit"];
  onEffectorRollback?: StudioVrmJointHandlesProps["onEffectorRollback"];
  onInteractionActiveChange?: StudioVrmJointHandlesProps["onInteractionActiveChange"];
}) {
  const groupRef = useRef<THREE.Group>(null);
  const dragRef = useRef<DragSession | null>(null);
  const scratchWorldRef = useRef(new THREE.Vector3());
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  const effectorBone = isStudioVrmIkEffectorBone(binding.bone) ? binding.bone : null;

  const rollbackOnUnmount = useEffectEvent((session: DragSession) => {
    onEffectorRollback?.(session.bone, worldPoint(session.startWorld));
    onInteractionActiveChange?.(false);
  });

  useEffect(() => () => {
    const session = dragRef.current;
    dragRef.current = null;
    if (session) rollbackOnUnmount(session);
  }, []);

  useFrame(() => {
    const group = groupRef.current;
    if (!group || dragRef.current) return;

    if (binding.effector && isFiniteWorldPoint(controlledTarget)) {
      group.position.fromArray(controlledTarget);
      group.visible = true;
      return;
    }

    binding.node.updateWorldMatrix(true, false);
    const world = binding.node.getWorldPosition(scratchWorldRef.current);
    group.visible = isFiniteVector(world);
    if (group.visible) group.position.copy(world);
  });

  const readCurrentWorldPosition = (): THREE.Vector3 | null => {
    if (binding.effector && isFiniteWorldPoint(controlledTarget)) {
      return new THREE.Vector3().fromArray(controlledTarget);
    }
    binding.node.updateWorldMatrix(true, false);
    const world = binding.node.getWorldPosition(new THREE.Vector3());
    return isFiniteVector(world) ? world : null;
  };

  const finishDrag = (
    pointerId: number,
    cancelled: boolean,
    captureTarget?: HTMLButtonElement
  ) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== pointerId) return;
    dragRef.current = null;
    setDragging(false);
    onInteractionActiveChange?.(false);

    const outcome = resolveStudioVrmJointDragOutcome({
      bone: session.bone,
      startWorld: worldPoint(session.startWorld),
      latestWorld: worldPoint(session.latestWorld),
      didPreview: session.didPreview,
    }, cancelled);
    if (outcome.kind === "rollback") {
      groupRef.current?.position.copy(session.startWorld);
      onEffectorRollback?.(outcome.bone, outcome.worldPosition);
    } else if (outcome.kind === "commit") {
      onEffectorCommit?.(outcome.bone, outcome.worldPosition);
    }

    if (captureTarget?.hasPointerCapture?.(pointerId)) {
      try {
        captureTarget.releasePointerCapture(pointerId);
      } catch {
        // 브라우저가 pointercancel 처리 중 이미 캡처를 해제할 수 있다.
      }
    }
  };

  const handleKeyboardNudge = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!effectorBone || disabled) return;
    const localStep = keyboardStep * (event.shiftKey ? 4 : 1);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    const forward = camera.getWorldDirection(new THREE.Vector3()).normalize();
    let delta: THREE.Vector3 | null = null;
    if (event.key === "ArrowLeft") delta = right.multiplyScalar(-localStep);
    else if (event.key === "ArrowRight") delta = right.multiplyScalar(localStep);
    else if (event.key === "ArrowUp") delta = up.multiplyScalar(localStep);
    else if (event.key === "ArrowDown") delta = up.multiplyScalar(-localStep);
    else if (event.key === "PageUp") delta = forward.multiplyScalar(localStep);
    else if (event.key === "PageDown") delta = forward.multiplyScalar(-localStep);
    if (!delta) return;

    stopKeyboardEvent(event);
    const current = readCurrentWorldPosition();
    if (!current) return;
    const next = current.add(delta);
    groupRef.current?.position.copy(next);
    const nextPoint = worldPoint(next);
    onSelectBone?.(binding.bone);
    onEffectorPreview?.(effectorBone, nextPoint);
    onEffectorCommit?.(effectorBone, nextPoint);
  };

  const size = THREE.MathUtils.clamp(screenSize, 14, 36);
  const color = handleColor(binding.side);
  const active = selected || hovered || dragging;
  const buttonStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: binding.effector ? Math.max(5, size * 0.28) : "999px",
    border: `${selected ? 3 : 2}px solid ${selected ? "#ffffff" : "rgba(255,255,255,0.9)"}`,
    background: color,
    boxShadow: selected
      ? `0 0 0 2px rgba(15,23,42,0.92), 0 0 14px ${color}`
      : "0 1px 5px rgba(15,23,42,0.75)",
    cursor: disabled ? "not-allowed" : dragging ? "grabbing" : binding.effector ? "grab" : "pointer",
    opacity: disabled ? 0.45 : 0.94,
    pointerEvents: "auto",
    position: "relative",
    padding: 0,
    transform: `${active ? "scale(1.18)" : "scale(1)"} ${binding.effector ? "rotate(45deg)" : ""}`,
    transition: dragging ? "none" : "transform 100ms ease, box-shadow 100ms ease",
    touchAction: "none",
  };

  return (
    <group ref={groupRef}>
      <Html center transform={false} zIndexRange={[80, 10]} pointerEvents="none">
        <button
          type="button"
          aria-label={`${binding.label} 관절${binding.effector ? " IK 목표 이동" : " 선택"}`}
          aria-pressed={selected}
          aria-keyshortcuts={binding.effector ? "ArrowLeft ArrowRight ArrowUp ArrowDown PageUp PageDown" : undefined}
          data-bone={binding.bone}
          data-effector={binding.effector || undefined}
          disabled={disabled}
          title={binding.effector
            ? `${binding.label}: 드래그 또는 방향키로 IK 목표 이동`
            : `${binding.label} 관절 선택`}
          style={buttonStyle}
          onFocus={() => {
            setHovered(true);
            onHoverBoneChange?.(binding.bone);
          }}
          onBlur={() => {
            setHovered(false);
            onHoverBoneChange?.(null);
          }}
          onPointerEnter={() => {
            setHovered(true);
            onHoverBoneChange?.(binding.bone);
          }}
          onPointerLeave={() => {
            setHovered(false);
            onHoverBoneChange?.(null);
          }}
          onPointerDown={(event) => {
            if (disabled || event.button !== 0) return;
            stopPointerEvent(event);
            onSelectBone?.(binding.bone);
            if (!effectorBone) return;

            const startWorld = readCurrentWorldPosition();
            if (!startWorld) return;
            dragRef.current = {
              pointerId: event.pointerId,
              bone: effectorBone,
              startClientX: event.clientX,
              startClientY: event.clientY,
              startWorld: startWorld.clone(),
              latestWorld: startWorld.clone(),
              plane: createStudioVrmJointDragPlane(camera, startWorld, dragPlane),
              didPreview: false,
            };
            setDragging(true);
            onInteractionActiveChange?.(true);
            try {
              event.currentTarget.setPointerCapture?.(event.pointerId);
            } catch {
              // 오래된 WebView에서는 포인터 캡처 API가 없거나 실패할 수 있다.
            }
          }}
          onPointerMove={(event) => {
            const session = dragRef.current;
            if (!session || session.pointerId !== event.pointerId) return;
            stopPointerEvent(event);
            const movement = Math.hypot(
              event.clientX - session.startClientX,
              event.clientY - session.startClientY
            );
            if (!session.didPreview && movement < DEFAULT_DRAG_THRESHOLD_PX) return;

            const projected = projectStudioVrmJointPointerToPlane(
              event.clientX,
              event.clientY,
              canvas.getBoundingClientRect(),
              camera,
              session.plane
            );
            if (!projected) return;
            session.didPreview = true;
            session.latestWorld.copy(projected);
            groupRef.current?.position.copy(projected);
            onEffectorPreview?.(session.bone, worldPoint(projected));
          }}
          onPointerUp={(event) => {
            stopPointerEvent(event);
            finishDrag(event.pointerId, false, event.currentTarget);
          }}
          onPointerCancel={(event) => {
            stopPointerEvent(event);
            finishDrag(event.pointerId, true, event.currentTarget);
          }}
          onLostPointerCapture={(event) => {
            stopPointerEvent(event);
            finishDrag(event.pointerId, true, event.currentTarget);
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === " ") && !disabled) {
              stopKeyboardEvent(event);
              onSelectBone?.(binding.bone);
              return;
            }
            if (event.key === "Escape" && dragRef.current) {
              stopKeyboardEvent(event);
              finishDrag(dragRef.current.pointerId, true, event.currentTarget);
              return;
            }
            handleKeyboardNudge(event);
          }}
        >
          {binding.effector ? (
            <span
              aria-hidden
              style={{
                display: "block",
                position: "absolute",
                inset: "28%",
                borderRadius: "999px",
                background: "rgba(15,23,42,0.82)",
              }}
            />
          ) : null}
        </button>
      </Html>
    </group>
  );
}

/**
 * VRM normalized humanoid의 주요 관절과 손·발 IK 목표를 표시한다.
 * 영속 포즈 상태는 소유하지 않고 모든 preview/commit/rollback을 상위 콜백으로 전달한다.
 */
export function StudioVrmJointHandles({
  vrm,
  selectedBone = null,
  effectorTargets,
  dragPlane,
  screenSize = 22,
  keyboardStep = DEFAULT_KEYBOARD_STEP,
  disabled = false,
  visible = true,
  onSelectBone,
  onHoverBoneChange,
  onEffectorPreview,
  onEffectorCommit,
  onEffectorRollback,
  onInteractionActiveChange,
}: StudioVrmJointHandlesProps) {
  if (!visible) return null;
  const bindings = resolveStudioVrmJointNodeBindings(vrm?.humanoid);
  if (bindings.length === 0) return null;

  const safeScreenSize = Number.isFinite(screenSize) ? screenSize : 22;
  const safeKeyboardStep = Number.isFinite(keyboardStep) && keyboardStep > 0
    ? keyboardStep
    : DEFAULT_KEYBOARD_STEP;

  return (
    <group name="studio-vrm-joint-handles">
      {bindings.map((binding) => (
        <Handle
          key={binding.bone}
          binding={binding}
          selected={selectedBone === binding.bone}
          controlledTarget={isStudioVrmIkEffectorBone(binding.bone)
            ? effectorTargets?.[binding.bone]
            : undefined}
          dragPlane={dragPlane}
          screenSize={safeScreenSize}
          keyboardStep={safeKeyboardStep}
          disabled={disabled}
          onSelectBone={onSelectBone}
          onHoverBoneChange={onHoverBoneChange}
          onEffectorPreview={onEffectorPreview}
          onEffectorCommit={onEffectorCommit}
          onEffectorRollback={onEffectorRollback}
          onInteractionActiveChange={onInteractionActiveChange}
        />
      ))}
    </group>
  );
}
