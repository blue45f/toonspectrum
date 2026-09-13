/** Rebuild the original, document-safe R8 material atlas; no third-party images are downloaded. */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  materializeStudioMaterialTipBytes,
  STUDIO_MATERIAL_TIP_PROGRAMS,
  studioMaterialIdentitySeed,
} from "../apps/web/src/domains/creator/brush/studio-material-tip-kernels";

const atlas = Object.fromEntries(STUDIO_MATERIAL_TIP_PROGRAMS.map((program) => [
  program,
  Buffer.from(materializeStudioMaterialTipBytes(
    program, 64, studioMaterialIdentitySeed(`material-${program}`),
  )).toString("base64"),
]));
writeFileSync(
  fileURLToPath(new URL("../apps/web/src/domains/creator/brush/studio-material-tip-atlas.generated.json", import.meta.url)),
  `${JSON.stringify(atlas, null, 2)}\n`,
);
console.log(`Compiled ${STUDIO_MATERIAL_TIP_PROGRAMS.length} original material fields to portable 64x64 R8.`);
