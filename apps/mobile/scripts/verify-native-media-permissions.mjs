import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function requireText(source, text, label) {
  if (!source.includes(text)) {
    throw new Error(`Missing ${label}: ${text}`);
  }
}

const android = read("android/app/src/main/AndroidManifest.xml");
for (const permission of [
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO",
  "android.permission.MODIFY_AUDIO_SETTINGS",
]) {
  requireText(android, `android:name="${permission}"`, `Android permission ${permission}`);
}

const ios = read("ios/App/App/Info.plist");
for (const key of ["NSCameraUsageDescription", "NSMicrophoneUsageDescription"]) {
  requireText(ios, `<key>${key}</key>`, `iOS usage description ${key}`);
  const match = ios.match(new RegExp(
    `<key>${key}</key>\\s*<string>([^<]+)</string>`,
    "u",
  ));
  if (!match?.[1]?.trim()) {
    throw new Error(`iOS usage description ${key} must not be empty`);
  }
}

console.log("mobile native media permission declarations are present");
