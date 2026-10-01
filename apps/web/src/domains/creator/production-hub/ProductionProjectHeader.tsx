import { ChevronRight, CloudOff, PenLine, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import { ProductionCommandPalette } from "./ProductionCommandPalette";
import type { ProductionProjectAccess } from "./production-dashboard-api";
import { projectAccessRoleLabel } from "./production-labels";
import { ProductionPill, ProductionSampleBadge } from "./production-ui";
import type { ProductionSaveState } from "./use-production-project-session";
import { parseRoleLens } from "./use-preferred-role-lens";

import { buttonClass } from "@/shared/components/ui/button-utils";
import type { CreatorRoleLens } from "@/shared/lib/creator-role-contract";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const ROLE_LENS_OPTIONS: readonly { readonly value: CreatorRoleLens; readonly ko: string; readonly en: string }[] = [
  { value: "story", ko: "스토리 작가", en: "Story writer" },
  { value: "art", ko: "그림 작가", en: "Artist" },
  { value: "producer", ko: "PD·편집자", en: "Producer" },
];

function SaveStatus({ saveState, revision, isDemo }: { readonly saveState: ProductionSaveState; readonly revision: number; readonly isDemo: boolean }) {
  const bt = useBilingual("ProductionProjectHeader");
  const text = saveState === "saving"
    ? bt("저장 중…", "Saving…")
    : saveState === "saved"
      ? isDemo ? bt("이 브라우저에 반영됨", "Applied in this browser") : bt("저장됨", "Saved")
      : saveState === "error"
        ? bt("저장 실패", "Save failed")
        : isDemo ? bt("샘플 · 서버 저장 안 함", "Sample · not saved to server") : bt(`버전 ${revision}`, `Version ${revision}`);
  return (
    <span className="inline-flex min-h-11 items-center gap-1.5 text-xs text-fg-3" role="status">
      {isDemo ? <CloudOff className="size-3.5" aria-hidden="true" /> : null}
      {text}
    </span>
  );
}

export function ProductionProjectHeader({
  aggregate,
  access,
  roleLens,
  onRoleLensChange,
  saveState,
  isDemo,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly access: ProductionProjectAccess;
  readonly roleLens: CreatorRoleLens;
  readonly onRoleLensChange: (value: CreatorRoleLens) => void;
  readonly saveState: ProductionSaveState;
  readonly isDemo: boolean;
}) {
  const bt = useBilingual("ProductionProjectHeader");
  return (
    <header className="creator-workflow-topbar border-b border-line bg-panel px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-[100rem] flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link className="inline-flex min-h-6 items-center font-bold tracking-[0.04em] text-accent hover:underline" to="/production">
              {bt("제작 관리", "Production")}
            </Link>
            <ChevronRight className="size-3.5 text-fg-3" aria-hidden="true" />
            {isDemo ? <ProductionSampleBadge label={bt("샘플 프로젝트", "Sample project")} /> : null}
            <ProductionPill tone={access.owner || access.manage ? "accent" : "neutral"}>
              {bt("내 권한", "My access")}: {projectAccessRoleLabel(access.role, bt)}
            </ProductionPill>
          </div>
          <h1 className="mt-1 truncate text-xl font-black tracking-tight text-fg sm:text-2xl">{aggregate.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProductionCommandPalette aggregate={aggregate} />
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs text-fg-2 focus-within:ring-2 focus-within:ring-accent">
            <span>{bt("내 역할", "My role")}</span>
            <select
              className="min-h-10 bg-transparent font-semibold text-fg outline-none"
              value={roleLens}
              onChange={(event) => {
                const next = parseRoleLens(event.target.value);
                if (next) onRoleLensChange(next);
              }}
            >
              {ROLE_LENS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{bt(option.ko, option.en)}</option>
              ))}
            </select>
          </label>
          <SaveStatus saveState={saveState} revision={aggregate.revision} isDemo={isDemo} />
          {isDemo ? (
            <Link className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })} to="/studio/new">
              <Plus className="size-4" aria-hidden="true" />
              {bt("내 작품으로 시작", "Start my own work")}
            </Link>
          ) : (
            <Link
              className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}
              to={`/studio/work/${encodeURIComponent(aggregate.workId)}/canvas`}
            >
              <PenLine className="size-4" aria-hidden="true" />
              {bt("원고 작업 열기", "Open manuscript editor")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
