import Link from "@/src/compat/router-link";
import { getLiveRanking, type LiveItem } from "@/lib/server/live";
import { CoverImage } from "./cover-image";
import { Stars } from "./ui/stars";
import { ArrowUpRight, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

function LiveRow({ item }: { item: LiveItem }) {
  const inner = (
    <>
      <span
        className={cn(
          "numeral w-7 shrink-0 text-center leading-none",
          item.rank <= 3 ? "text-2xl text-accent" : "text-lg text-fg-3"
        )}
      >
        {item.rank}
      </span>
      <span className="relative aspect-[3/4] w-9 shrink-0 overflow-hidden rounded-md bg-raised ring-1 ring-white/10">
        {item.thumbnail && (
          <CoverImage src={item.thumbnail} alt="" className="absolute inset-0 size-full object-cover" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg group-hover:text-accent">
          {item.title}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-fg-3">
          <span
            className="inline-flex items-center gap-1 rounded px-1 text-[0.62rem] font-medium"
            style={{ color: item.platformColor }}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: item.platformColor }} />
            {item.platform}
          </span>
          {item.author && <span className="truncate">· {item.author}</span>}
        </span>
      </span>
      {item.rating > 0 && (
        <span className="hidden items-center gap-1 sm:flex">
          <Stars value={item.rating} size="xs" />
          <span className="numeral text-xs text-fg-2">{item.rating.toFixed(1)}</span>
        </span>
      )}
      {item.external && <ArrowUpRight size={13} className="shrink-0 text-fg-3" />}
    </>
  );
  const cls =
    "group flex items-center gap-3 rounded-xl border border-transparent px-2 py-2 transition-colors hover:border-line hover:bg-card";
  return item.external ? (
    <a href={item.href} target="_blank" rel="noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={item.href} className={cls}>
      {inner}
    </Link>
  );
}

// 실시간 인기 — 네이버/카카오에서 런타임 ISR 페치. 실패 시 상태만 표시해 정적 순위로 가장하지 않는다.
export async function LiveRanking() {
  const { items } = await getLiveRanking(12);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-panel/40 p-5 text-sm text-fg-3">
        실시간 집계가 일시적으로 어렵습니다. 통합 랭킹의 API 산식 폴백을 확인해 주세요.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-panel/40 p-2 sm:p-3">
      <div className="mb-1 flex items-center gap-2 px-2 py-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-bad/40 bg-[oklch(0.66_0.2_25/0.12)] px-2 py-0.5 text-[0.65rem] font-semibold text-bad">
          <Radio size={11} className="animate-pulse-soft" />
          LIVE
        </span>
        <span className="text-xs text-fg-3">
          네이버·카카오 오늘자 인기 · 런타임 집계, 10분마다 갱신
        </span>
      </div>
      {items.map((it) => (
        <LiveRow key={it.key} item={it} />
      ))}
    </div>
  );
}
