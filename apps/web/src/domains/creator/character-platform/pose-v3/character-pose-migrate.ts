import {
  validateCharacterPoseDocumentV3,
  type CharacterPoseDocumentV3,
} from "./character-pose-v3";

import type { CharacterPoseCandidateV2 } from "../pose/character-pose-v2";

export function migrateCharacterPoseV2ToV3(
  input: CharacterPoseCandidateV2,
): CharacterPoseDocumentV3 {
  return validateCharacterPoseDocumentV3({
    schemaVersion: 3,
    poseId: input.candidateId,
    generationId: input.generationId,
    source: input.source,
    root: input.root,
    bones: input.bones,
    confidence: input.confidence,
    effectors: [],
    contacts: input.contacts.map((contact) => ({
      id: contact.id,
      kind: contact.kind,
      bone: contact.bone,
      targetId: contact.targetId,
      target: contact.target,
      weight: contact.weight,
      tolerance: contact.tolerance,
      mode: contact.kind === "ground" ? "support" : "soft-point",
    })),
    fixedControllers: [],
    regionWeights: {},
    stylization: {
      exaggeration: 0,
      silhouetteWeight: 0,
      preserveFootPlant: true,
      dramaticImbalance: false,
    },
    sourceWarnings: input.warnings,
    solveReceipt: null,
    legacySource: input,
  });
}
