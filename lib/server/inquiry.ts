// 인앱 문의 서버 포워더 — 검증/허니팟 처리 후 TermsDesk 공개 문의함으로 서버 간 전달.
// (termsdesk는 브라우저 CORS 프리플라이트를 받지 않아 클라이언트 직접 POST가 불가.)
import {
  buildInquiryPayload,
  isHoneypotTripped,
  TERMSDESK_INQUIRY_ENDPOINT,
  validateInquiryInput,
} from "../inquiry";

export interface InquiryForwardResult {
  ok: boolean;
  /** 허니팟에 걸려 전송을 생략한 경우 true(응답은 성공과 동일하게 위장). */
  dropped?: boolean;
  error?: string;
  status?: number;
}

export async function forwardInquiry(input: unknown): Promise<InquiryForwardResult> {
  const parsed = validateInquiryInput(input);
  if (parsed.error || !parsed.value) return { ok: false, error: parsed.error ?? "문의 내용을 확인해 주세요.", status: 400 };
  if (isHoneypotTripped(parsed.value)) return { ok: true, dropped: true };

  const payload = buildInquiryPayload(parsed.value);
  try {
    const res = await fetch(TERMSDESK_INQUIRY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    if (res.status === 429) {
      return { ok: false, status: 429, error: "문의가 너무 잦아요. 잠시 후 다시 시도해 주세요." };
    }
    return { ok: false, status: 502, error: "문의 접수처가 응답하지 않아요. 잠시 후 다시 시도해 주세요." };
  } catch {
    return { ok: false, status: 502, error: "문의 접수처에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
}
