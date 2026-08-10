import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";

import { applyStudioBg3dLinkedCharacterState } from "./studio-bg3d-shared-vrm-runtime";
import { parseCostumeState } from "./studio-vrm-costume";
import {
  applyStudioVrmCostumeState,
  type StudioVrmCostumeMeshEntry,
} from "./studio-vrm-costume-runtime";
import { inspectStudioVrmGarmentFit } from "./studio-vrm-garment-fit";
import {
  applyStudioVrmLinkedAppearanceReadinessReceipt,
  type StudioVrmLinkedAppearanceReadinessReceipt,
  type StudioVrmLinkedAppearanceReadinessState,
} from "./studio-vrm-linked-appearance-readiness";
import { createStudioVrmLinkedAppearanceReadinessPlan } from
  "./studio-vrm-linked-appearance-readiness-plan";
import {
  scaleVrmPropRigMetrics,
  type VrmPropRigMetrics,
} from "./studio-vrm-prop-rig";
import {
  WARDROBE_SLOTS,
  mergeWardrobeCostumeVisibility,
  type WardrobeMetrics,
  type WardrobeSlot,
  type WardrobeState,
} from "./studio-vrm-wardrobe";
import {
  StudioVrmPropAttachment,
  StudioVrmRuntimeCommit,
  StudioVrmWardrobeAttachment,
  type StudioVrmProjectionAttachmentStatus,
} from "./StudioVrmWardrobePropsProjection";

import type { StudioShared3dCharacterSource } from "./studio-shared-3d-scene-bridge";
import type { StudioVrmSkinnedGarmentReceipt } from "./studio-vrm-skinned-garment";
import type { VRM } from "@pixiv/three-vrm";

type ProjectionStatus = "loading" | "ready" | "unavailable";

interface AttachmentRegistryEntry {
  readonly id: string;
  readonly status: Exclude<StudioVrmProjectionAttachmentStatus, "detached">;
}

interface AttachmentRegistry {
  readonly wardrobe: Map<string, AttachmentRegistryEntry>;
  readonly props: Map<string, AttachmentRegistryEntry>;
}

interface BaseProjectionState {
  readonly identityKey: string;
  readonly status: "pending" | "ready" | "unavailable";
}

interface AttachmentFailureSignal {
  readonly identityKey: string;
  readonly code: string;
  readonly detail: string;
}

let linkedAppearanceGeneration = 0;

function allocateLinkedAppearanceGeneration(): number {
  if (linkedAppearanceGeneration >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Linked appearance generation space exhausted.");
  }
  linkedAppearanceGeneration += 1;
  return linkedAppearanceGeneration;
}

function projectionIdentityKey(source: StudioShared3dCharacterSource): string {
  return JSON.stringify([
    source.runtimeKey,
    source.placementHash,
    source.compatibility.appearanceProjection.signature,
  ]);
}

function wardrobeStateFromSource(source: StudioShared3dCharacterSource): WardrobeState {
  const projection = source.compatibility.appearanceProjection;
  if (
    projection.wardrobe.status !== "supported"
    || projection.handProps.status === "unsupported"
  ) return {};

  return Object.fromEntries(projection.wardrobe.slots.map((entry) => [entry.slot, {
    itemId: entry.itemId,
    color: entry.color,
    fit: entry.fit,
    fitMode: entry.fitMode,
    fabricId: entry.fabricId,
  }])) as WardrobeState;
}

function applyProjectionCostume({
  source,
  costumeMeshes,
  wardrobeState,
  includeProjectedWardrobe,
}: {
  source: StudioShared3dCharacterSource;
  costumeMeshes: StudioVrmCostumeMeshEntry[];
  wardrobeState: WardrobeState;
  includeProjectedWardrobe: boolean;
}): boolean {
  try {
    const projection = source.compatibility.appearanceProjection;
    const authoredCostume = parseCostumeState(source.scene.appearance.costume);
    const autoHideOriginal = includeProjectedWardrobe
      && projection.wardrobe.status === "supported"
      ? projection.wardrobe.autoHideOriginal
      : false;
    applyStudioVrmCostumeState(
      costumeMeshes,
      mergeWardrobeCostumeVisibility(
        authoredCostume,
        includeProjectedWardrobe ? wardrobeState : {},
        costumeMeshes,
        autoHideOriginal,
      ),
    );
    return true;
  } catch {
    return false;
  }
}

function ignoreWardrobeSurfaceReceipt(
  _slot: WardrobeSlot,
  _receipt: StudioVrmSkinnedGarmentReceipt | null,
) {}

function StudioBg3dSharedVrmReadinessGate({
  vrm,
  source,
  identityKey,
  registry,
  baseProjectionRef,
  attachmentFailureRef,
  onAttachmentsReady,
  onStatus,
}: {
  vrm: VRM;
  source: StudioShared3dCharacterSource;
  identityKey: string;
  registry: AttachmentRegistry;
  baseProjectionRef: RefObject<BaseProjectionState>;
  attachmentFailureRef: RefObject<AttachmentFailureSignal | null>;
  onAttachmentsReady: () => boolean;
  onStatus: (status: ProjectionStatus) => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const [run] = useState(() => ({
    result: createStudioVrmLinkedAppearanceReadinessPlan(
      source.compatibility.appearanceProjection,
      {
        runtimeKey: source.runtimeKey,
        placementHash: source.placementHash,
        generation: allocateLinkedAppearanceGeneration(),
      },
    ),
  }));
  const readinessStateRef = useRef<StudioVrmLinkedAppearanceReadinessState | null>(
    run.result.ok ? run.result.state : null,
  );
  const onStatusRef = useRef(onStatus);
  const activeRef = useRef(false);
  const settledRef = useRef<"ready" | "unavailable" | null>(null);
  const attachmentsActivatedRef = useRef(false);

  useLayoutEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useLayoutEffect(() => {
    activeRef.current = true;
    onStatusRef.current("loading");
    if (!run.result.ok) {
      settledRef.current = "unavailable";
      onStatusRef.current("unavailable");
    } else {
      invalidate();
    }
    return () => {
      activeRef.current = false;
    };
  }, [invalidate, run]);

  function finishUnavailable() {
    if (settledRef.current === "unavailable") return;
    settledRef.current = "unavailable";
    onStatusRef.current("unavailable");
  }

  function applyReceipt(receipt: StudioVrmLinkedAppearanceReadinessReceipt) {
    const current = readinessStateRef.current;
    if (!current) return null;
    try {
      const transition = applyStudioVrmLinkedAppearanceReadinessReceipt(current, receipt);
      readinessStateRef.current = transition.state;
      if (transition.snapshot.status === "unavailable") finishUnavailable();
      return transition.snapshot;
    } catch {
      finishUnavailable();
      return null;
    }
  }

  function failRuntime(code: string, detail: string) {
    const state = readinessStateRef.current;
    if (!state || settledRef.current === "unavailable") return;
    applyReceipt({
      kind: "failure",
      identity: state.identity,
      code,
      detail,
    });
  }

  function handleCommitFrame(frame: number) {
    if (!activeRef.current || settledRef.current === "unavailable" || !run.result.ok) return;
    const attachmentFailure = attachmentFailureRef.current;
    if (attachmentFailure?.identityKey === identityKey) {
      failRuntime(attachmentFailure.code, attachmentFailure.detail);
      return;
    }
    const baseProjection = baseProjectionRef.current;
    if (!baseProjection || baseProjection.identityKey !== identityKey) return;
    if (baseProjection.status === "unavailable") {
      failRuntime("base-projection-unavailable", "The canonical VRM state could not be applied.");
      return;
    }
    if (baseProjection.status !== "ready") return;

    let current = readinessStateRef.current;
    if (!current) {
      finishUnavailable();
      return;
    }

    for (const expected of current.expectedWardrobe) {
      const received = current.receivedWardrobe.some((entry) => entry.slot === expected.slot);
      const attachment = registry.wardrobe.get(expected.slot);
      if (!attachment || attachment.id !== expected.itemId) {
        if (received || current.commitFrame !== null || settledRef.current === "ready") {
          failRuntime(
            "wardrobe-attachment-detached",
            `Wardrobe slot ${expected.slot} lost item ${expected.itemId} after attachment.`,
          );
        }
        return;
      }
      if (attachment.status === "unavailable") {
        failRuntime(
          "wardrobe-attachment-unavailable",
          `Wardrobe slot ${expected.slot} could not attach item ${expected.itemId}.`,
        );
        return;
      }
      if (received) continue;
      const snapshot = applyReceipt({
        kind: "wardrobe-attached",
        identity: current.identity,
        frame,
        slot: expected.slot,
        itemId: expected.itemId,
      });
      if (!snapshot || snapshot.status === "unavailable") return;
      current = readinessStateRef.current!;
    }

    for (const expected of current.expectedProps) {
      const received = current.receivedProps.some((entry) => entry.uid === expected.uid);
      const attachment = registry.props.get(expected.uid);
      if (!attachment || attachment.id !== expected.propId) {
        if (received || current.commitFrame !== null || settledRef.current === "ready") {
          failRuntime(
            "prop-attachment-detached",
            `Prop ${expected.uid} lost ${expected.propId} after attachment.`,
          );
        }
        return;
      }
      if (attachment.status === "unavailable") {
        failRuntime(
          "prop-attachment-unavailable",
          `Prop ${expected.uid} could not attach ${expected.propId}.`,
        );
        return;
      }
      if (received) continue;
      const snapshot = applyReceipt({
        kind: "prop-attached",
        identity: current.identity,
        frame,
        uid: expected.uid,
        propId: expected.propId,
      });
      if (!snapshot || snapshot.status === "unavailable") return;
      current = readinessStateRef.current!;
    }

    // A ready generation remains monitored. A later detach/unavailable transition must revoke
    // capture authority instead of leaving an old ready receipt permanently trusted.
    if (settledRef.current === "ready") return;

    if (!attachmentsActivatedRef.current) {
      try {
        if (!onAttachmentsReady()) {
          failRuntime(
            "appearance-activation-unavailable",
            "The projected appearance could not be activated.",
          );
          return;
        }
        attachmentsActivatedRef.current = true;
      } catch {
        failRuntime(
          "appearance-activation-unavailable",
          "The projected appearance could not be activated.",
        );
        return;
      }
    }

    if (current.commitFrame === null) {
      const snapshot = applyReceipt({
        kind: "runtime-commit",
        identity: current.identity,
        frame,
      });
      if (!snapshot || snapshot.status === "unavailable") return;
      invalidate();
      return;
    }

    if (current.postCommitFrame === null && frame > current.commitFrame) {
      const snapshot = applyReceipt({
        kind: "post-commit",
        identity: current.identity,
        frame,
      });
      if (snapshot?.status === "ready") {
        settledRef.current = "ready";
        onStatusRef.current("ready");
      }
    }
  }

  if (!run.result.ok) return null;
  return (
    <StudioVrmRuntimeCommit
      vrm={vrm}
      physicsPreview={false}
      webcamActive={false}
      onCommitFrame={handleCommitFrame}
    />
  );
}

/**
 * Projects the exact wardrobe and hand-prop subset admitted by the pure compatibility plan.
 * The base VRM remains source-authoritative; procedural attachments are runtime-only children.
 */
export function StudioBg3dSharedVrmAppearanceRuntime({
  vrm,
  source,
  wardrobeMetrics,
  propRigMetrics,
  costumeMeshes,
  onStatus,
}: {
  vrm: VRM;
  source: StudioShared3dCharacterSource;
  wardrobeMetrics: WardrobeMetrics;
  propRigMetrics: VrmPropRigMetrics;
  costumeMeshes: StudioVrmCostumeMeshEntry[];
  onStatus: (identityKey: string, status: ProjectionStatus) => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const identityKey = projectionIdentityKey(source);
  const projection = source.compatibility.appearanceProjection;
  const fullySupported = projection.wardrobe.status !== "unsupported"
    && projection.handProps.status !== "unsupported";
  const wardrobeState = fullySupported ? wardrobeStateFromSource(source) : {};
  const fitReport = inspectStudioVrmGarmentFit(wardrobeState, wardrobeMetrics);
  const effectivePropRigMetrics = scaleVrmPropRigMetrics(
    propRigMetrics,
    source.scene.appearance.bodyScale,
  );
  const registryRef = useRef<AttachmentRegistry>({
    wardrobe: new Map(),
    props: new Map(),
  });
  const baseProjectionRef = useRef<BaseProjectionState>({
    identityKey,
    status: "pending",
  });
  const attachmentFailureRef = useRef<AttachmentFailureSignal | null>(null);
  const activatedAppearanceIdentityRef = useRef<string | null>(null);
  const [attachmentsQuarantined, setAttachmentsQuarantined] = useState(false);

  useLayoutEffect(() => {
    attachmentFailureRef.current = null;
    baseProjectionRef.current = { identityKey, status: "pending" };
    try {
      const currentPropRigMetrics = scaleVrmPropRigMetrics(
        propRigMetrics,
        source.scene.appearance.bodyScale,
      );
      const applied = applyStudioBg3dLinkedCharacterState(vrm, source, {
        propRigMetrics: currentPropRigMetrics,
        projectHandProps: fullySupported,
      });
      if (!applied) {
        baseProjectionRef.current = { identityKey, status: "unavailable" };
        invalidate();
        return;
      }

      const includeProjectedWardrobe = activatedAppearanceIdentityRef.current === identityKey;
      if (!applyProjectionCostume({
        source,
        costumeMeshes,
        wardrobeState: fullySupported ? wardrobeStateFromSource(source) : {},
        includeProjectedWardrobe,
      })) {
        baseProjectionRef.current = { identityKey, status: "unavailable" };
        invalidate();
        return;
      }
      baseProjectionRef.current = { identityKey, status: "ready" };
    } catch {
      baseProjectionRef.current = { identityKey, status: "unavailable" };
    }
    invalidate();
  }, [
    costumeMeshes,
    fullySupported,
    identityKey,
    invalidate,
    propRigMetrics,
    source,
    vrm,
  ]);

  function handleAttachmentsReady(): boolean {
    if (!applyProjectionCostume({
      source,
      costumeMeshes,
      wardrobeState: fullySupported ? wardrobeStateFromSource(source) : {},
      includeProjectedWardrobe: true,
    })) return false;
    activatedAppearanceIdentityRef.current = identityKey;
    invalidate();
    return true;
  }

  function handleProjectionStatus(status: ProjectionStatus) {
    if (status === "loading" || status === "unavailable") {
      if (activatedAppearanceIdentityRef.current !== identityKey || status === "unavailable") {
        activatedAppearanceIdentityRef.current = null;
        applyProjectionCostume({
          source,
          costumeMeshes,
          wardrobeState: {},
          includeProjectedWardrobe: false,
        });
      }
      if (status === "unavailable") {
        // A terminal generation must not leave a visibly broken rigid fallback, an ungripped prop,
        // or procedural clothing layered over the restored authored costume. Remounting this
        // identity is the only recovery path, so late "ready" callbacks cannot reveal it again.
        setAttachmentsQuarantined(true);
      }
    }
    onStatus(identityKey, status);
  }

  function handlePropAttachmentStatus(
    uid: string,
    propId: string,
    status: StudioVrmProjectionAttachmentStatus,
  ) {
    const registry = registryRef.current.props;
    if (status === "detached") {
      if (registry.get(uid)?.id === propId) registry.delete(uid);
    } else {
      registry.set(uid, { id: propId, status });
    }
    if (status === "unavailable") {
      attachmentFailureRef.current = {
        identityKey,
        code: "prop-attachment-unavailable",
        detail: `Prop ${uid} could not keep ${propId} attached.`,
      };
    }
    invalidate();
  }

  function handleWardrobeAttachmentStatus(
    slot: WardrobeSlot,
    itemId: string,
    status: StudioVrmProjectionAttachmentStatus,
  ) {
    const registry = registryRef.current.wardrobe;
    if (status === "detached") {
      if (registry.get(slot)?.id === itemId) registry.delete(slot);
    } else {
      registry.set(slot, { id: itemId, status });
    }
    if (status === "unavailable") {
      attachmentFailureRef.current = {
        identityKey,
        code: "wardrobe-attachment-unavailable",
        detail: `Wardrobe slot ${slot} could not keep item ${itemId} attached.`,
      };
    }
    invalidate();
  }

  return (
    <>
      {fullySupported && !attachmentsQuarantined && projection.handProps.status === "supported"
        ? projection.handProps.props.map((prop) => (
            <StudioVrmPropAttachment
              key={prop.uid}
              vrm={vrm}
              instance={prop.instance}
              metrics={effectivePropRigMetrics}
              onAttachmentStatus={handlePropAttachmentStatus}
            />
          ))
        : null}
      {fullySupported && !attachmentsQuarantined && projection.wardrobe.status === "supported"
        ? WARDROBE_SLOTS.map((slot) => {
            const equip = wardrobeState[slot];
            const slotFit = fitReport.slots[slot];
            return equip ? (
              <StudioVrmWardrobeAttachment
                key={slot}
                vrm={vrm}
                slot={slot}
                equip={equip}
                metrics={wardrobeMetrics}
                effectiveFit={slotFit?.effectiveFit ?? equip.fit}
                onSurfaceReceipt={ignoreWardrobeSurfaceReceipt}
                onAttachmentStatus={handleWardrobeAttachmentStatus}
              />
            ) : null;
          })
        : null}
      <StudioBg3dSharedVrmReadinessGate
        key={identityKey}
        vrm={vrm}
        source={source}
        identityKey={identityKey}
        registry={registryRef.current}
        baseProjectionRef={baseProjectionRef}
        attachmentFailureRef={attachmentFailureRef}
        onAttachmentsReady={handleAttachmentsReady}
        onStatus={handleProjectionStatus}
      />
    </>
  );
}
