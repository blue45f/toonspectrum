#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const REQUIRED_SKINS = ["pink", "silver", "dark", "purple"];
const REQUIRED_DIRECTIONS = ["down", "left", "right", "up"];
const REQUIRED_PINK_STATES = ["draw", "review", "talk"];
const EXPECTED_FRAME_SIZE = [384, 512];
const EXPECTED_FOOT_ANCHOR = [0.5, 0.9609375];
const EXPECTED_FRAMES_PER_DIRECTION = 8;
const EXPECTED_RIG_ALGORITHM_VERSION = "flattened-cutout-discrete-gait-v1";
const EXPECTED_VISIBLE_DIFFERENCE_THRESHOLD = 4;
const MINIMUM_DISTINCT_VISIBLE_PIXELS = 1024;
const EXPECTED_ANIMATION_TECHNIQUE =
  "cutout-rig mesh deformation of existing art; not redrawn poses";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

export const VIRTUAL_STUDIO_PRODUCTION_ART_DIRECTORY = path.resolve(
  scriptDirectory,
  "../apps/web/public/assets/virtual-studio/production-v2",
);

export const VIRTUAL_STUDIO_ART_MANIFEST_PATH = path.join(
  VIRTUAL_STUDIO_PRODUCTION_ART_DIRECTORY,
  "art-manifest.json",
);

export const VIRTUAL_STUDIO_LIVING_WORLD_ART_DIRECTORY = path.resolve(
  scriptDirectory,
  "../apps/web/public/assets/virtual-studio/living-world",
);
const LIVING_WORLD_BACKGROUND_NAME = "master-clean-plate.webp";
const LIVING_WORLD_BACKGROUND_URL = `/assets/virtual-studio/living-world/${LIVING_WORLD_BACKGROUND_NAME}`;
const LIVING_WORLD_DIMENSIONS = [1296, 1213];

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requirePositiveInteger(value, label) {
  requireCondition(
    Number.isSafeInteger(value) && value > 0,
    `${label} must be a positive safe integer`,
  );
}

function requireNonNegativeInteger(value, label) {
  requireCondition(
    Number.isSafeInteger(value) && value >= 0,
    `${label} must be a non-negative safe integer`,
  );
}

function requireDimensions(value, label) {
  requireCondition(
    Array.isArray(value) && value.length === 2,
    `${label} must contain exactly two dimensions`,
  );
  requirePositiveInteger(value[0], `${label}[0]`);
  requirePositiveInteger(value[1], `${label}[1]`);
  return value;
}

function requireSha256(value, label) {
  requireCondition(
    typeof value === "string" && SHA256_PATTERN.test(value),
    `${label} must be a lowercase SHA-256 digest`,
  );
}

function dimensionsEqual(left, right) {
  return left[0] === right[0] && left[1] === right[1];
}

function readUint24LittleEndian(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function readPngDimensions(bytes, label) {
  requireCondition(bytes.length >= 24, `${label} has a truncated PNG header`);
  requireCondition(
    bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
    `${label} does not have a PNG signature`,
  );
  requireCondition(
    bytes.readUInt32BE(8) === 13 && bytes.toString("ascii", 12, 16) === "IHDR",
    `${label} does not start with a valid PNG IHDR chunk`,
  );
  const dimensions = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  requireDimensions(dimensions, `${label} PNG dimensions`);
  return { format: "png", dimensions };
}

function readWebpDimensions(bytes, label) {
  requireCondition(bytes.length >= 20, `${label} has a truncated WebP header`);
  requireCondition(
    bytes.toString("ascii", 0, 4) === "RIFF"
      && bytes.toString("ascii", 8, 12) === "WEBP",
    `${label} does not have a WebP RIFF signature`,
  );
  requireCondition(
    bytes.readUInt32LE(4) + 8 === bytes.length,
    `${label} WebP RIFF length does not match its byte length`,
  );

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = bytes.toString("ascii", offset, offset + 4);
    const chunkLength = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + chunkLength;
    requireCondition(dataEnd <= bytes.length, `${label} has a truncated ${chunkType} chunk`);

    if (chunkType === "VP8X") {
      requireCondition(chunkLength >= 10, `${label} has a truncated VP8X chunk`);
      const dimensions = [
        readUint24LittleEndian(bytes, dataOffset + 4) + 1,
        readUint24LittleEndian(bytes, dataOffset + 7) + 1,
      ];
      requireDimensions(dimensions, `${label} WebP dimensions`);
      return { format: "webp", dimensions };
    }

    if (chunkType === "VP8L") {
      requireCondition(chunkLength >= 5, `${label} has a truncated VP8L chunk`);
      requireCondition(bytes[dataOffset] === 0x2f, `${label} has an invalid VP8L signature`);
      const dimensionBits = bytes.readUInt32LE(dataOffset + 1);
      const dimensions = [
        (dimensionBits & 0x3fff) + 1,
        ((dimensionBits >>> 14) & 0x3fff) + 1,
      ];
      requireDimensions(dimensions, `${label} WebP dimensions`);
      return { format: "webp", dimensions };
    }

    if (chunkType === "VP8 ") {
      requireCondition(chunkLength >= 10, `${label} has a truncated VP8 chunk`);
      requireCondition(
        bytes[dataOffset + 3] === 0x9d
          && bytes[dataOffset + 4] === 0x01
          && bytes[dataOffset + 5] === 0x2a,
        `${label} has an invalid VP8 frame header`,
      );
      const dimensions = [
        bytes.readUInt16LE(dataOffset + 6) & 0x3fff,
        bytes.readUInt16LE(dataOffset + 8) & 0x3fff,
      ];
      requireDimensions(dimensions, `${label} WebP dimensions`);
      return { format: "webp", dimensions };
    }

    offset = dataEnd + (chunkLength % 2);
  }

  throw new Error(`${label} has no supported WebP image chunk`);
}

export function readImageDimensions(bytes, label = "image") {
  requireCondition(Buffer.isBuffer(bytes), `${label} must be provided as a Buffer`);
  if (bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return readPngDimensions(bytes, label);
  }
  if (
    bytes.length >= 12
    && bytes.toString("ascii", 0, 4) === "RIFF"
    && bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return readWebpDimensions(bytes, label);
  }
  throw new Error(`${label} is not a supported PNG or WebP image`);
}

function outputMetadata(manifest, fileName) {
  const metadata = manifest.outputs[fileName];
  requireCondition(isRecord(metadata), `manifest is missing required output ${fileName}`);
  return metadata;
}

export function validateVirtualStudioArtManifestContract(manifest) {
  requireCondition(isRecord(manifest), "art manifest must be a JSON object");
  requireCondition(manifest.version === 2, "art manifest version must be 2");
  requireCondition(isRecord(manifest.outputs), "art manifest outputs must be an object");
  requireCondition(
    dimensionsEqual(requireDimensions(manifest.frameSize, "manifest frameSize"), EXPECTED_FRAME_SIZE),
    `manifest frameSize must remain ${EXPECTED_FRAME_SIZE.join("x")}`,
  );
  requireCondition(
    manifest.framesPerDirection === EXPECTED_FRAMES_PER_DIRECTION,
    `manifest framesPerDirection must remain ${EXPECTED_FRAMES_PER_DIRECTION}`,
  );
  requireCondition(
    Array.isArray(manifest.footAnchor)
      && manifest.footAnchor.length === 2
      && manifest.footAnchor.every((value) => Number.isFinite(value) && value >= 0 && value <= 1),
    "manifest footAnchor must contain two normalized numbers",
  );
  requireCondition(
    manifest.footAnchor[0] === EXPECTED_FOOT_ANCHOR[0]
      && manifest.footAnchor[1] === EXPECTED_FOOT_ANCHOR[1],
    `manifest footAnchor must remain ${EXPECTED_FOOT_ANCHOR.join(",")}`,
  );
  requireCondition(
    manifest.animationTechnique === EXPECTED_ANIMATION_TECHNIQUE,
    "manifest must disclose that animation uses cutout-rig deformation, not redrawn poses",
  );

  requireCondition(isRecord(manifest.generator), "manifest generator metadata is required");
  requireCondition(
    manifest.generator.path === "scripts/build-virtual-studio-art.py",
    "manifest generator path must identify the checked-in art builder",
  );
  requireSha256(manifest.generator.sha256, "manifest generator sha256");
  requireCondition(
    manifest.generator.rigAlgorithmVersion === EXPECTED_RIG_ALGORITHM_VERSION,
    `manifest rigAlgorithmVersion must be ${EXPECTED_RIG_ALGORITHM_VERSION}`,
  );
  requirePositiveInteger(manifest.generator.meshStep, "manifest generator meshStep");
  requirePositiveInteger(
    manifest.generator.screenLobeTransitionPixels,
    "manifest generator screenLobeTransitionPixels",
  );
  requireCondition(
    manifest.generator.transformAlpha === "premultiplied"
      && manifest.generator.resampling === "bicubic",
    "manifest generator must preserve premultiplied bicubic deformation",
  );
  requireCondition(isRecord(manifest.toolchain), "manifest toolchain metadata is required");
  requireCondition(
    typeof manifest.toolchain.pillowVersion === "string"
      && manifest.toolchain.pillowVersion !== ""
      && typeof manifest.toolchain.libwebpVersion === "string"
      && manifest.toolchain.libwebpVersion !== "",
    "manifest toolchain must record Pillow and libwebp versions",
  );
  requireCondition(
    isRecord(manifest.toolchain.webpEncoding)
      && manifest.toolchain.webpEncoding.lossless === true
      && manifest.toolchain.webpEncoding.method === 6
      && manifest.toolchain.webpEncoding.exactTransparentRgb === true,
    "manifest WebP encoding must preserve lossless exact transparent RGB",
  );

  requireCondition(isRecord(manifest.gait), "manifest gait metadata is required");
  requireCondition(
    Array.isArray(manifest.gait.phaseTable)
      && manifest.gait.phaseTable.length === EXPECTED_FRAMES_PER_DIRECTION,
    "manifest gait phaseTable must contain eight phases",
  );
  for (const [index, phase] of manifest.gait.phaseTable.entries()) {
    requireCondition(
      Array.isArray(phase)
        && phase.length === 5
        && phase.every((value) => Number.isFinite(value)),
      `manifest gait phase ${index} must contain five finite numbers`,
    );
    const aLift = phase[1];
    const bLift = phase[3];
    requireCondition(
      aLift >= 0 && bLift >= 0 && (aLift === 0 || bLift === 0),
      `manifest gait phase ${index} must keep at least one screen lobe planted`,
    );
    if (index === 0 || index === 4) {
      requireCondition(
        aLift === 0 && bLift === 0,
        `manifest gait phase ${index} must be double-contact`,
      );
    } else if (index < 4) {
      requireCondition(
        aLift === 0 && bLift > 0,
        `manifest gait phase ${index} must swing screen lobe B`,
      );
    } else {
      requireCondition(
        aLift > 0 && bLift === 0,
        `manifest gait phase ${index} must swing screen lobe A`,
      );
    }
  }
  requireCondition(
    Array.isArray(manifest.gait.frameLabels)
      && manifest.gait.frameLabels.length === EXPECTED_FRAMES_PER_DIRECTION
      && new Set(manifest.gait.frameLabels).size === EXPECTED_FRAMES_PER_DIRECTION,
    "manifest gait frameLabels must uniquely describe all eight phases",
  );
  requireCondition(
    typeof manifest.gait.limbModel === "string"
      && manifest.gait.limbModel.includes("screen-space")
      && manifest.gait.limbModel.includes("not anatomical"),
    "manifest gait must disclose its screen-space, non-anatomical lobe model",
  );
  requireCondition(
    Array.isArray(manifest.limitations)
      && manifest.limitations.includes("flattened single-layer source")
      && manifest.limitations.includes("occluded limbs are not reconstructed")
      && manifest.limitations.includes("mesh-deformed cutout rig, not redrawn walk poses"),
    "manifest must preserve flattened-source and non-redrawn gait limitations",
  );

  requireCondition(isRecord(manifest.background), "manifest background metadata is required");
  requireSha256(manifest.background.sourceSha256, "manifest background sourceSha256");
  requireCondition(
    manifest.background.bakedOccupants === true,
    "manifest must preserve the bakedOccupants limitation",
  );
  requireCondition(
    typeof manifest.background.losslessPixelVerified === "boolean",
    "manifest background losslessPixelVerified must be a boolean build record",
  );
  requireCondition(
    typeof manifest.background.sourcePixelsComparedThisBuild === "boolean",
    "manifest background sourcePixelsComparedThisBuild must be a boolean",
  );
  requireCondition(
    manifest.background.outputIntegrityVerifiedThisBuild === true,
    "manifest background outputIntegrityVerifiedThisBuild must be true",
  );
  if (manifest.background.sourcePixelsComparedThisBuild) {
    requireCondition(
      manifest.background.provenanceMode === "source-verified",
      "source-compared background provenanceMode must be source-verified",
    );
  } else {
    requireCondition(
      manifest.background.provenanceMode === "carried-forward",
      "background without a private-source comparison must use carried-forward provenance",
    );
    requireSha256(
      manifest.background.carriedFromManifestSha256,
      "manifest background carriedFromManifestSha256",
    );
  }
  const backgroundSize = requireDimensions(
    manifest.background.nativeSize,
    "manifest background nativeSize",
  );
  const backgroundOutput = outputMetadata(manifest, "master-central-lossless.webp");
  requireCondition(
    dimensionsEqual(backgroundOutput.dimensions, backgroundSize),
    "background output dimensions must match manifest background nativeSize",
  );

  requireCondition(isRecord(manifest.skins), "manifest skins metadata is required");
  for (const skin of REQUIRED_SKINS) {
    const skinMetadata = manifest.skins[skin];
    requireCondition(isRecord(skinMetadata), `manifest is missing required skin ${skin}`);
    requireCondition(
      isRecord(skinMetadata.directions),
      `manifest skin ${skin} directions must be an object`,
    );

    for (const direction of REQUIRED_DIRECTIONS) {
      const directionMetadata = skinMetadata.directions[direction];
      requireCondition(
        isRecord(directionMetadata),
        `manifest is missing ${skin}/${direction} direction metadata`,
      );
      requireSha256(
        directionMetadata.sourceSha256,
        `manifest ${skin}/${direction} sourceSha256`,
      );
      requireCondition(
        directionMetadata.technique === "cutout-rig",
        `manifest ${skin}/${direction} must disclose the cutout-rig technique`,
      );
      requireCondition(
        directionMetadata.frames === EXPECTED_FRAMES_PER_DIRECTION,
        `manifest ${skin}/${direction} must declare ${EXPECTED_FRAMES_PER_DIRECTION} frames`,
      );
      requireCondition(
        directionMetadata.rigProfile === "screen-space-lobes-v1",
        `manifest ${skin}/${direction} must declare the screen-space lobe rig profile`,
      );
      const landmarks = directionMetadata.lowerBodyLandmarks;
      requireCondition(
        isRecord(landmarks),
        `manifest ${skin}/${direction} lowerBodyLandmarks must be an object`,
      );
      requireCondition(
        Array.isArray(landmarks.screenLobeCenters)
          && landmarks.screenLobeCenters.length === 2
          && landmarks.screenLobeCenters.every(Number.isFinite),
        `manifest ${skin}/${direction} must record two screen-lobe centers`,
      );
      requireCondition(
        landmarks.screenLobeCenters[0] < landmarks.screenLobeCenters[1],
        `manifest ${skin}/${direction} screen-lobe centers must be ordered`,
      );
      requirePositiveInteger(landmarks.splitX, `manifest ${skin}/${direction} splitX`);
      requireCondition(
        landmarks.splitX > 0 && landmarks.splitX < EXPECTED_FRAME_SIZE[0],
        `manifest ${skin}/${direction} splitX must remain inside the frame`,
      );
      requireCondition(
        ["lower-body-center-midpoint", "side-view-contact-median"]
          .includes(landmarks.splitMethod),
        `manifest ${skin}/${direction} has an unknown screen-lobe split method`,
      );
      for (const field of [
        "sourceOpaqueBottomY",
        "sourceBottomPixels",
        "plantedDropPixels",
      ]) {
        requireCondition(
          Array.isArray(landmarks[field]) && landmarks[field].length === 2,
          `manifest ${skin}/${direction} ${field} must contain two lobe values`,
        );
        landmarks[field].forEach((value, index) => {
          requireNonNegativeInteger(value, `manifest ${skin}/${direction} ${field}[${index}]`);
        });
      }
      requirePositiveInteger(
        landmarks.plantedContactCompensationPixels,
        `manifest ${skin}/${direction} plantedContactCompensationPixels`,
      );
      requireCondition(
        directionMetadata.decodedUniqueVisibleFrames === EXPECTED_FRAMES_PER_DIRECTION,
        `manifest ${skin}/${direction} must have eight decoded-visible frames`,
      );
      requireCondition(
        Array.isArray(directionMetadata.decodedVisibleFrameSha256)
          && directionMetadata.decodedVisibleFrameSha256.length
            === EXPECTED_FRAMES_PER_DIRECTION,
        `manifest ${skin}/${direction} must record eight decoded-visible hashes`,
      );
      directionMetadata.decodedVisibleFrameSha256.forEach((digest, index) => {
        requireSha256(digest, `manifest ${skin}/${direction} decoded frame ${index} sha256`);
      });
      requireCondition(
        new Set(directionMetadata.decodedVisibleFrameSha256).size
          === EXPECTED_FRAMES_PER_DIRECTION,
        `manifest ${skin}/${direction} decoded-visible hashes must all be unique`,
      );
      requireCondition(
        directionMetadata.visibleDifferenceThreshold === EXPECTED_VISIBLE_DIFFERENCE_THRESHOLD,
        `manifest ${skin}/${direction} visible difference threshold must remain ${EXPECTED_VISIBLE_DIFFERENCE_THRESHOLD}`,
      );
      requireCondition(
        Number.isSafeInteger(directionMetadata.minimumPairwiseVisibleDifferencePixels)
          && directionMetadata.minimumPairwiseVisibleDifferencePixels
            >= MINIMUM_DISTINCT_VISIBLE_PIXELS,
        `manifest ${skin}/${direction} must differ by at least ${MINIMUM_DISTINCT_VISIBLE_PIXELS} visible pixels`,
      );
      requireCondition(
        directionMetadata.footContactBaselineY === 491,
        `manifest ${skin}/${direction} foot contact baseline must remain y=491`,
      );
      requireCondition(
        Array.isArray(directionMetadata.footContactPixels)
          && directionMetadata.footContactPixels.length === EXPECTED_FRAMES_PER_DIRECTION,
        `manifest ${skin}/${direction} footContactPixels must contain eight frames`,
      );
      requireCondition(
        Array.isArray(directionMetadata.footContactPixelsByScreenLobe)
          && directionMetadata.footContactPixelsByScreenLobe.length
            === EXPECTED_FRAMES_PER_DIRECTION,
        `manifest ${skin}/${direction} lobe contacts must contain eight frames`,
      );
      requireCondition(
        Array.isArray(directionMetadata.footClearancePixelsByScreenLobe)
          && directionMetadata.footClearancePixelsByScreenLobe.length
            === EXPECTED_FRAMES_PER_DIRECTION,
        `manifest ${skin}/${direction} lobe clearances must contain eight frames`,
      );
      for (let frame = 0; frame < EXPECTED_FRAMES_PER_DIRECTION; frame += 1) {
        const totalContact = directionMetadata.footContactPixels[frame];
        requirePositiveInteger(
          totalContact,
          `manifest ${skin}/${direction} frame ${frame} foot contact`,
        );
        const lobeContacts = directionMetadata.footContactPixelsByScreenLobe[frame];
        const lobeClearances = directionMetadata.footClearancePixelsByScreenLobe[frame];
        requireCondition(
          Array.isArray(lobeContacts) && lobeContacts.length === 2,
          `manifest ${skin}/${direction} frame ${frame} must contain two lobe contacts`,
        );
        requireCondition(
          Array.isArray(lobeClearances) && lobeClearances.length === 2,
          `manifest ${skin}/${direction} frame ${frame} must contain two lobe clearances`,
        );
        lobeContacts.forEach((value, index) => {
          requireNonNegativeInteger(
            value,
            `manifest ${skin}/${direction} frame ${frame} lobe ${index} contact`,
          );
        });
        lobeClearances.forEach((value, index) => {
          requireNonNegativeInteger(
            value,
            `manifest ${skin}/${direction} frame ${frame} lobe ${index} clearance`,
          );
        });
        requireCondition(
          lobeContacts[0] + lobeContacts[1] === totalContact,
          `manifest ${skin}/${direction} frame ${frame} lobe contacts must sum to total contact`,
        );
        requireCondition(
          totalContact >= 2,
          `manifest ${skin}/${direction} frame ${frame} must retain planted contact`,
        );
        if (direction === "down" || direction === "up") {
          const phase = manifest.gait.phaseTable[frame];
          for (const lobe of [0, 1]) {
            const lift = phase[lobe === 0 ? 1 : 3];
            if (lift === 0) {
              requireCondition(
                lobeContacts[lobe] >= 2,
                `manifest ${skin}/${direction} frame ${frame} planted lobe ${lobe} must contact`,
              );
            } else {
              const minimumClearance = lift >= 1 ? 5 : 2;
              requireCondition(
                lobeClearances[lobe] >= minimumClearance,
                `manifest ${skin}/${direction} frame ${frame} swing lobe ${lobe} must clear ${minimumClearance}px`,
              );
            }
          }
        }
      }
      requireNonNegativeInteger(
        directionMetadata.postRigMattePixelsCorrected,
        `manifest ${skin}/${direction} postRigMattePixelsCorrected`,
      );
      const visualIntegrity = directionMetadata.decodedVisualIntegrity;
      requireCondition(
        isRecord(visualIntegrity),
        `manifest ${skin}/${direction} decodedVisualIntegrity must be an object`,
      );
      for (const field of ["transparentRgbPixels", "visibleGreenSpillPixels"]) {
        requireCondition(
          Array.isArray(visualIntegrity[field])
            && visualIntegrity[field].length === EXPECTED_FRAMES_PER_DIRECTION,
          `manifest ${skin}/${direction} ${field} must contain eight frames`,
        );
        visualIntegrity[field].forEach((value, frame) => {
          requireNonNegativeInteger(
            value,
            `manifest ${skin}/${direction} ${field}[${frame}]`,
          );
          requireCondition(
            value === 0,
            `manifest ${skin}/${direction} ${field}[${frame}] must be zero`,
          );
        });
      }
      requireCondition(
        Array.isArray(visualIntegrity.visiblePixelRatios)
          && visualIntegrity.visiblePixelRatios.length === EXPECTED_FRAMES_PER_DIRECTION,
        `manifest ${skin}/${direction} visiblePixelRatios must contain eight frames`,
      );
      visualIntegrity.visiblePixelRatios.forEach((value, frame) => {
        requireCondition(
          Number.isFinite(value) && value >= 0.80 && value <= 1.20,
          `manifest ${skin}/${direction} frame ${frame} visible pixel ratio is unsafe`,
        );
      });
      requireCondition(
        Array.isArray(visualIntegrity.decodedAlphaBounds)
          && visualIntegrity.decodedAlphaBounds.length === EXPECTED_FRAMES_PER_DIRECTION,
        `manifest ${skin}/${direction} decodedAlphaBounds must contain eight frames`,
      );
      for (const [frame, bounds] of visualIntegrity.decodedAlphaBounds.entries()) {
        requireCondition(
          Array.isArray(bounds)
            && bounds.length === 4
            && bounds.every(Number.isSafeInteger)
            && bounds[0] >= 0
            && bounds[1] >= 0
            && bounds[2] <= EXPECTED_FRAME_SIZE[0]
            && bounds[3] <= EXPECTED_FRAME_SIZE[1]
            && bounds[0] < bounds[2]
            && bounds[1] < bounds[3],
          `manifest ${skin}/${direction} frame ${frame} alpha bounds are invalid`,
        );
      }
      requirePositiveInteger(
        visualIntegrity.sourceBoundsMargin,
        `manifest ${skin}/${direction} sourceBoundsMargin`,
      );

      const staticName = `player-${skin}-direction-${direction}.png`;
      const atlasName = `player-${skin}-walk-${direction}.webp`;
      requireCondition(
        directionMetadata.atlas === atlasName,
        `manifest ${skin}/${direction} atlas must be ${atlasName}`,
      );
      const staticOutput = outputMetadata(manifest, staticName);
      const atlasOutput = outputMetadata(manifest, atlasName);
      requireCondition(
        dimensionsEqual(staticOutput.dimensions, EXPECTED_FRAME_SIZE),
        `${staticName} dimensions must match frameSize`,
      );
      requireCondition(
        dimensionsEqual(atlasOutput.dimensions, [
          EXPECTED_FRAME_SIZE[0] * 4,
          EXPECTED_FRAME_SIZE[1] * 2,
        ]),
        `${atlasName} must contain the 8 frames in a 4x2 atlas`,
      );
    }
    requireCondition(
      isRecord(skinMetadata.states),
      `manifest skin ${skin} states must be an object`,
    );
    requireNonNegativeInteger(
      skinMetadata.mattePixelsCorrected,
      `manifest skin ${skin} mattePixelsCorrected`,
    );
    if (skin === "pink") {
      for (const state of REQUIRED_PINK_STATES) {
        const stateMetadata = skinMetadata.states[state];
        const stateName = `player-pink-state-${state}.png`;
        requireCondition(
          isRecord(stateMetadata),
          `manifest pink state ${state} metadata is required`,
        );
        requireSha256(stateMetadata.sourceSha256, `manifest pink state ${state} sourceSha256`);
        requireCondition(
          stateMetadata.output === stateName,
          `manifest pink state ${state} output must be ${stateName}`,
        );
        requireNonNegativeInteger(
          stateMetadata.mattePixelsCorrected,
          `manifest pink state ${state} mattePixelsCorrected`,
        );
      }
    }
  }

  for (const state of REQUIRED_PINK_STATES) {
    const stateName = `player-pink-state-${state}.png`;
    const stateOutput = outputMetadata(manifest, stateName);
    requireCondition(
      dimensionsEqual(stateOutput.dimensions, EXPECTED_FRAME_SIZE),
      `${stateName} dimensions must match frameSize`,
    );
  }
}

function validateOutputEntry(fileName, metadata) {
  requireCondition(
    fileName !== ""
      && fileName === path.basename(fileName)
      && !fileName.includes("\0")
      && !fileName.startsWith("."),
    `manifest output has an unsafe file name: ${JSON.stringify(fileName)}`,
  );
  requireCondition(
    fileName.endsWith(".png") || fileName.endsWith(".webp"),
    `manifest output ${fileName} must be a PNG or WebP image`,
  );
  requireCondition(isRecord(metadata), `manifest output ${fileName} must be an object`);
  requireSha256(metadata.sha256, `manifest output ${fileName} sha256`);
  requirePositiveInteger(metadata.bytes, `manifest output ${fileName} bytes`);
  requireDimensions(metadata.dimensions, `manifest output ${fileName} dimensions`);
}

export async function verifyArtManifestDirectory({
  artDirectory,
  manifestPath = path.join(artDirectory, "art-manifest.json"),
  validateContract,
}) {
  requireCondition(
    typeof artDirectory === "string" && artDirectory !== "",
    "artDirectory is required",
  );
  requireCondition(
    typeof manifestPath === "string" && manifestPath !== "",
    "manifestPath is required",
  );

  const resolvedArtDirectory = path.resolve(artDirectory);
  const resolvedManifestPath = path.resolve(manifestPath);
  const manifestStat = await lstat(resolvedManifestPath);
  requireCondition(
    manifestStat.isFile() && !manifestStat.isSymbolicLink(),
    "art-manifest.json must be a regular file, not a symbolic link",
  );
  const manifestBytes = await readFile(resolvedManifestPath);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch (error) {
    throw new Error(`art-manifest.json is not valid JSON: ${error.message}`, { cause: error });
  }
  requireCondition(isRecord(manifest), "art-manifest.json must contain an object");
  requireCondition(isRecord(manifest.outputs), "art-manifest.json outputs must be an object");

  const outputEntries = Object.entries(manifest.outputs).sort(([left], [right]) => (
    left.localeCompare(right)
  ));
  requireCondition(outputEntries.length > 0, "art-manifest.json must declare at least one output");
  requireCondition(outputEntries.length <= 512, "art-manifest.json declares too many outputs");
  for (const [fileName, metadata] of outputEntries) validateOutputEntry(fileName, metadata);
  if (validateContract) validateContract(manifest);

  const directoryEntries = await readdir(resolvedArtDirectory, { withFileTypes: true });
  const expectedNames = new Set(["art-manifest.json", ...outputEntries.map(([name]) => name)]);
  for (const entry of directoryEntries) {
    requireCondition(
      expectedNames.has(entry.name),
      `${path.basename(resolvedArtDirectory)} contains undeclared entry ${entry.name}`,
    );
    requireCondition(
      entry.isFile() && !entry.isSymbolicLink(),
      `${path.basename(resolvedArtDirectory)} entry ${entry.name} must be a regular file, not a link or directory`,
    );
  }
  for (const expectedName of expectedNames) {
    requireCondition(
      directoryEntries.some((entry) => entry.name === expectedName),
      `${path.basename(resolvedArtDirectory)} is missing declared entry ${expectedName}`,
    );
  }

  const assets = [];
  let totalBytes = 0;
  for (const [fileName, metadata] of outputEntries) {
    const filePath = path.join(resolvedArtDirectory, fileName);
    const fileStat = await lstat(filePath);
    requireCondition(
      fileStat.isFile() && !fileStat.isSymbolicLink(),
      `${fileName} must be a regular file, not a symbolic link`,
    );
    const bytes = await readFile(filePath);
    requireCondition(
      bytes.length === metadata.bytes,
      `${fileName} byte length mismatch: expected ${metadata.bytes}, received ${bytes.length}`,
    );
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    requireCondition(
      sha256 === metadata.sha256,
      `${fileName} SHA-256 mismatch: expected ${metadata.sha256}, received ${sha256}`,
    );
    const image = readImageDimensions(bytes, fileName);
    const expectedFormat = path.extname(fileName).slice(1);
    requireCondition(
      image.format === expectedFormat,
      `${fileName} extension does not match its ${image.format.toUpperCase()} contents`,
    );
    requireCondition(
      dimensionsEqual(image.dimensions, metadata.dimensions),
      `${fileName} dimension mismatch: expected ${metadata.dimensions.join("x")}, received ${image.dimensions.join("x")}`,
    );
    totalBytes += bytes.length;
    assets.push(Object.freeze({
      name: fileName,
      path: filePath,
      sha256,
      bytes: bytes.length,
      dimensions: Object.freeze([...image.dimensions]),
      format: image.format,
    }));
  }

  return Object.freeze({
    artDirectory: resolvedArtDirectory,
    manifestPath: resolvedManifestPath,
    manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
    manifest,
    assets: Object.freeze(assets),
    assetCount: assets.length,
    totalBytes,
  });
}

/** A lossless declaration must agree with the actual WebP bitstream, including VP8X wrappers. */
export function verifyLosslessWebpEncoding(bytes, label = "clean plate") {
  requireCondition(readImageDimensions(bytes, label).format === "webp", `${label} must be WebP`);
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + length;
    requireCondition(end <= bytes.length, `${label} has a truncated ${type} chunk`);
    chunks.push(type);
    offset = end + length % 2;
  }
  requireCondition(offset === bytes.length, `${label} has invalid WebP chunk padding`);
  requireCondition(chunks.filter((type) => type === "VP8L").length === 1
    && !chunks.some((type) => ["VP8 ", "ANIM", "ANMF"].includes(type)),
  `${label} must contain one static lossless VP8L bitstream`);
  return true;
}

export function validateVirtualStudioLivingWorldArtManifestContract(manifest) {
  requireCondition(isRecord(manifest) && manifest.version === 1
    && manifest.kind === "virtual-studio-living-world", "living-world manifest version/kind is invalid");
  requireCondition(isRecord(manifest.outputs) && Object.keys(manifest.outputs).length === 1,
    "living-world must declare exactly the clean-plate output");
  const output = outputMetadata(manifest, LIVING_WORLD_BACKGROUND_NAME);
  requireCondition(dimensionsEqual(requireDimensions(output.dimensions, "living-world output dimensions"), LIVING_WORLD_DIMENSIONS),
    "living-world clean plate must retain its actual 1296x1213 dimensions");
  requireCondition(isRecord(manifest.background)
    && manifest.background.output === LIVING_WORLD_BACKGROUND_NAME
    && manifest.background.runtimeUrl === LIVING_WORLD_BACKGROUND_URL,
  "living-world background must identify the clean-plate asset and runtime URL");
  requireCondition(manifest.background.technique === "imagegen edit of the existing authored background"
    && manifest.background.referencePixelIdentity === false && manifest.background.singleFlattenedLayer === true,
  "living-world must disclose imagegen editing, changed reference pixels and the flattened layer");
  requireCondition(isRecord(manifest.provenance) && isRecord(manifest.provenance.reference)
    && manifest.provenance.reference.path === "../production-v2/master-central-lossless.webp",
  "living-world reference must be the preserved production-v2 background");
  const reference = manifest.provenance.reference;
  requireSha256(reference.sha256, "living-world reference sha256");
  requirePositiveInteger(reference.bytes, "living-world reference bytes");
  requireCondition(dimensionsEqual(requireDimensions(reference.dimensions, "living-world reference dimensions"), [869, 813]),
    "living-world reference dimensions must remain 869x813");
  const original = manifest.provenance.originalAuthoredMaster;
  requireCondition(isRecord(original) && original.sourcePixelsReverified === false,
    "living-world must not claim the private authored master was reverified");
  requireSha256(original.sourceSha256, "living-world original authored master sha256");
  const generation = manifest.provenance.generation;
  requireCondition(isRecord(generation) && generation.tool === "image_gen" && generation.mode === "edit"
    && generation.outputStoredInRepository === false && typeof generation.promptSummary === "string"
    && generation.promptSummary.length > 0, "living-world imagegen provenance is required");
  requireSha256(generation.outputSha256, "living-world generated PNG sha256");
  requirePositiveInteger(generation.outputBytes, "living-world generated PNG bytes");
  requireCondition(dimensionsEqual(requireDimensions(generation.outputDimensions, "living-world generated PNG dimensions"), LIVING_WORLD_DIMENSIONS),
    "living-world generated PNG must match the clean-plate dimensions");
  const encoding = manifest.provenance.encoding;
  requireCondition(isRecord(encoding) && encoding.tool === "cwebp" && encoding.lossless === true
    && encoding.generatedPngPixelsCompared === true,
  "living-world must record lossless encoding and the preparation-time PNG pixel comparison");
  requireSha256(encoding.decodedRgbaSha256, "living-world recorded decoded RGBA sha256");
  for (const limitation of [
    "generated clean plate, not pixel-identical to the authored reference",
    "occluded floor and furniture pixels were reconstructed by image generation",
    "single flattened background, not independently movable furniture layers",
    "generated PNG pixel comparison is a recorded preparation check, not repeated by the repository verifier",
    "existing character animation remains cutout-rig deformation, not redrawn poses",
  ]) {
    requireCondition(Array.isArray(manifest.limitations) && manifest.limitations.includes(limitation),
      `living-world must disclose limitation: ${limitation}`);
  }
}

/** Ensure the generated authoring world, its generator, and the runtime bind the verified asset. */
export async function verifyVirtualStudioLivingWorldBindings({
  worldPath = path.resolve(scriptDirectory, "../apps/web/public/assets/virtual-studio/world/default-world.json"),
  generatorPath = path.resolve(scriptDirectory, "generate-virtual-studio-default-world.mts"),
  runtimePath = path.resolve(scriptDirectory, "../apps/web/src/domains/creator/virtual-space/studio-virtual-space-world-manifest.ts"),
} = {}) {
  const world = JSON.parse(await readFile(worldPath, "utf8"));
  const layer = world.layers?.find((entry) => entry.name === "background" && entry.type === "imagelayer");
  const backgroundUrl = world.properties?.find((entry) => entry.name === "backgroundUrl")?.value;
  requireCondition(backgroundUrl === LIVING_WORLD_BACKGROUND_URL
    && layer?.image === `../living-world/${LIVING_WORLD_BACKGROUND_NAME}`
    && layer.imagewidth === LIVING_WORLD_DIMENSIONS[0] && layer.imageheight === LIVING_WORLD_DIMENSIONS[1],
  "generated default world must reference the verified clean plate and its actual dimensions");
  const generator = await readFile(generatorPath, "utf8");
  requireCondition(generator.includes(`image: "../living-world/${LIVING_WORLD_BACKGROUND_NAME}"`)
    && /imagewidth:\s*1296\b/u.test(generator) && /imageheight:\s*1213\b/u.test(generator),
  "default-world generator must retain the verified clean-plate path and dimensions");
  const runtime = await readFile(runtimePath, "utf8");
  requireCondition(runtime.includes(`backgroundUrl: "${LIVING_WORLD_BACKGROUND_URL}"`),
    "runtime default manifest must use the verified clean-plate URL");
  return true;
}

export async function verifyVirtualStudioLivingWorldArtManifest({
  artDirectory = VIRTUAL_STUDIO_LIVING_WORLD_ART_DIRECTORY,
  productionArtDirectory = VIRTUAL_STUDIO_PRODUCTION_ART_DIRECTORY,
} = {}) {
  const result = await verifyArtManifestDirectory({ artDirectory, validateContract: validateVirtualStudioLivingWorldArtManifestContract });
  const output = result.assets[0];
  verifyLosslessWebpEncoding(await readFile(output.path), LIVING_WORLD_BACKGROUND_NAME);
  const referencePath = path.join(productionArtDirectory, "master-central-lossless.webp");
  const referenceStat = await lstat(referencePath);
  requireCondition(referenceStat.isFile() && !referenceStat.isSymbolicLink(), "living-world reference must be a regular file");
  const referenceBytes = await readFile(referencePath);
  const reference = result.manifest.provenance.reference;
  requireCondition(referenceBytes.length === reference.bytes
    && createHash("sha256").update(referenceBytes).digest("hex") === reference.sha256
    && dimensionsEqual(readImageDimensions(referenceBytes).dimensions, reference.dimensions),
  "living-world reference SHA-256, bytes or dimensions do not match the preserved production background");
  const productionManifest = JSON.parse(await readFile(path.join(productionArtDirectory, "art-manifest.json"), "utf8"));
  requireCondition(productionManifest.background.sourceSha256 === result.manifest.provenance.originalAuthoredMaster.sourceSha256,
    "living-world original authored master provenance must match production-v2");
  await verifyVirtualStudioLivingWorldBindings();
  return Object.freeze({ ...result, outputIntegrityVerified: true, losslessWebpVerified: true,
    referenceOutputIntegrityVerified: true, runtimeBindingsVerified: true,
    generatedPngPixelsReverifiedThisRun: false, privateApprovedMasterSourceReverified: false });
}

export async function verifyVirtualStudioArtManifest({
  artDirectory = VIRTUAL_STUDIO_PRODUCTION_ART_DIRECTORY,
  manifestPath = path.join(artDirectory, "art-manifest.json"),
} = {}) {
  const result = await verifyArtManifestDirectory({
    artDirectory,
    manifestPath,
    validateContract: validateVirtualStudioArtManifestContract,
  });
  const generatorPath = path.resolve(
    scriptDirectory,
    "..",
    result.manifest.generator.path,
  );
  const generatorStat = await lstat(generatorPath);
  requireCondition(
    generatorStat.isFile() && !generatorStat.isSymbolicLink(),
    "manifest generator must resolve to a regular checked-in file",
  );
  const generatorSha256 = createHash("sha256")
    .update(await readFile(generatorPath))
    .digest("hex");
  requireCondition(
    generatorSha256 === result.manifest.generator.sha256,
    "art generator SHA-256 does not match the manifest",
  );
  const livingWorld = await verifyVirtualStudioLivingWorldArtManifest({ productionArtDirectory: artDirectory });
  const atlasQuality = REQUIRED_SKINS.flatMap((skin) => (
    REQUIRED_DIRECTIONS.map((direction) => (
      result.manifest.skins[skin].directions[direction]
    ))
  ));
  const minimumPairwiseVisibleDifferencePixels = Math.min(
    ...atlasQuality.map((metadata) => metadata.minimumPairwiseVisibleDifferencePixels),
  );
  const privateApprovedMasterSourceReverified =
    result.manifest.background.sourcePixelsComparedThisBuild;
  return Object.freeze({
    ...result,
    livingWorld,
    outputIntegrityVerified: true,
    privateApprovedMasterSourceReverified,
    backgroundProvenanceMode: result.manifest.background.provenanceMode,
    backgroundOutputIntegrityVerifiedThisBuild:
      result.manifest.background.outputIntegrityVerifiedThisBuild,
    generatorSha256,
    minimumPairwiseVisibleDifferencePixels,
    recordedLosslessPixelVerification: result.manifest.background.losslessPixelVerified === true,
    bakedOccupants: result.manifest.background.bakedOccupants === true,
    animationTechnique: result.manifest.animationTechnique,
  });
}

async function main() {
  const result = await verifyVirtualStudioArtManifest();
  const sourceVerification = result.privateApprovedMasterSourceReverified
    ? "The private approved master source was reverified in this build."
    : "The private approved master source was not reverified in this build.";
  console.log(
    `Virtual Studio art integrity OK: ${result.assetCount} preserved production assets + ${result.livingWorld.assetCount} living-world clean plate, ${result.totalBytes + result.livingWorld.totalBytes} bytes; `
      + "output SHA-256, byte lengths, and dimensions match art-manifest.json; "
      + `minimum decoded pairwise difference is ${result.minimumPairwiseVisibleDifferencePixels} pixels. `
      + "Living-world output/reference integrity, static lossless VP8L and runtime bindings verified. "
      + "Generated PNG pixel identity is a recorded preparation check. "
      + sourceVerification,
  );
}

const invoked = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
