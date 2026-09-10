/** Generated from deployment-owned glTF/VRM files. */
export const STUDIO_VRM_TECHNICAL_MODEL_REJECTIONS = Object.freeze({
  "avatar-a": "validator-errors",
  "avatar-b": "validator-errors",
  "avatar-c": "primitives",
  "bao-samurai": "validator-errors",
  "blue-pixie": "validator-errors",
  "bot-bunny": "validator-errors",
  "cosmic-bot": "validator-errors",
  "crowley": "validator-errors",
  "cute-saurus": "validator-errors",
  "eugenia": "validator-errors",
  "good-knight": "validator-errors",
  "kage": "validator-errors",
  "lady-fawn": "validator-errors",
  "lady-koi": "validator-errors",
  "lil-ram": "validator-errors",
  "mega-angel": "validator-errors",
  "mushroom-fairy": "validator-errors",
  "rubin": "validator-errors",
  "shino": "validator-errors",
  "shion": "validator-errors",
  "stitch-witch": "validator-errors",
  "strawberry-princess": "validator-errors",
  "vita": "validator-errors",
  "weird-cat": "validator-errors",
  "yeti-dude": "validator-errors",
} as const);

const REJECTED_IDS = new Set<string>(Object.keys(STUDIO_VRM_TECHNICAL_MODEL_REJECTIONS));

export function isStudioVrmTechnicallyAdmittedModel(id: string): boolean {
  return !REJECTED_IDS.has(id);
}
