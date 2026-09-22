import {
  Archive,
  ChevronDown,
  ExternalLink,
  Flag,
  Globe2,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  CREATOR_COMMUNITY_KIND_LABEL,
  CREATOR_COMMUNITY_PROVENANCE_LABEL,
} from "./creator-community-labels";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn, relativeDate } from "@/shared/lib/utils";
import {
  CREATOR_COMMUNITY_CONTENT_DESCRIPTORS,
  CREATOR_COMMUNITY_CONTENT_KINDS,
  CREATOR_COMMUNITY_FEEDBACK_TOPICS,
  CREATOR_COMMUNITY_PROVENANCES,
  readCreatorCommunityMetadata,
  writeCreatorCommunityMetadata,
  type CreatorCommunityContentDescriptor,
  type CreatorCommunityContentKind,
  type CreatorCommunityExternalPlatform,
  type CreatorCommunityExternalPublication,
  type CreatorCommunityFeedbackTopic,
  type CreatorCommunityMetadata,
  type CreatorCommunityProvenance,
  type CreatorCommunityReleaseSummary,
} from "@/shared/lib/creator-community-publication-contract";
import {
  createWorkRelease,
  listExternalPublications,
  listWorkReleases,
  removeExternalPublication,
  reportWork,
  saveExternalPublication,
  updateWork,
  type WorkDetail,
  type WorkReportReason,
} from "@/infrastructure/creator-client";

const DESCRIPTOR_LABEL: Record<CreatorCommunityContentDescriptor, string> = {
  violence: "폭력",
  gore: "유혈",
  horror: "공포",
  sexuality: "선정성",
  language: "욕설",
  drugs: "약물",
  self_harm: "자해",
  sensitive_topic: "민감 소재",
};

const FEEDBACK_LABEL: Record<CreatorCommunityFeedbackTopic, string> = {
  general: "전체 감상",
  composition: "구도",
  color: "색감",
  anatomy: "인체",
  background: "배경",
  direction: "연출",
  lettering: "식자",
  portfolio: "포트폴리오 관점",
  none: "피드백 받지 않음",
};

const PLATFORM_LABEL: Record<CreatorCommunityExternalPlatform, string> = {
  naver: "네이버 도전만화",
  webtoon_canvas: "WEBTOON CANVAS",
  tapas: "Tapas",
  postype: "POSTYPE",
  pixiv: "pixiv",
  globalcomix: "GlobalComix",
  other: "기타",
};

const RELEASE_STATE_LABEL = {
  review: "승인 검토",
  approved: "게시 준비",
  published: "공개됨",
  superseded: "이전 버전",
  withdrawn: "철회됨",
} as const;

function toggleValue<Value extends string>(
  values: readonly Value[],
  value: Value,
): Value[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

export function CreatorCommunityPublicationPanel({
  work,
  onUpdated,
}: {
  work: WorkDetail;
  onUpdated: (patch: Partial<WorkDetail>) => void;
}) {
  const initialMetadata = useMemo(
    () => readCreatorCommunityMetadata(work.doc, { format: work.format }),
    [work.doc, work.format],
  );
  const [open, setOpen] = useState(false);
  const [metadata, setMetadata] = useState<CreatorCommunityMetadata>(initialMetadata);
  const [releases, setReleases] = useState<CreatorCommunityReleaseSummary[]>([]);
  const [external, setExternal] = useState<CreatorCommunityExternalPublication[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<CreatorCommunityExternalPlatform>("naver");
  const [externalUrl, setExternalUrl] = useState("");
  const [creatingRelease, setCreatingRelease] = useState(false);
  const [savingExternal, setSavingExternal] = useState(false);

  useEffect(() => setMetadata(initialMetadata), [initialMetadata]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([
      listWorkReleases(work.id, controller.signal),
      listExternalPublications(work.id, controller.signal),
    ])
      .then(([releaseItems, externalItems]) => {
        if (!alive) return;
        setReleases(releaseItems);
        setExternal(externalItems);
      })
      .catch((caught: unknown) => {
        if (!alive || controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "발행 정보를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [open, work.id]);

  async function saveMetadata() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const doc = writeCreatorCommunityMetadata(work.doc, metadata, { format: work.format });
    try {
      const saved = await updateWork(work.id, {
        doc,
        ...(work.revision ? { baseRevision: work.revision } : {}),
      });
      onUpdated({
        doc,
        community: metadata,
        revision: saved.revision ?? work.revision,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "커뮤니티 설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function createRelease() {
    if (creatingRelease) return;
    setCreatingRelease(true);
    setError(null);
    try {
      const created = await createWorkRelease(work.id);
      setReleases((current) => [created, ...current.filter((item) => item.id !== created.id)]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "릴리스를 만들지 못했습니다.");
    } finally {
      setCreatingRelease(false);
    }
  }

  async function addExternalPublication() {
    const url = externalUrl.trim();
    if (!url || savingExternal) return;
    setSavingExternal(true);
    setError(null);
    try {
      const saved = await saveExternalPublication(work.id, {
        platform,
        externalUrl: url,
        releaseId: releases[0]?.id,
        status: "published",
      });
      setExternal((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setExternalUrl("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "외부 게시 이력을 저장하지 못했습니다.");
    } finally {
      setSavingExternal(false);
    }
  }

  async function removeExternal(id: string) {
    setError(null);
    try {
      const removed = await removeExternalPublication(work.id, id);
      setExternal((current) => current.map((item) => (item.id === id ? removed : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "외부 게시 이력을 정리하지 못했습니다.");
    }
  }

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-line bg-card/50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}        className="flex w-full items-center gap-2 px-3.5 py-3 text-left text-xs font-medium text-fg-2 transition-colors hover:text-fg"
      >
        <Archive size={14} className="text-accent" />
        작품 공개·포트폴리오 관리
        <span className="ml-auto hidden text-[0.7rem] text-fg-3 sm:inline">
          {CREATOR_COMMUNITY_KIND_LABEL[metadata.kind]} · {CREATOR_COMMUNITY_PROVENANCE_LABEL[metadata.provenance]}
          {metadata.portfolio ? " · 포트폴리오" : ""}
        </span>
        <ChevronDown
          size={14}
          className={cn("transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-5 border-t border-line px-3.5 py-4">
          <div className="rounded-xl border border-accent/25 bg-accent-soft/20 p-3 text-xs leading-relaxed text-fg-2">
            <p className="flex items-center gap-1.5 font-semibold text-fg">
              <ShieldCheck size={14} className="text-accent" />
              비공개 원본과 공개 릴리스는 분리됩니다
            </p>
            <p className="mt-1 text-fg-3">
              아래 설정을 저장해도 원본 공개 범위는 바뀌지 않습니다. 공개 발행은 스튜디오의 게시 설정에서 명시적으로 선택하고, 여기서는 현재 저장본의 불변 릴리스와 외부 연재 이력을 관리합니다.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-fg-2">
              작품 유형
              <select
                value={metadata.kind}
                onChange={(event) => setMetadata((current) => ({
                  ...current,
                  kind: event.target.value as CreatorCommunityContentKind,
                }))}
                className="h-10 rounded-lg border border-line bg-canvas px-2.5 text-sm text-fg"
              >
                {CREATOR_COMMUNITY_CONTENT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>{CREATOR_COMMUNITY_KIND_LABEL[kind]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-fg-2">
              제작 방식 공개
              <select
                value={metadata.provenance}
                onChange={(event) => setMetadata((current) => ({
                  ...current,
                  provenance: event.target.value as CreatorCommunityProvenance,
                }))}
                className="h-10 rounded-lg border border-line bg-canvas px-2.5 text-sm text-fg"
              >
                {CREATOR_COMMUNITY_PROVENANCES.map((value) => (
                  <option key={value} value={value}>{CREATOR_COMMUNITY_PROVENANCE_LABEL[value]}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-canvas px-3 text-xs text-fg-2">
              <input
                type="checkbox"
                checked={metadata.portfolio}
                onChange={(event) => setMetadata((current) => ({
                  ...current,
                  portfolio: event.target.checked,
                }))}
              />
              대표 포트폴리오·가상 전시관에 포함
            </label>
            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-canvas px-3 text-xs text-fg-2">
              <input
                type="checkbox"
                checked={metadata.downloadAllowed}
                onChange={(event) => setMetadata((current) => ({
                  ...current,
                  downloadAllowed: event.target.checked,
                }))}
              />
              독자 다운로드 허용
            </label>
            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-canvas px-3 text-xs text-fg-2">
              <input
                type="checkbox"
                checked={metadata.trainingAllowed}
                onChange={(event) => setMetadata((current) => ({
                  ...current,
                  trainingAllowed: event.target.checked,
                }))}
              />
              AI 학습 사용 허용
            </label>
          </div>
          <p className="text-[0.7rem] leading-relaxed text-fg-3">
            가상 전시관에는 이 항목을 선택한 공개 작품만 배치됩니다. 저장만 한 초안이나 비공개 원본은 표시되지 않으며, 이 선택 자체가 작품을 공개하지도 않습니다.
          </p>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-fg">콘텐츠 설명자</legend>
            <div className="flex flex-wrap gap-2">
              {CREATOR_COMMUNITY_CONTENT_DESCRIPTORS.map((descriptor) => {
                const selected = metadata.contentDescriptors.includes(descriptor);
                return (
                  <button
                    key={descriptor}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setMetadata((current) => ({
                      ...current,
                      contentDescriptors: toggleValue(current.contentDescriptors, descriptor),
                    }))}
                    className={cn(
                      "min-h-9 rounded-full border px-3 text-xs transition-colors",
                      selected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-canvas text-fg-2 hover:border-line-strong",
                    )}
                  >
                    {DESCRIPTOR_LABEL[descriptor]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-fg">받고 싶은 창작 피드백</legend>
            <div className="flex flex-wrap gap-2">
              {CREATOR_COMMUNITY_FEEDBACK_TOPICS.map((topic) => {
                const selected = metadata.feedbackTopics.includes(topic);
                return (
                  <button
                    key={topic}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setMetadata((current) => ({
                      ...current,
                      feedbackTopics: topic === "none"
                        ? ["none"]
                        : toggleValue(
                            current.feedbackTopics.filter((value) => value !== "none"),
                            topic,
                          ),
                    }))}
                    className={cn(
                      "min-h-9 rounded-full border px-3 text-xs transition-colors",
                      selected
                        ? "border-cool/60 bg-[oklch(0.8_0.11_232/0.12)] text-cool"
                        : "border-line bg-canvas text-fg-2 hover:border-line-strong",
                    )}
                  >
                    {FEEDBACK_LABEL[topic]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-fg-2">
              접근성 대체 설명
              <textarea
                value={metadata.altText}
                onChange={(event) => setMetadata((current) => ({
                  ...current,
                  altText: event.target.value.slice(0, 1_000),
                }))}
                rows={3}
                placeholder="이미지를 보지 못하는 독자도 장면을 이해할 수 있도록 설명해 주세요."
                className="rounded-lg border border-line bg-canvas px-2.5 py-2 text-sm text-fg placeholder:text-fg-3"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-fg-2">
              출처·이용 조건
              <textarea
                value={metadata.attributionText}
                onChange={(event) => setMetadata((current) => ({
                  ...current,
                  attributionText: event.target.value.slice(0, 240),
                }))}
                rows={3}
                placeholder="예: © 작가명, 재배포 금지"
                className="rounded-lg border border-line bg-canvas px-2.5 py-2 text-sm text-fg placeholder:text-fg-3"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveMetadata}
              disabled={saving}
              className={buttonClass({ size: "sm", variant: "solid", className: "gap-1.5" })}
            >
              <Save size={14} />
              {saving ? "저장 중…" : "작품 정보 저장"}
            </button>
            <span className="text-[0.7rem] text-fg-3">
              저장은 공개가 아닙니다. 공개 범위는 기존 게시 설정에서만 변경됩니다.
            </span>
          </div>

          <div className="border-t border-line pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <div>
                <h3 className="text-xs font-semibold text-fg">불변 릴리스</h3>
                <p className="mt-0.5 text-[0.7rem] text-fg-3">
                  현재 저장본을 외부 배포·검수용으로 고정합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={createRelease}
                disabled={creatingRelease}
                className={buttonClass({ size: "sm", variant: "outline", className: "ml-auto gap-1.5" })}
              >
                <Plus size={14} />
                {creatingRelease ? "생성 중…" : "현재 저장본 릴리스"}
              </button>
            </div>            {loading ? (
              <div className="skeleton mt-3 h-16 rounded-lg" aria-hidden />
            ) : releases.length > 0 ? (
              <div className="mt-3 space-y-2">
                {releases.slice(0, 6).map((release) => (
                  <div
                    key={release.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-canvas px-3 py-2 text-xs"
                  >
                    <span className="font-semibold text-fg">v{release.releaseNo}</span>
                    <span className="text-fg-2">revision {release.workRevision}</span>
                    <span className="rounded-full bg-raised px-2 py-0.5 text-[0.7rem] text-fg-2">
                      {RELEASE_STATE_LABEL[release.state]}
                    </span>
                    <span className="ml-auto text-[0.7rem] text-fg-3">
                      {relativeDate(release.createdAt)}
                    </span>
                    <code className="w-full truncate text-[0.65rem] text-fg-3">
                      sha256:{release.fingerprint.slice(0, 16)}…
                    </code>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-fg-3">
                아직 릴리스가 없습니다. 저장을 마친 뒤 현재 저장본을 고정해 보세요.
              </p>
            )}
          </div>

          <div className="border-t border-line pt-4">
            <div className="flex items-center gap-2">
              <Globe2 size={14} className="text-cool" />
              <div>
                <h3 className="text-xs font-semibold text-fg">외부 연재·게시 이력</h3>
                <p className="mt-0.5 text-[0.7rem] text-fg-3">
                  어느 플랫폼에 어떤 릴리스를 올렸는지 기록합니다.
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value as CreatorCommunityExternalPlatform)}
                aria-label="외부 게시 플랫폼"
                className="h-10 rounded-lg border border-line bg-canvas px-2.5 text-sm text-fg"
              >
                {Object.entries(PLATFORM_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <input
                type="url"
                inputMode="url"
                value={externalUrl}
                onChange={(event) => setExternalUrl(event.target.value)}
                placeholder="https:// 공개 회차 또는 작품 주소"
                className="h-10 rounded-lg border border-line bg-canvas px-3 text-sm text-fg placeholder:text-fg-3"
              />
              <button
                type="button"
                onClick={addExternalPublication}
                disabled={!externalUrl.trim() || savingExternal || releases.length === 0}
                className={buttonClass({ size: "sm", variant: "outline", className: "h-10 gap-1.5" })}
              >
                <ExternalLink size={14} />
                기록
              </button>
            </div>
            {releases.length === 0 && (
              <p className="mt-2 text-[0.7rem] text-fg-3">
                외부 게시 주소를 기록하려면 먼저 현재 저장본의 릴리스를 생성해 주세요.
              </p>
            )}
            {external.length > 0 && (
              <div className="mt-3 space-y-2">
                {external.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-xs",
                      item.status === "removed" && "opacity-55",
                    )}
                  >
                    <span className="shrink-0 font-medium text-fg-2">
                      {PLATFORM_LABEL[item.platform]}
                    </span>
                    <a
                      href={item.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-cool hover:underline"
                    >
                      {item.externalUrl}
                    </a>
                    <span className="text-[0.65rem] text-fg-3">{item.status}</span>
                    {item.status !== "removed" && (
                      <button
                        type="button"
                        onClick={() => removeExternal(item.id)}
                        aria-label={`${PLATFORM_LABEL[item.platform]} 게시 이력 제거`}
                        className="grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-bad"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-bad">{error}</p>}
        </div>
      )}
    </section>
  );
}
const REPORT_REASON_LABEL: Record<WorkReportReason, string> = {
  copyright: "저작권·도용",
  unsafe: "유해하거나 부적절한 콘텐츠",
  spam: "스팸·홍보 도배",
  misleading: "오해를 유도하는 정보",
  ai_disclosure: "AI 사용 표시 문제",
  other: "기타",
};

export function CreatorWorkReportControl({
  workId,
  authenticated,
}: {
  workId: string;
  authenticated: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<WorkReportReason>("copyright");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    if (!authenticated || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await reportWork(workId, reason, details);
      setMessage("신고가 접수되었습니다. 운영 검토 후 필요한 조치를 진행합니다.");
      setDetails("");
      setOpen(false);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "신고를 접수하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (!authenticated) {
            setMessage("로그인 후 작품을 신고할 수 있습니다.");
            return;
          }
          setOpen((value) => !value);
          setMessage(null);
        }}
        className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1.5 text-fg-3" })}
      >
        <Flag size={13} />
        신고
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-panel p-3 shadow-xl">
          <p className="text-xs font-semibold text-fg">작품 신고</p>
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value as WorkReportReason)}
            className="mt-2 h-10 w-full rounded-lg border border-line bg-canvas px-2.5 text-sm text-fg"
          >
            {Object.entries(REPORT_REASON_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value.slice(0, 1_000))}
            rows={3}
            placeholder="검토에 도움이 되는 내용을 적어 주세요."
            className="mt-2 w-full rounded-lg border border-line bg-canvas px-2.5 py-2 text-sm text-fg placeholder:text-fg-3"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={buttonClass({ size: "sm", variant: "quiet" })}
            >
              취소
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className={buttonClass({ size: "sm", variant: "solid" })}
            >
              {submitting ? "접수 중…" : "신고 접수"}
            </button>
          </div>
        </div>
      )}
      {message && !open && (
        <span className="absolute right-0 top-full z-10 mt-1 w-64 rounded-lg border border-line bg-panel px-2.5 py-2 text-[0.7rem] text-fg-2 shadow-lg">
          {message}
        </span>
      )}
    </div>
  );
}
