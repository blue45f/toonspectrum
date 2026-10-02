import { ArrowRight, CheckCircle2, MinusCircle, Send, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import { formatProductionDay } from "./production-format";
import { deriveEpisodeQcChecklist, type EpisodeQcItem } from "./production-episode-qc";
import {
  productionEpisodeRoomPath,
  productionSurfacePath,
  type ProductionSurfaceTarget,
} from "./production-project-surfaces";
import { ProductionPill, ProductionSectionCard } from "./production-ui";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

function targetPath(projectId: string, episodeId: string, target: ProductionSurfaceTarget): string {
  if (target.kind === "surface") return productionSurfacePath(projectId, target.surface, target.query);
  if (target.kind === "episode-room") return productionEpisodeRoomPath(projectId, episodeId);
  return target.path;
}

function QcItemRow({
  aggregate,
  episodeId,
  item,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly episodeId: string;
  readonly item: EpisodeQcItem;
}) {
  const bt = useBilingual("ProductionEpisodeQcChecklist");
  const Icon = item.status === "pass" ? CheckCircle2 : item.status === "blocked" ? XCircle : MinusCircle;
  return (
    <li className={cn("flex items-start gap-2.5 rounded-xl border p-3", item.status === "blocked" ? "border-bad/35 bg-bad/10" : "border-line bg-panel")}>
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", item.status === "pass" ? "text-good" : item.status === "blocked" ? "text-bad" : "text-fg-3")}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold leading-5 text-fg">{bt(item.label.ko, item.label.en)}</p>
        <p className="mt-0.5 text-[0.6875rem] leading-4 text-fg-3">{bt(item.detail.ko, item.detail.en)}</p>
      </div>
      {item.status === "blocked" && item.target ? (
        <Link
          className={buttonClass({ variant: "outline", size: "sm", className: "min-h-9 shrink-0 gap-1" })}
          to={targetPath(aggregate.projectId, episodeId, item.target)}
        >
          {bt("풀러 가기", "Fix")}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </li>
  );
}

/**
 * 회차 룸의 게시 전 QC 체크리스트.
 *
 * 검수 승인·공정 완료·게시 마감처럼 게시를 막는 조건이 화면마다 흩어져 있어,
 * 회차를 게시해도 되는지 한곳에서 판정해 보여 준다. 전부 통과하면 납품·발행 동선을 잇는다.
 * 실제 게시는 스튜디오에서 이뤄지므로, 그 사실을 완료 안내에 정직하게 적는다.
 */
export function ProductionEpisodeQcChecklist({
  aggregate,
  episodeId,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly episodeId: string;
}) {
  const bt = useBilingual("ProductionEpisodeQcChecklist");
  const [now] = useState(() => new Date());
  const checklist = useMemo(
    () => deriveEpisodeQcChecklist(aggregate, episodeId, now),
    [aggregate, episodeId, now],
  );
  if (!checklist) return null;

  const releaseDay = formatProductionDay(checklist.releaseAt, "");
  return (
    <ProductionSectionCard
      title={bt("게시 전 QC 체크리스트", "Pre-release QC checklist")}
      description={bt(
        "게시를 막는 조건을 회차 기준으로 한곳에 모았습니다. 막힌 항목은 해당 화면에서 풀 수 있어요.",
        "Everything that can block a release, in one place. Blocked items link to the screen that clears them.",
      )}
      action={(
        <span className="flex flex-wrap items-center gap-1.5">
          {releaseDay ? <ProductionPill>{bt(`게시 마감 ${releaseDay}`, `Release ${releaseDay}`)}</ProductionPill> : null}
          <ProductionPill tone={checklist.published || checklist.ready ? "success" : "danger"}>
            {checklist.published
              ? bt("게시 완료", "Published")
              : checklist.ready
                ? bt("게시 준비 완료", "Ready to publish")
                : bt(`막힌 항목 ${checklist.blockedCount}개`, `${checklist.blockedCount} blocked`)}
          </ProductionPill>
        </span>
      )}
    >
      <ul className="grid gap-2 lg:grid-cols-2">
        {checklist.items.map((item) => (
          <QcItemRow key={item.id} aggregate={aggregate} episodeId={episodeId} item={item} />
        ))}
      </ul>
      <p className="mt-3 text-[0.6875rem] text-fg-3">
        {bt(
          `적용 항목 ${checklist.applicableCount}개 중 ${checklist.passedCount}개 통과`,
          `${checklist.passedCount} of ${checklist.applicableCount} applicable checks passed`,
        )}
      </p>
      {checklist.ready && !checklist.published ? (
        <div className="mt-3 rounded-xl border border-good/30 bg-good/10 p-3">
          <p className="text-xs font-semibold leading-5 text-fg">
            {bt("제작·검수 기준은 모두 통과했어요.", "All production and review checks passed.")}
          </p>
          <p className="mt-1 text-[0.6875rem] leading-4 text-fg-2">
            {bt(
              "실제 게시는 스튜디오에서 작품을 게시하면 됩니다. 외부 납품본은 원고 납품 화면에서, 외부 플랫폼용 게시 패키지는 발행 센터에서 만들 수 있어요.",
              "Publishing itself happens in the Studio. Build external delivery files from the manuscript delivery view, and platform packages in the Publish Center.",
            )}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Link
              className={buttonClass({ variant: "outline", size: "sm", className: "min-h-9 gap-1.5" })}
              to={productionSurfacePath(aggregate.projectId, "manuscripts", "manuscriptView=delivery")}
            >
              <Send className="size-3.5" aria-hidden="true" />
              {bt("원고 납품 화면", "Manuscript delivery")}
            </Link>
            <Link className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-9" })} to="/publish">
              {bt("발행 센터", "Publish Center")}
            </Link>
          </div>
        </div>
      ) : null}
    </ProductionSectionCard>
  );
}
