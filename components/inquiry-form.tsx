import { CheckCircle2, Send } from "lucide-react";
import { useId, useState } from "react";

import { resolveApiError, safeParseJson } from "@/lib/http-safe";
import {
  INQUIRY_BODY_MAX,
  INQUIRY_CATEGORIES,
  INQUIRY_TITLE_MAX,
  validateInquiryInput,
  type InquiryCategory,
} from "@/lib/inquiry";

// 인앱 문의 폼 — /contact·/feedback 공용. 자체 API(/api/support/inquiries)가 검증·허니팟 처리 후
// TermsDesk 비공개 문의함으로 전달한다(공개 게시판과 달리 본문이 외부에 노출되지 않음).
// website 필드는 허니팟: 사람에겐 보이지 않고, 채워지면 서버가 조용히 폐기한다.
export function InquiryForm({ defaultCategory = "contact" }: { defaultCategory?: InquiryCategory }) {
  const formId = useId();
  const [category, setCategory] = useState<InquiryCategory>(defaultCategory);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState(""); // 허니팟
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const selectedCategory = INQUIRY_CATEGORIES.find((item) => item.value === category);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (sending) return;
    const parsed = validateInquiryInput({ category, title, body, contact, website });
    if (parsed.error || !parsed.value) {
      setError(parsed.error ?? "문의 내용을 확인해 주세요.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/support/inquiries", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.value),
      });
      if (!res.ok) {
        const data = await safeParseJson<unknown>(res);
        setError(resolveApiError(data, "문의를 접수하지 못했어요. 잠시 후 다시 시도해 주세요."));
        return;
      }
      setDone(true);
    } catch {
      setError("문의를 접수하지 못했어요. 네트워크 상태를 확인해 주세요.");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-good/40 bg-good/10 px-5 py-8 text-center" role="status">
        <CheckCircle2 className="mx-auto mb-2 text-good" size={24} />
        <p className="text-sm font-semibold text-fg">문의가 접수됐어요.</p>
        <p className="mt-1 text-xs leading-relaxed text-fg-3">
          운영팀이 확인 후 처리합니다. 연락처를 남기셨다면 해당 연락처로 답변드려요.
        </p>
        <button
          type="button"
          onClick={() => {
            setDone(false);
            setTitle("");
            setBody("");
            setContact("");
          }}
          className="mt-4 rounded-lg border border-line bg-card px-3 py-2 text-xs font-medium text-fg-2 transition-colors hover:text-fg"
        >
          새 문의 작성
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3" aria-label="인앱 문의 폼">
      <div>
        <label htmlFor={`${formId}-category`} className="mb-1 block text-xs text-fg-3">
          문의 유형
        </label>
        <select
          id={`${formId}-category`}
          value={category}
          onChange={(event) => setCategory(event.target.value as InquiryCategory)}
          className="w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg outline-none focus:border-accent/50"
        >
          {INQUIRY_CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        {selectedCategory && <p className="mt-1 text-[0.7rem] text-fg-3">{selectedCategory.description}</p>}
      </div>
      <div>
        <label htmlFor={`${formId}-title`} className="mb-1 block text-xs text-fg-3">
          제목
        </label>
        <input
          id={`${formId}-title`}
          value={title}
          onChange={(event) => setTitle(event.target.value.slice(0, INQUIRY_TITLE_MAX))}
          maxLength={INQUIRY_TITLE_MAX}
          placeholder="문의 제목"
          className="w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg outline-none focus:border-accent/50"
        />
      </div>
      <div>
        <label htmlFor={`${formId}-body`} className="mb-1 block text-xs text-fg-3">
          내용
        </label>
        <textarea
          id={`${formId}-body`}
          value={body}
          onChange={(event) => setBody(event.target.value.slice(0, INQUIRY_BODY_MAX))}
          maxLength={INQUIRY_BODY_MAX}
          rows={5}
          placeholder="문의 내용을 자세히 적어주세요. (10자 이상)"
          className="w-full resize-none rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg outline-none focus:border-accent/50"
        />
        <p className="mt-1 text-right text-[0.68rem] text-fg-3">
          {body.length}/{INQUIRY_BODY_MAX}
        </p>
      </div>
      <div>
        <label htmlFor={`${formId}-contact`} className="mb-1 block text-xs text-fg-3">
          답변 받을 연락처 <span className="text-fg-3/70">(선택 — 이메일 권장)</span>
        </label>
        <input
          id={`${formId}-contact`}
          value={contact}
          onChange={(event) => setContact(event.target.value.slice(0, 160))}
          maxLength={160}
          autoComplete="email"
          placeholder="you@example.com"
          className="w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg outline-none focus:border-accent/50"
        />
      </div>
      {/* 허니팟 — 시각적으로 숨김. 자동입력 봇이 채우면 서버가 전송을 폐기한다. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor={`${formId}-website`}>웹사이트 (비워 두세요)</label>
        <input
          id={`${formId}-website`}
          name="website"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      {error && (
        <p className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={sending || title.trim().length < 2 || body.trim().length < 10}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Send size={14} />
        {sending ? "접수 중..." : "문의 보내기"}
      </button>
      <p className="text-[0.68rem] leading-relaxed text-fg-3">
        접수된 문의는 운영팀 전용 보드(TermsDesk)로 비공개 전달되며, 게시판에 공개되지 않습니다.
      </p>
    </form>
  );
}
