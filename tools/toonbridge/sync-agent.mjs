import { createHash, randomUUID } from "node:crypto";
import { watch } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import { hashFileStream } from "./file-integrity.mjs";

export const TOONBRIDGE_SYNC_SCHEMA_VERSION = 1;
export const TOONBRIDGE_SYNC_STATE_DIRECTORY = ".toonstudio-sync";
export const TOONBRIDGE_SYNC_MANIFEST = "manifest.json";

const SAFE_PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

function syncError(message, code) {
  return Object.assign(new Error(message), { code });
}

function assertInside(root, candidate) {
  const absoluteRoot = resolve(root);
  const absoluteCandidate = resolve(candidate);
  if (
    absoluteCandidate !== absoluteRoot
    && !absoluteCandidate.startsWith(`${absoluteRoot}${sep}`)
  ) {
    throw syncError("Sync path escapes the bound folder", "SYNC_PATH_ESCAPE");
  }
  return absoluteCandidate;
}

export function normalizeSyncRelativePath(value) {
  const raw = String(value ?? "").normalize("NFC").replaceAll("\\", "/");
  if (!raw || raw.includes("\0") || isAbsolute(raw) || /^[A-Za-z]:\//u.test(raw)) {
    throw syncError("Sync path must be relative", "SYNC_PATH_INVALID");
  }
  const segments = raw.replace(/^\.\//u, "").split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw syncError("Sync path contains an unsafe segment", "SYNC_PATH_INVALID");
  }
  if (segments[0] === TOONBRIDGE_SYNC_STATE_DIRECTORY) {
    throw syncError("Sync metadata cannot be synchronized as project content", "SYNC_PATH_INTERNAL");
  }
  return segments.join("/");
}

function digestOperation(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}
