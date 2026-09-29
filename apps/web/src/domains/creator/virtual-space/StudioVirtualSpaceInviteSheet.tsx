import { useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  buildCodeInviteFragment,
  renderEntryCodeQrDataUrl,
  type StudioEntryCodeRecord,
} from "./studio-virtual-space-entry-code";

export interface StudioVirtualSpaceInviteSheetProps {
  /** A-1 게스트 초대 링크 (예: https://…/vspace#invite=<토큰>). */
  readonly inviteLink: string;
  /** 발급된 입장코드 기록. */
  readonly codeRecord: StudioEntryCodeRecord;
  /** 입장 URL 베이스 (QR에 인코딩, 예: https://toonstudio.cloud/vspace). */
  readonly spaceUrlBase: string;
}

/**
 * 초대 3종 통합 시트: 링크 복사 / 6자리 코드 표시 / QR 표시.
 * QR은 클라이언트에서 렌더한다.
 */
export function StudioVirtualSpaceInviteSheet({ inviteLink, codeRecord, spaceUrlBase }: StudioVirtualSpaceInviteSheetProps) {
  const bt = useBilingual("StudioVirtualSpaceInviteSheet");
  const [tab, setTab] = useState<"link" | "code" | "qr">("link");
  const [copied, setCopied] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

  const codeLink = `${spaceUrlBase}${buildCodeInviteFragment(codeRecord.code)}`;

  useEffect(() => {
    if (tab !== "qr" || qrUrl || qrError) return;
    let cancelled = false;
    renderEntryCodeQrDataUrl(codeLink)
      .then((url) => {
        if (!cancelled) setQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, qrUrl, qrError, codeLink]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section aria-label={bt("스페이스 초대", "Invite to space")}>
      <h2>{bt("스페이스 초대", "Invite to space")}</h2>
      <div role="tablist" aria-label={bt("초대 방식", "Invite method")}>
        <button type="button" role="tab" aria-selected={tab === "link"} onClick={() => setTab("link")}>{bt("링크", "Link")}</button>
        <button type="button" role="tab" aria-selected={tab === "code"} onClick={() => setTab("code")}>{bt("입장코드", "Code")}</button>
        <button type="button" role="tab" aria-selected={tab === "qr"} onClick={() => setTab("qr")}>{bt("QR", "QR")}</button>
      </div>

      {tab === "link" ? (
        <div role="tabpanel">
          <p><small>{bt("링크를 공유하면 게스트가 바로 입장해요.", "Share the link and guests can join right away.")}</small></p>
          <code>{inviteLink}</code>
          <button type="button" onClick={() => void handleCopy(inviteLink)}>{bt("링크 복사", "Copy link")}</button>
          {copied ? <p role="status">{bt("복사됐어요.", "Copied.")}</p> : null}
        </div>
      ) : null}

      {tab === "code" ? (
        <div role="tabpanel">
          <p><small>{bt(`"${codeRecord.spaceName}" 입장코드예요. 게스트는 코드 입력만으로 입장해요.`, `Entry code for "${codeRecord.spaceName}". Guests just type the code to join.`)}</small></p>
          <strong aria-label={bt("입장코드", "Entry code")}>{codeRecord.code}</strong>
          <button type="button" onClick={() => void handleCopy(codeRecord.code)}>{bt("코드 복사", "Copy code")}</button>
        </div>
      ) : null}

      {tab === "qr" ? (
        <div role="tabpanel">
          <p><small>{bt("QR을 스캔하면 입장코드가 담긴 링크로 열려요.", "Scan the QR to open the invite link with the code.")}</small></p>
          {qrUrl ? <img src={qrUrl} alt={bt("입장 QR 코드", "Entry QR code")} width={200} height={200} /> : null}
          {!qrUrl && !qrError ? <p role="status">{bt("QR을 만들고 있어요.", "Rendering the QR code.")}</p> : null}
          {qrError ? <p role="alert">{bt("QR을 만들지 못했어요. 링크나 코드를 공유해 주세요.", "Couldn't render the QR. Please share the link or code.")}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
