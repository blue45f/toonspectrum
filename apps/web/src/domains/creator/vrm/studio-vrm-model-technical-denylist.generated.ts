/** Generated from deployment-owned glTF/VRM files. */
export const STUDIO_VRM_TECHNICAL_MODEL_REJECTIONS = Object.freeze({
} as const);

const REJECTED_IDS = new Set<string>(Object.keys(STUDIO_VRM_TECHNICAL_MODEL_REJECTIONS));

export function isStudioVrmTechnicallyAdmittedModel(id: string): boolean {
  return !REJECTED_IDS.has(id);
}
