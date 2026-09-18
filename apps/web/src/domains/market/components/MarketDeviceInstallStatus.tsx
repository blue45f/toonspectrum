import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { CheckCircle2, CircleDashed, RefreshCw } from "lucide-react";

import type { MarketDeviceInstallSnapshot } from "../hooks/use-market-device-install";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { cn } from "@/shared/lib/utils";

function marketDeviceInstallStatusLabel(
  record: Pick<CreatorMarketplaceResourceRecord, "resourceVersion">,
  snapshot: Pick<MarketDeviceInstallSnapshot, "state" | "receipt">,
): string {
  if (snapshot.state === "installed-current") {
    return `이 기기·브라우저에 v${record.resourceVersion} 설치 확인됨`;
  }
  if (snapshot.state === "update-available") {
    return `업데이트 가능 · 설치 v${snapshot.receipt?.packageVersion ?? "?"} → 마켓 v${record.resourceVersion}`;
  }
  return "이 기기·브라우저에서 확인된 설치 영수증 없음";
}

export function MarketDeviceInstallStatus({
  record,
  snapshot,
  compact = false,
  className,
}: {
  readonly record: Pick<CreatorMarketplaceResourceRecord, "resourceVersion">;
  readonly snapshot: MarketDeviceInstallSnapshot;
  readonly compact?: boolean;
  readonly className?: string;
}) {
  if (!snapshot.trackable) return null;

  const current = snapshot.state === "installed-current";
  const update = snapshot.state === "update-available";
  const Icon = current ? CheckCircle2 : update ? RefreshCw : CircleDashed;
  const explanation = current
    ? "Studio 저장소 커밋과 이 릴리스의 버전·매니페스트 해시가 일치합니다."
    : update
      ? "현재 기기에는 이전 버전이 설치되어 있습니다. Studio에서 최신 릴리스를 검증한 뒤 교체할 수 있습니다."
      : "아직 설치하지 않았거나 브라우저 데이터가 정리되었습니다. Studio에서 실제 저장소를 다시 확인할 수 있습니다.";

  return (
    <div
      role="status"
      aria-live="polite"
      data-market-device-install-state={snapshot.state}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-left",
        current
          ? "border-good/35 bg-good/10"
          : update
            ? "border-warn/35 bg-warn/10"
            : "border-line bg-panel",
        className,
      )}
    >
      <p className="flex items-start gap-1.5 text-xs font-semibold text-fg">
        <Icon
          className={cn(
            "mt-px h-3.5 w-3.5 shrink-0",
            current ? "text-good" : update ? "text-warn" : "text-fg-3",
          )}
          aria-hidden="true"
        />
        <span>{marketDeviceInstallStatusLabel(record, snapshot)}</span>
      </p>
      {!compact ? (
        <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
          {explanation} {translateCurrentStaticSourceText("domains.market.components.MarketDeviceInstallStatus", "ko", "이 표시는 현재 브라우저의 로컬 설치 증거이며 계정 소장·클라우드 확인 이력과는 별개입니다.")}</p>
      ) : null}
    </div>
  );
}
