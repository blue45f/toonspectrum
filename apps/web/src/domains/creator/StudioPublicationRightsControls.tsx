import { Accessibility, Bot, Download, ShieldCheck } from "lucide-react";

import {
  CREATOR_COMMUNITY_KIND_LABEL,
  CREATOR_COMMUNITY_PROVENANCE_LABEL,
} from "./creator-community-labels";

import type { StudioPublicationPreflightIssue } from "./studio-publication-preflight";
import {
  CREATOR_COMMUNITY_CONTENT_KINDS,
  CREATOR_COMMUNITY_PROVENANCES,
  type CreatorCommunityContentKind,
  type CreatorCommunityMetadata,
  type CreatorCommunityProvenance,
} from "@/shared/lib/creator-community-publication-contract";
import { cn } from "@/shared/lib/utils";

export interface StudioPublicationRightsControlsProps {
  readonly metadata: CreatorCommunityMetadata;
  readonly disabled?: boolean;
  readonly issues?: readonly StudioPublicationPreflightIssue[];
  readonly onChange: (next: CreatorCommunityMetadata) => void;
}

const FIELD =
  "mt-1 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent/55 focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-not-allowed disabled:opacity-60";

function updateMetadata(
  metadata: CreatorCommunityMetadata,
  patch: Partial<CreatorCommunityMetadata>,
): CreatorCommunityMetadata {
  return { ...metadata, ...patch };
}

/**
 * Publication-time accessibility, provenance, and reuse policy. Keeping these fields in the same
 * confirmation flow as visibility prevents a newly published work from temporarily claiming
 * “human made” or exposing blank alternative text until the owner finds a separate management
 * panel after publication.
 */
export function StudioPublicationRightsControls({
  metadata,
  disabled = false,
  issues = [],
  onChange,
}: StudioPublicationRightsControlsProps) {
  const relevantIssues = issues.filter((issue) => issue.path.startsWith("community."));
  const nonHuman = metadata.provenance !== "human";
  const attributionRequired = nonHuman || metadata.downloadAllowed || metadata.trainingAllowed;

  return (
    <section
      aria-labelledby="studio-publication-rights-title"
      className="mt-4 rounded-2xl border border-line bg-panel/35 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/35 bg-accent-soft/30 text-accent">
          <ShieldCheck size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="studio-publication-rights-title" className="text-base font-bold text-fg">
            접근성·제작 출처·활용 권한
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-fg-3">
            독자가 작품을 이해하고 재사용 가능 범위를 오해하지 않도록 공개 전에 함께 확정합니다.
            이 값은 작품 원본과 같은 revision에 저장됩니다.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-fg-2">
          작품 유형
          <select
            value={metadata.kind}
            disabled={disabled}
            aria-label="게시 작품 유형"
            onChange={(event) => onChange(updateMetadata(metadata, {
              kind: event.target.value as CreatorCommunityContentKind,
            }))}
            className={cn(FIELD, "h-11")}
          >
            {CREATOR_COMMUNITY_CONTENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>{CREATOR_COMMUNITY_KIND_LABEL[kind]}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-fg-2">
          제작 방식 공개
          <select
            value={metadata.provenance}
            disabled={disabled}
            aria-label="게시 제작 방식"
            onChange={(event) => onChange(updateMetadata(metadata, {
              provenance: event.target.value as CreatorCommunityProvenance,
            }))}
            className={cn(FIELD, "h-11")}
          >
            {CREATOR_COMMUNITY_PROVENANCES.map((provenance) => (
              <option key={provenance} value={provenance}>
                {CREATOR_COMMUNITY_PROVENANCE_LABEL[provenance]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <label className="text-xs font-medium text-fg-2">
          <span className="flex items-center gap-1.5">
            <Accessibility size={13} className="text-accent" aria-hidden />
            작품 대체 텍스트 <span className="text-bad">*</span>
          </span>
          <textarea
            value={metadata.altText}
            disabled={disabled}
            maxLength={1_000}
            rows={4}
            aria-label="작품 대체 텍스트"
            onChange={(event) => onChange(updateMetadata(metadata, {
              altText: event.target.value.slice(0, 1_000),
            }))}
            placeholder="예: 보라색 머리와 청록색 눈을 가진 판타지 소녀가 보석 왕관을 쓰고 성운 앞에 서 있는 일러스트"
            className={cn(FIELD, "resize-y py-2.5")}
          />
          <span className="mt-1 flex justify-between gap-2 text-[0.68rem] leading-relaxed text-fg-3">
            <span>이미지를 볼 수 없는 독자도 핵심 장면을 이해할 수 있게 설명합니다.</span>
            <span className="tabular-nums">{metadata.altText.length}/1000</span>
          </span>
        </label>

        <label className="text-xs font-medium text-fg-2">
          <span className="flex items-center gap-1.5">
            <Bot size={13} className="text-accent" aria-hidden />
            제작 참여·출처·이용 조건 {attributionRequired ? <span className="text-bad">*</span> : null}
          </span>
          <textarea
            value={metadata.attributionText}
            disabled={disabled}
            maxLength={240}
            rows={4}
            aria-label="제작 참여 출처와 이용 조건"
            onChange={(event) => onChange(updateMetadata(metadata, {
              attributionText: event.target.value.slice(0, 240),
            }))}
            placeholder={nonHuman
              ? "예: AI 에이전트가 브라우저 드로잉을 수행했고 작품 소유자가 최종 검수·승인함"
              : "예: © 작가명 · 재배포 시 출처 표기"}
            className={cn(FIELD, "resize-y py-2.5")}
          />
          <span className="mt-1 flex justify-between gap-2 text-[0.68rem] leading-relaxed text-fg-3">
            <span>AI·에이전트 참여 방식과 다운로드·학습 허용 조건을 명확히 적습니다.</span>
            <span className="tabular-nums">{metadata.attributionText.length}/240</span>
          </span>
        </label>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-canvas px-3 text-xs text-fg-2">
          <input
            type="checkbox"
            checked={metadata.portfolio}
            disabled={disabled}
            onChange={(event) => onChange(updateMetadata(metadata, {
              portfolio: event.target.checked,
            }))}
          />
          대표 포트폴리오·가상 전시 포함
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-canvas px-3 text-xs text-fg-2">
          <input
            type="checkbox"
            checked={metadata.downloadAllowed}
            disabled={disabled}
            onChange={(event) => onChange(updateMetadata(metadata, {
              downloadAllowed: event.target.checked,
            }))}
          />
          <Download size={13} aria-hidden /> 독자 다운로드 허용
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-canvas px-3 text-xs text-fg-2">
          <input
            type="checkbox"
            checked={metadata.trainingAllowed}
            disabled={disabled}
            onChange={(event) => onChange(updateMetadata(metadata, {
              trainingAllowed: event.target.checked,
            }))}
          />
          <Bot size={13} aria-hidden /> AI 학습 사용 허용
        </label>
      </div>

      {relevantIssues.length > 0 ? (
        <ul className="mt-3 space-y-2" aria-label="접근성 및 권리 확인 사항">
          {relevantIssues.map((issue) => (
            <li
              key={`${issue.code}:${issue.path}`}
              className={cn(
                "rounded-xl border px-3 py-2 text-xs leading-relaxed",
                issue.severity === "error"
                  ? "border-bad/40 bg-bad/10 text-bad"
                  : "border-warn/35 bg-warn/10 text-fg-2",
              )}
            >
              <strong className="mr-1">{issue.severity === "error" ? "필수" : "확인"}</strong>
              {issue.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-good" role="status">
          <CheckIcon /> 접근성·출처·활용 권한 정보가 준비됐습니다.
        </p>
      )}
    </section>
  );
}

function CheckIcon() {
  return <ShieldCheck size={13} aria-hidden />;
}
