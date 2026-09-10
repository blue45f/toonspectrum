import { readFileSync, writeFileSync } from "node:fs";

const path = "apps/web/src/domains/creator/studio-autosave-opfs-session.ts";
let source = readFileSync(path, "utf8");

const importAnchor = 'import { sha256HexPortable } from "./studio-sha256";\n';
const importLine = 'import { shouldPreferStudioPendingStrokeEmergencyRecovery } from "./studio-pending-stroke-recovery";\n';
if (!source.includes(importLine)) {
  const parts = source.split(importAnchor);
  if (parts.length !== 2) throw new Error("unexpected sha256 import anchor count");
  source = parts.join(importLine + importAnchor);
}

const winnerAnchor = [
  "  if (",
  "    compatibilityCandidate === null",
  "    || timestamp(compatibilityCandidate.savedAt) <= timestamp(winner.savedAt)",
  "  ) {",
  "",
].join("\n");
const recoveryBlock = [
  "  if (",
  "    compatibilityCandidate",
  "    && shouldPreferStudioPendingStrokeEmergencyRecovery(",
  "      winner.payload!,",
  "      compatibilityCandidate.payload,",
  "    )",
  "  ) {",
  "    return Object.freeze({",
  "      candidate: compatibilityCandidate,",
  "      compatibilityCandidate,",
  '      authority: "browser-storage-compatibility",',
  '      durability: "compatibility-only",',
  "      migratedToOpfs,",
  "    });",
  "  }",
  "",
].join("\n");
if (!source.includes(recoveryBlock)) {
  const parts = source.split(winnerAnchor);
  if (parts.length !== 2) throw new Error("unexpected compatibility winner anchor count");
  source = parts.join(recoveryBlock + winnerAnchor);
}

writeFileSync(path, source);
