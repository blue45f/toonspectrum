import {
  
  isAbsolute,
} from "node:path";



export const TOONBRIDGE_SYNC_SCHEMA_VERSION = 1;
export const TOONBRIDGE_SYNC_STATE_DIRECTORY = ".toonstudio-sync";
export const TOONBRIDGE_SYNC_MANIFEST = "manifest.json";




function syncError(message, code) {
  return Object.assign(new Error(message), { code });
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


