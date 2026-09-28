import { HeartOff, LoaderCircle, RefreshCw } from "lucide-react";

import { useMarketResourceDetail } from "../hooks/use-market-resource-detail";

import { MarketResourceCard } from "./MarketResourceCard";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** 찜한 ID를 실제 서버 상세로 확인한다. 로컬 초안을 공개 소재로 대체하지 않는다. */
export function MarketWishlistResource({ resourceId, onRemove }: {
  readonly resourceId: string;
  readonly onRemove: (id: string) => void;
}) {
  const { record, loading, notFound, staleSavedAt, reload } = useMarketResourceDetail(resourceId);
  const bt = useBilingual("MarketWishlistResource");
  if (loading) return <div role="status" className="min-h-56 rounded-xl border border-line bg-card p-5 text-sm text-fg-2">
    <LoaderCircle className="mr-2 inline size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
    {bt("찜한 소재 정보를 확인하는 중", "Checking saved material")}
  </div>;
  if (record) return <>
    {staleSavedAt ? <div role="status" className="mb-2 rounded-xl border border-warn/40 bg-panel p-3 text-xs leading-6 text-fg">
      {bt("마지막으로 확인한 사본입니다. 현재 공개 상태는 확인되지 않았어요.", "This is a previously verified copy. Current availability is unconfirmed.")}
      <button type="button" onClick={reload} className={buttonClass({ variant: "outline", size: "sm", className: "mt-2 min-h-11" })}>
        {bt("다시 확인", "Check again")}
      </button>
    </div> : null}
    <MarketResourceCard record={record} />
  </>;
  return <div className="min-h-56 rounded-xl border border-line bg-card p-5">
    <h2 className="text-sm font-bold text-fg">{notFound
      ? bt("현재 공개되지 않은 소재입니다", "This material is not currently listed")
      : bt("찜한 소재를 불러오지 못했어요", "Could not load this saved material")}</h2>
    <p className="mt-2 text-xs leading-6 text-fg-2">{bt(
      "찜한 항목은 그대로 유지됩니다. 다시 확인하거나 이 브라우저의 찜 목록에서 제거할 수 있습니다.",
      "Your bookmark has been kept. Retry or remove it from this browser's wishlist.",
    )}</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" onClick={reload} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}>
        <RefreshCw className="size-4" aria-hidden="true" />{bt("다시 확인", "Check again")}
      </button>
      <button type="button" onClick={() => onRemove(resourceId)} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}>
        <HeartOff className="size-4" aria-hidden="true" />{bt("찜 목록에서 제거", "Remove bookmark")}
      </button>
    </div>
  </div>;
}
