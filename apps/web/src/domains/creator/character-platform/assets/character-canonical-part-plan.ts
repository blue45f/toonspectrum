import type {
  CharacterCanonicalManifestV2,
  CharacterCanonicalPartDescriptor,
  CharacterCanonicalPartFitDriver,
  CharacterCanonicalPartLod,
} from "./character-canonical-manifest";

export type CharacterCanonicalPartAvailability =
  | { readonly status: "supported"; readonly reason: null }
  | { readonly status: "unavailable"; readonly reason: string };

export interface CharacterCanonicalPartFitScale {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CharacterCanonicalPartPlan {
  readonly partId: string;
  readonly availability: CharacterCanonicalPartAvailability;
  readonly lod: CharacterCanonicalPartLod | null;
  readonly scale: CharacterCanonicalPartFitScale;
  readonly clearanceMeters: number;
  readonly hideTargetPart: boolean;
  readonly correctiveMorphs: Readonly<Record<string, number>>;
}

const QUALITY_PARITY_FLOOR = 90;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function driverScale(
  driver: CharacterCanonicalPartFitDriver,
  measurements: Readonly<Record<string, number>>,
): number {
  const measured = measurements[driver.measurement];
  if (!Number.isFinite(measured) || measured <= 0 || driver.reference <= 0) return 1;
  const ratio = measured / driver.reference;
  return clamp(
    1 + (ratio - 1) * driver.weight,
    driver.minimumScale,
    driver.maximumScale,
  );
}

export function deriveCharacterCanonicalPartFitScale(
  part: CharacterCanonicalPartDescriptor,
  measurements: Readonly<Record<string, number>>,
): CharacterCanonicalPartFitScale {
  let x = 1;
  let y = 1;
  let z = 1;
  for (const driver of part.fitting.drivers) {
    const scale = driverScale(driver, measurements);
    if (driver.axis === "uniform") {
      x *= scale;
      y *= scale;
      z *= scale;
    } else if (driver.axis === "x") {
      x *= scale;
    } else if (driver.axis === "y") {
      y *= scale;
    } else {
      z *= scale;
    }
  }
  return Object.freeze({ x, y, z });
}

export function inspectCharacterCanonicalPartAvailability(
  manifest: CharacterCanonicalManifestV2,
  part: CharacterCanonicalPartDescriptor,
): CharacterCanonicalPartAvailability {
  if (!part.quality.accepted || part.quality.minimumScore < QUALITY_PARITY_FLOOR) {
    return Object.freeze({
      status: "unavailable",
      reason: `품질 승인 점수가 ${QUALITY_PARITY_FLOOR}점 기준을 충족하지 않습니다.`,
    });
  }
  if (!part.provenance.commercialUse || !part.provenance.redistribution || !part.provenance.derivativeUse) {
    return Object.freeze({
      status: "unavailable",
      reason: "상업 사용·재배포·파생 저작 권리가 모두 확인된 파츠만 사용할 수 있습니다.",
    });
  }
  const topology = part.binding.requiredTopologyFamilies;
  if (topology && topology.length > 0 && !topology.includes(manifest.identity.topologyFamily)) {
    return Object.freeze({
      status: "unavailable",
      reason: `현재 토폴로지 ${manifest.identity.topologyFamily}와 호환되지 않습니다.`,
    });
  }
  const rigs = part.binding.requiredRigRevisions;
  if (rigs && rigs.length > 0 && !rigs.includes(manifest.identity.rigRevision)) {
    return Object.freeze({
      status: "unavailable",
      reason: `현재 리그 ${manifest.identity.rigRevision}용으로 승인되지 않은 파츠입니다.`,
    });
  }
  if (part.binding.targetSocket) {
    const socket = manifest.fitting.sockets.find((entry) => entry.id === part.binding.targetSocket);
    if (!socket) {
      return Object.freeze({
        status: "unavailable",
        reason: `필요한 부착 소켓 ${part.binding.targetSocket}이 현재 모델에 없습니다.`,
      });
    }
  }
  return Object.freeze({ status: "supported", reason: null });
}

export function selectCharacterCanonicalPartLod(
  part: CharacterCanonicalPartDescriptor,
  projectedHeightPx: number,
): CharacterCanonicalPartLod | null {
  if (part.lods.length === 0) return null;
  const height = Number.isFinite(projectedHeightPx) && projectedHeightPx > 0
    ? projectedHeightPx
    : Number.POSITIVE_INFINITY;
  const ordered = [...part.lods].sort(
    (left, right) => left.maximumProjectedHeightPx - right.maximumProjectedHeightPx,
  );
  return ordered.find((lod) => height <= lod.maximumProjectedHeightPx) ?? ordered.at(-1) ?? null;
}

export function createCharacterCanonicalPartPlan(input: {
  readonly manifest: CharacterCanonicalManifestV2;
  readonly part: CharacterCanonicalPartDescriptor;
  readonly projectedHeightPx: number;
}): CharacterCanonicalPartPlan {
  const availability = inspectCharacterCanonicalPartAvailability(input.manifest, input.part);
  return Object.freeze({
    partId: input.part.id,
    availability,
    lod: selectCharacterCanonicalPartLod(input.part, input.projectedHeightPx),
    scale: deriveCharacterCanonicalPartFitScale(input.part, input.manifest.fitting.bodyMeasurements),
    clearanceMeters: input.part.fitting.clearanceMeters,
    hideTargetPart: input.part.fitting.hideTargetPart,
    correctiveMorphs: Object.freeze({ ...input.part.fitting.correctiveMorphs }),
  });
}
