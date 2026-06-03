import { useAppConfig } from "@/src/hooks/use-app-config";
import { cn } from "@/lib/utils";
import { Megaphone } from "lucide-react";

interface AdSlotProps {
  label?: string;
  className?: string;
}

// 토글 가능한 광고 지면. 전역 수익화(monetizationEnabled)가 켜져 있을 때만 렌더한다.
// 기본값은 OFF라 평소엔 아무것도 노출하지 않는다(return null).
//
// 켜졌을 때도 아직 실제 광고 네트워크 연동 전이라 하우스/스폰서 지면 자리표시자다(광고 연동 시 교체).
// "AD · 스폰서" 배지로 광고 지면임을 분명히 표시해 콘텐츠로 위장하지 않는다(정직·비기만).
export function AdSlot({ label = "이 자리에 스폰서 콘텐츠가 노출됩니다 · 광고 문의", className }: AdSlotProps) {
  const { monetizationEnabled } = useAppConfig();
  if (!monetizationEnabled) return null;

  return (
    <aside
      aria-label="스폰서 광고 지면"
      className={cn(
        "flex flex-col items-center gap-2 rounded-2xl border border-line bg-panel px-6 py-7 text-center",
        className
      )}
    >
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-fg-3">
        <Megaphone size={11} aria-hidden />
        AD · 스폰서
      </span>
      <p className="text-sm text-fg-3">{label}</p>
    </aside>
  );
}
