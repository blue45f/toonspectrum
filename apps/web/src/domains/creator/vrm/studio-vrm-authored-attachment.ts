import type { Object3D } from "three";

const ATTACHMENT_NAME = /^(wardrobe:(outer|top|bottom|shoes)\b|prop:)/u;

/** Never measure the wardrobe itself as the imported character's body. */
export function isStudioAuthoredAttachment(object: Object3D): boolean {
  let node: Object3D | null = object;
  for (let depth = 0; node && depth < 32; depth += 1) {
    if (ATTACHMENT_NAME.test(node.name)) return true;
    node = node.parent;
  }
  return false;
}
