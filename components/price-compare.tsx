import type { Availability } from "@/lib/types";
import { comparePlatformCosts, formatWon } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { Coins, Crown, Eye } from "lucide-react";

// 플랫폼간 가격 비교표 — 같은 작품의 보기/소장 비용을 플랫폼별로 비교(추정·예시).
export function PriceCompare({ availability }: { availability: Availability[] }) {
  if (!availability || availability.length < 1) return null;
  const rows = comparePlatformCosts(availability);
  const multi = rows.length > 1;

  return (
    <section className="rounded-2xl border border-line bg-panel/40 p-4">
      <div className="mb-1 flex items-center gap-1.5">
        <Coins size={15} className="text-accent" />
        <h3 className="text-sm font-semibold text-fg">플랫폼별 가격 비교</h3>
      </div>
      <p className="mb-3 text-[0.72rem] text-fg-3">
        {multi ? "같은 작품도 플랫폼마다 보는·소장 비용이 다릅니다. " : ""}
        회차당 <b className="text-fg-2">보기(대여)</b>·<b className="text-fg-2">소장(영구)</b> 추정가 — 모델은 실데이터, 금액은 추정·예시입니다.
      </p>

      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-line bg-card/60 text-[0.68rem] text-fg-3">
              <th className="px-3 py-2 font-medium">플랫폼</th>
              <th className="px-2 py-2 font-medium">모델</th>
              <th className="px-2 py-2 text-right font-medium">
                <span className="inline-flex items-center gap-1"><Eye size={11} /> 보기</span>
              </th>
              <th className="px-3 py-2 text-right font-medium">
                <span className="inline-flex items-center gap-1"><Crown size={11} /> 소장</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.platformId} className="border-b border-line/60 last:border-0">
                <td className="px-3 py-2">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-medium text-fg hover:text-accent"
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: r.color }} />
                    {r.name}
                  </a>
                </td>
                <td className="px-2 py-2 text-fg-2">{r.modelLabel}</td>
                <td className="px-2 py-2 text-right">
                  <span className={cn("numeral", r.cheapestRead ? "font-semibold text-good" : "text-fg-2")}>
                    {r.monthlyWon > 0 ? "구독" : formatWon(r.readPerEpWon)}
                  </span>
                  {r.cheapestRead && multi && <span className="ml-1 text-[0.6rem] text-good">최저</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className={cn("numeral", r.cheapestOwn ? "font-semibold text-good" : "text-fg-2")}>
                    {r.ownPerEpWon > 0 ? formatWon(r.ownPerEpWon) : "—"}
                  </span>
                  {r.cheapestOwn && multi && <span className="ml-1 text-[0.6rem] text-good">최저</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[0.66rem] leading-relaxed text-fg-3">
        ※ 회차당 추정 단가입니다. 실제 비용은 작품 길이·프로모션·미리보기 정책에 따라 달라집니다.
        무료/기다무는 기다리면 0원, 빨리보기 시 과금됩니다.
      </p>
    </section>
  );
}
