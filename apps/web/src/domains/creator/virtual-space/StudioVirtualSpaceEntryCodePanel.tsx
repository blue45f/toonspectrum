import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { isEntryCodeValid, STUDIO_ENTRY_CODE_LENGTH } from "./studio-virtual-space-entry-code";

export interface StudioVirtualSpaceEntryCodePanelProps {
  /** 코드 검증 통과 시 입장 의도 콜백. */
  readonly onEnterWithCode: (code: string) => void;
}

/**
 * 게스트 입장코드 입력 패널. 6자리 코드 입력만으로 입장한다(가입 불필요).
 * 검증은 형식 검사까지만 수행한다 — 서버 검증은 후속 작업.
 */
export function StudioVirtualSpaceEntryCodePanel({ onEnterWithCode }: StudioVirtualSpaceEntryCodePanelProps) {
  const bt = useBilingual("StudioVirtualSpaceEntryCodePanel");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    const normalized = code.trim().toUpperCase();
    if (!isEntryCodeValid(normalized)) {
      setError(
        bt(
          `입장코드는 ${STUDIO_ENTRY_CODE_LENGTH}자리 영숫자예요. 다시 확인해 주세요.`,
          `Entry codes are ${STUDIO_ENTRY_CODE_LENGTH} alphanumeric characters. Please check again.`,
        ),
      );
      return;
    }
    setError(null);
    onEnterWithCode(normalized);
  };

  return (
    <section aria-label={bt("입장코드로 입장", "Enter with code")}>
      <h2>{bt("입장코드로 입장", "Enter with code")}</h2>
      <p><small>{bt("초대받은 6자리 코드를 입력하면 바로 입장해요. 가입이 필요 없어요.", "Enter the 6-digit code to join right away. No sign-up needed.")}</small></p>
      <label>{bt("입장코드", "Entry code")}
        <input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          maxLength={STUDIO_ENTRY_CODE_LENGTH}
          autoComplete="off"
          placeholder="ABC123"
          aria-describedby={error ? "entry-code-error" : undefined}
        />
      </label>
      <button type="button" onClick={handleSubmit}>{bt("입장하기", "Enter")}</button>
      {error ? <p id="entry-code-error" role="alert">{error}</p> : null}
    </section>
  );
}
