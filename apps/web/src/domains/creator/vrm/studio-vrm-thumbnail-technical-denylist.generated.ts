/** Generated from deployment-owned thumbnail files. */
export const STUDIO_VRM_TECHNICAL_THUMBNAIL_REJECTIONS = Object.freeze({

} as const);

const REJECTED_IDS = new Set<string>(
  Object.keys(STUDIO_VRM_TECHNICAL_THUMBNAIL_REJECTIONS),
);

export function isStudioVrmTechnicallyAdmittedThumbnail(id: string): boolean {
  return !REJECTED_IDS.has(id);
}
