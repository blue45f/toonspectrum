import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { CollabField, collabButton, collabInput } from "./collaboration-ui";
import type { CollaborationAction } from "./collaboration-application-panel";
import { collaborationClient } from "@/platform/collaboration-client";

export function ReportForm({ id, busy, act }: { id: string; busy: boolean; act: CollaborationAction }) {
  const [reason, setReason] = useState("");
  return <details className="rounded-2xl border border-line p-5">
    <summary className="cursor-pointer text-sm font-semibold text-fg-3"><ShieldAlert className="mr-2 inline" size={16} aria-hidden="true" />문제 공고 신고</summary>
    <form className="mt-4 space-y-4" onSubmit={(event) => {
      event.preventDefault();
      void act(() => collaborationClient.report(id, reason), "운영자 신고 검토 목록에 접수했어요.").then((ok) => { if (ok) setReason(""); });
    }}>
      <CollabField label="신고 사유" hint="허위 조건·무상 작업 강요·권리 침해·개인정보 노출 등 구체적인 사유를 적어 주세요.">
        <textarea disabled={busy} rows={3} minLength={10} maxLength={1000} required className={collabInput} value={reason} onChange={(event) => setReason(event.target.value)} />
      </CollabField>
      <button disabled={busy} type="submit" className={collabButton}>운영자에게 신고 보내기</button>
    </form>
  </details>;
}
