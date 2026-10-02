import { Check, UsersRound, X } from "lucide-react";
import { memo, useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioSpaceSocialRequest } from "../StudioVirtualSpaceSocialPanel";

/** 받은 요청 토스트가 떠 있는 시간. 사라져도 요청은 참가자 패널에 남는다. */
const SPACE_REQUEST_TOAST_MS = 10_000;

const ACTION_LABELS: Readonly<Record<StudioSpaceSocialRequest["action"], readonly [string, string]>> = {
  talk: ["대화 요청", "conversation request"],
  follow: ["함께 이동 요청", "follow request"],
  review: ["함께 검토 초대", "review invitation"],
  "high-five": ["함께 축하 요청", "celebration request"],
};

/**
 * 상단 요청 토스트: 가장 최근에 받은 요청 하나를 10초 동안 보여 준다.
 * 수락·거절은 참가자 패널과 같은 응답 경로(respondSocial·respondReview)를 쓴다.
 */
export const SpaceRequestToast = memo(function SpaceRequestToast({ requests, acceptDisabledReason, onRespond, onOpenPeople }: {
  /** 방향이 incoming이고 상태가 offered인 요청. */
  readonly requests: readonly StudioSpaceSocialRequest[];
  readonly acceptDisabledReason: string | null;
  readonly onRespond: (id: string, response: "accept" | "decline") => void;
  readonly onOpenPeople: () => void;
}) {
  const bt = useBilingual("SpaceRequestToast");
  const [expired, setExpired] = useState<ReadonlySet<string>>(() => new Set());
  const request = requests.find((item) => !expired.has(item.id)) ?? null;
  const requestId = request?.id ?? null;
  useEffect(() => {
    if (!requestId) return undefined;
    const timer = globalThis.setTimeout(() => setExpired((current) => new Set(current).add(requestId)), SPACE_REQUEST_TOAST_MS);
    return () => globalThis.clearTimeout(timer);
  }, [requestId]);
  if (!request) return null;
  const [actionKo, actionEn] = ACTION_LABELS[request.action];
  const name = request.peer.displayName;
  return <section className="space-request-toast" aria-label={bt(`${name}님의 ${actionKo}`, `${actionEn} from ${name}`)} data-space-interactive="true">
    <UsersRound size={18} aria-hidden />
    <p role="status"><strong>{name}</strong> · {bt(`${actionKo}이 왔어요`, `sent a ${actionEn}`)}
      {acceptDisabledReason ? <span className="space-request-toast__reason">{acceptDisabledReason}</span> : null}
    </p>
    <div className="space-request-toast__actions">
      <button type="button" className="space-pill-button space-pill-button--primary" aria-disabled={acceptDisabledReason ? true : undefined}
        title={acceptDisabledReason ?? undefined}
        aria-label={bt(`${name}님의 ${actionKo} 수락`, `Accept ${actionEn} from ${name}`)}
        onClick={() => { if (!acceptDisabledReason) onRespond(request.id, "accept"); }}>
        <Check size={16} aria-hidden />{bt("수락", "Accept")}
      </button>
      <button type="button" className="space-pill-button" aria-label={bt(`${name}님의 ${actionKo} 거절`, `Decline ${actionEn} from ${name}`)}
        onClick={() => onRespond(request.id, "decline")}>
        <X size={16} aria-hidden />{bt("거절", "Decline")}
      </button>
      <button type="button" className="space-pill-button" onClick={onOpenPeople}>{bt("자세히", "Details")}</button>
    </div>
  </section>;
});
