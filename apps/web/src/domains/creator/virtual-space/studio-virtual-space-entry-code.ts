/**
 * 입장코드 + QR 초대 (E-6).
 *
 * ZEP 모델: 스페이스별 6자리 입장코드를 발급하고, 게스트는 코드 입력만으로
 * 입장한다(가입·로그인 불필요). 초대 링크(A-1 `#invite=<토큰>`), 6자리 코드,
 * QR 3종을 초대 시트에서 함께 제공한다.
 *
 * 서버 검증이 없으므로 코드는 클라이언트 UX 가드다. 실제 권위 있는 검증은
 * 서버 어댑터의 후속 작업에서 처리한다.
 */

import { toDataURL } from "qrcode";

/** 혼동 문자(0/O/1/I)를 제외한 32자 알파벳. */
export const STUDIO_ENTRY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const STUDIO_ENTRY_CODE_LENGTH = 6;

/** 입장코드 기본 유효기간: 30일. */
export const STUDIO_ENTRY_CODE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/u;

/**
 * 6자리 입장코드 생성. `pick`을 주입하면 결정적으로 생성한다(테스트용).
 * 기본은 crypto.getRandomValues, 실패 시 Math.random 폴백.
 */
export function createEntryCode(pick?: (index: number) => number): string {
  const alphabet = STUDIO_ENTRY_CODE_ALPHABET;
  const choose =
    pick ??
    ((_index: number): number => {
      try {
        const values = new Uint32Array(1);
        globalThis.crypto.getRandomValues(values);
        return (values[0] as number) % alphabet.length;
      } catch {
        return Math.floor(Math.random() * alphabet.length);
      }
    });
  let code = "";
  for (let index = 0; index < STUDIO_ENTRY_CODE_LENGTH; index += 1) {
    code += alphabet[choose(index) % alphabet.length];
  }
  return code;
}

/** 입장코드 형식 검증: 6자리 + 허용 알파벳만. */
export function isEntryCodeValid(code: string): boolean {
  return CODE_PATTERN.test(code.trim().toUpperCase());
}

export interface StudioEntryCodeRecord {
  readonly code: string;
  readonly spaceId: string;
  readonly spaceName: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

/** 입장코드 발급 기록 생성. */
export function createEntryCodeRecord(input: {
  readonly code: string;
  readonly spaceId: string;
  readonly spaceName: string;
  readonly now?: number;
  readonly ttlMs?: number;
}): StudioEntryCodeRecord | null {
  const code = input.code.trim().toUpperCase();
  if (!isEntryCodeValid(code)) return null;
  const spaceId = input.spaceId.trim();
  const spaceName = input.spaceName.trim().slice(0, 40);
  if (!spaceId || !spaceName) return null;
  const now = Number.isFinite(input.now) ? (input.now as number) : Date.now();
  const ttlMs = Number.isFinite(input.ttlMs) && (input.ttlMs as number) > 0 ? (input.ttlMs as number) : STUDIO_ENTRY_CODE_TTL_MS;
  return Object.freeze({ code, spaceId, spaceName, issuedAt: now, expiresAt: now + ttlMs });
}

/** 코드 기록 유효성: 형식 + 만료 검사. */
export function isEntryCodeRecordValid(record: StudioEntryCodeRecord, now: number = Date.now()): boolean {
  return isEntryCodeValid(record.code) && now >= record.issuedAt && now < record.expiresAt;
}

/** 코드 초대 프래그먼트: `#code=ABC123`. A-1 `#invite=` 형식과 나란히 쓴다. */
export function buildCodeInviteFragment(code: string): string {
  return `#code=${code.trim().toUpperCase()}`;
}

/** 프래그먼트에서 입장코드를 파싱한다. 형식이 맞지 않으면 null. */
export function parseCodeInviteFragment(hash: string): string | null {
  const fragment = new URLSearchParams(hash.replace(/^#/u, ""));
  const code = fragment.get("code");
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return isEntryCodeValid(normalized) ? normalized : null;
}

/** 입장 URL(코드 포함)을 QR PNG data URL로 렌더한다. 클라이언트 렌더 전용. */
export async function renderEntryCodeQrDataUrl(text: string): Promise<string> {
  return toDataURL(text, { width: 200, margin: 1 });
}
