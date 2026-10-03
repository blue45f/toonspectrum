import { Check, Copy } from "lucide-react";
import { useState } from "react";

import type { ApiKeyExpiryStatus } from "./api-key-hub-model";

/**
 * 저장된 키 한 건의 행 — 마스킹 값만 표시하고 원문은 절대 렌더하지 않는다.
 * `onCopy`는 부모가 원문을 클립보드에 쓰는 책임을 진다(원문을 이 컴포넌트에 전달하지 않는다).
 *
 * 벤치마킹: GitHub PAT 목록(마스킹 + 마지막 사용), Vercel 환경변수(값 숨김 + 복사 버튼).
 */
export function StoredKeyRow({
  label,
  masked,
  meta,
  expiry,
  expiryLabel,
  onCopy,
  onRemove,
}: {
  label: string;
  /** maskApiKey()로 마스킹된 표시값 */
  masked: string;
  /** 권한 범위·마지막 사용 등 부가 설명 */
  meta?: string;
  /** 만료 상태 — 있으면 배지로 표시한다 */
  expiry?: ApiKeyExpiryStatus | null;
  /** apiKeyExpiryLabel() 결과 문구 */
  expiryLabel?: string | null;
  onCopy: () => Promise<boolean>;
  onRemove: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function handleCopy() {
    const ok = await onCopy();
    if (ok) {
      setCopyFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      // 복사 실패를 침묵하면 사용자는 키가 복사된 줄 안다 — 실패도 눈에 보이게 알린다.
      setCopied(false);
      setCopyFailed(true);
      window.setTimeout(() => setCopyFailed(false), 3000);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-fg">{label}</span>
        <code className="font-mono text-sm text-fg-2" aria-label={`${label} 마스킹된 키`}>
          {masked}
        </code>
        {meta ? <span className="mt-0.5 block text-[0.7rem] text-fg-3">{meta}</span> : null}
        {expiry && expiry !== "ok" && expiryLabel ? (
          <span
            role="status"
            className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${
              expiry === "expired" ? "bg-bad/10 text-bad" : "bg-warn/10 text-warn"
            }`}
          >
            {expiryLabel}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        aria-label={`${label} 복사`}
      >
        {copied ? <Check size={14} className="text-good" aria-hidden /> : <Copy size={14} aria-hidden />}
        {copied ? "복사됨" : copyFailed ? "복사 실패" : "복사"}
      </button>
      {copyFailed ? (
        <span role="alert" className="w-full text-[0.7rem] font-medium text-bad">
          클립보드에 복사하지 못했어요. 브라우저의 클립보드 권한을 확인해 주세요.
        </span>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex min-h-10 items-center rounded-lg border border-line px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-bad focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        aria-label={`${label} 연결 해제`}
      >
        해제
      </button>
    </div>
  );
}
