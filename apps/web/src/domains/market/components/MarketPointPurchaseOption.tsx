/**
 * 마켓 구매 모달의 포인트 결제 옵션.
 *
 * 포인트는 활동 보상으로만 쌓이고 현금으로 충전할 수 없다(선불업 규제 회피).
 * 이 컴포넌트는 표시와 상태 판정만 담당하고, 실제 차감→보관→실패 시 환불 사가는
 * 모달(MarketAcquisitionModal)의 handlePointPurchase가 수행한다.
 * 지갑 상태는 account 도메인의 공개 진입점(@/domains/account/asset-points)만 import한다.
 */

import { Coins } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import {
  computeBalance,
  ownedResourceIds,
  pointPriceForKrw,
  useAssetPointsStore,
} from "@/domains/account/asset-points";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useApp } from "@/shared/lib/store";

interface MarketPointPurchaseOptionProps {
  resourceId: string;
  resourceName: string;
  krwAmount: number;
  agreed: boolean;
  submitting: boolean;
  onPurchase: () => void;
}

export function MarketPointPurchaseOption({
  resourceId,
  resourceName,
  krwAmount,
  agreed,
  submitting,
  onPurchase,
}: MarketPointPurchaseOptionProps) {
  const userId = useApp((state) => state.userId);
  const events = useAssetPointsStore((state) => state.events);
  const pointPrice = pointPriceForKrw(krwAmount);
  const balance = useMemo(() => computeBalance(events, new Date()), [events]);
  const alreadyOwned = useMemo(
    () => ownedResourceIds(events).has(resourceId),
    [events, resourceId],
  );

  if (pointPrice <= 0) return null;

  return (
    <div className="space-y-2 rounded-xl border border-accent/40 bg-accent/10 p-3.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-fg">
        <Coins className="size-4 text-accent" aria-hidden="true" />
        <span>활동 포인트로도 살 수 있어요</span>
      </p>
      <p className="text-[0.7rem] leading-relaxed text-fg-2">
        {resourceName} · {pointPrice.toLocaleString("ko-KR")}P
        {userId ? ` · 내 포인트 ${balance.toLocaleString("ko-KR")}P` : ""}
      </p>
      {!userId ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[0.7rem] text-fg-3">포인트 지갑은 로그인 후 이용할 수 있어요.</p>
          <button
            type="button"
            onClick={() =>
              requestAuthModalOpen({
                reason: "protected-action",
                source: "market-point-purchase",
                mode: "login",
              })
            }
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            로그인하고 포인트 쓰기
          </button>
        </div>
      ) : alreadyOwned ? (
        <p className="text-[0.7rem] font-semibold text-good">
          이미 포인트로 구매한 에셋이에요. 내 에셋에서 확인할 수 있습니다.
        </p>
      ) : balance < pointPrice ? (
        <p className="text-[0.7rem] leading-relaxed text-fg-2">
          포인트가 {(pointPrice - balance).toLocaleString("ko-KR")}P 부족해요. 작품을 올리거나
          컷츠를 게시하면 포인트가 쌓입니다.{" "}
          <Link to="/account/points" className="font-semibold text-accent underline">
            적립 방법 보기
          </Link>
        </p>
      ) : (
        <button
          type="button"
          onClick={onPurchase}
          disabled={!agreed || submitting}
          aria-busy={submitting || undefined}
          title={!agreed ? "라이선스와 출처 조건을 확인하면 포인트로 살 수 있습니다." : undefined}
          className={buttonClass({
            variant: "solid",
            size: "sm",
            className: "gap-2 disabled:opacity-40",
          })}
        >
          <Coins className="size-4" aria-hidden="true" />
          <span>{submitting ? "포인트로 구매 중…" : `포인트 ${pointPrice.toLocaleString("ko-KR")}P로 구매`}</span>
        </button>
      )}
    </div>
  );
}
