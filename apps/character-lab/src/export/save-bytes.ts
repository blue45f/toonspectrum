/**
 * 바이트 다운로드(순수 코어). DOM 바인딩은 download.browser.ts. Blob URL은 어떤 경로에서도 **정확히 한 번** revoke된다:
 * 클릭 성공 → revokeDelayMs 뒤 예약 revoke, 클릭 실패 → 즉시 revoke + LabFailure.
 */
import { failVisible } from "../contracts";

import type { LabFailure } from "../contracts";

export interface SaveBytesPorts {
  createObjectUrl(bytes: Uint8Array, mime: string): string;
  revokeObjectUrl(url: string): void;
  /** `<a download>` 클릭 등 실제 저장 트리거 */
  triggerDownload(url: string, fileName: string): void;
  schedule(callback: () => void, delayMs: number): void;
}

export interface SaveBytesOptions {
  /** 클릭 뒤 URL revoke까지 대기(ms). 브라우저가 다운로드를 시작할 시간을 준다. */
  readonly revokeDelayMs?: number;
  readonly now?: number;
}

export type SaveBytesResult =
  | { readonly ok: true; readonly fileName: string; readonly bytes: number; readonly url: string }
  | { readonly ok: false; readonly failure: LabFailure };

export type SaveBytesFn = (fileName: string, bytes: Uint8Array, mime: string) => SaveBytesResult;

export const DEFAULT_REVOKE_DELAY_MS = 1000;

/** C0 제어 문자(U+0000..U+001F)와 DEL(U+007F)을 제거한다(정규식 제어 문자 리터럴 대신 코드 포인트 비교). */
function stripControlCharacters(name: string): string {
  let out = "";
  for (const char of name) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue;
    out += char;
  }
  return out;
}

/** 파일명에서 경로 구분자·제어 문자를 제거하고 비면 "export"로 둔다. */
export function sanitizeFileName(name: string): string {
  const cleaned = stripControlCharacters(name.replace(/[\\/:*?"<>|]/gu, "_")).trim();
  return cleaned.length === 0 ? "export" : cleaned;
}

export function saveBytesWith(ports: SaveBytesPorts, fileName: string, bytes: Uint8Array, mime: string, options: SaveBytesOptions = {}): SaveBytesResult {
  const safeName = sanitizeFileName(fileName);
  if (bytes.length === 0) {
    return { ok: false, failure: failVisible("save-empty", `${safeName}: 저장할 바이트가 없습니다.`, undefined, options.now) };
  }
  let url: string;
  try {
    url = ports.createObjectUrl(bytes, mime);
  } catch (error) {
    return { ok: false, failure: failVisible("save-object-url", `${safeName}: Blob URL을 만들 수 없습니다.`, error, options.now) };
  }
  let revoked = false;
  const revokeOnce = (): void => {
    if (revoked) return;
    revoked = true;
    ports.revokeObjectUrl(url);
  };
  try {
    ports.triggerDownload(url, safeName);
  } catch (error) {
    revokeOnce();
    return { ok: false, failure: failVisible("save-trigger", `${safeName}: 다운로드를 시작할 수 없습니다.`, error, options.now) };
  }
  ports.schedule(revokeOnce, options.revokeDelayMs ?? DEFAULT_REVOKE_DELAY_MS);
  return { ok: true, fileName: safeName, bytes: bytes.length, url };
}
