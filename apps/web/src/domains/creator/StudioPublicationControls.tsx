import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  Check,
  Clock3,
  Eye,
  EyeOff,
  FileWarning,
  Globe2,
  LayoutPanelTop,
  Link2,
  LockKeyhole,
  Search,
  Share2,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  normalizeCreatorPublicationDirective,
  type CreatorPublicationContentRating,
  type CreatorPublicationDirective,
  type CreatorPublicationReadingDirection,
  type CreatorPublicationReadingMode,
  type CreatorPublicationVisibility,
} from "@/shared/lib/creator-publication-contract";
import { cn } from "@/shared/lib/utils";

import {
  formatStudioPublicationLocalDateTime,
  resolveStudioPublicationSchedule,
  type StudioPublicationPreflightResult,
} from "./studio-publication-preflight";

const COMMON_TIME_ZONES = [
  "Asia/Seoul",
  "Asia/Tokyo",
  "UTC",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
] as const;

const fieldClass =
  "w-full rounded-xl border border-line bg-canvas px-3 text-sm text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent/55 focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-not-allowed disabled:opacity-60";

export interface StudioPublicationControlsProps {
  directive: CreatorPublicationDirective;
  title: string;
  description: string;
  cover: string | null;
  preflight: StudioPublicationPreflightResult;
  disabled?: boolean;
  onChange: (directive: CreatorPublicationDirective) => void;
}

function ChoiceCard({
  active,
  disabled,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-24 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55 disabled:cursor-not-allowed disabled:opacity-60",
        active
          ? "border-accent/65 bg-accent/10 text-fg"
          : "border-line bg-card/45 text-fg-2 hover:border-accent/35 hover:bg-card/70",
      )}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <span className={cn("text-fg-3", active && "text-accent")}>{icon}</span>
        {title}
        {active && (
          <Check size={14} className="ml-auto text-accent" aria-hidden="true" />
        )}
      </span>
      <span className="mt-1.5 block text-xs leading-relaxed text-fg-3">
        {description}
      </span>
    </button>
  );
}

function ToggleRow({
  checked,
  disabled,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border border-line bg-card/35 px-3 py-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/45">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-line accent-[var(--accent)]"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium text-fg">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-fg-3">
          {description}
        </span>
      </span>
    </label>
  );
}

function SectionHeading({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-3">
      <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
        <span className="text-accent">{icon}</span>
        {title}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-fg-3">{description}</p>
    </div>
  );
}

function nextRoundedSchedule(): string {
  const date = new Date(Date.now() + 2 * 60 * 60 * 1_000);
  date.setUTCMinutes(Math.ceil(date.getUTCMinutes() / 5) * 5, 0, 0);
  return date.toISOString();
}

function visibilityDescription(
  visibility: CreatorPublicationVisibility,
): string {
  if (visibility === "public") return "탐색·시리즈·검색 화면에 노출";
  if (visibility === "unlisted") return "정확한 링크를 아는 독자만 열람";
  return "나와 공동 작업자만 열람";
}

function ratingLabel(rating: CreatorPublicationContentRating): string {
  if (rating === "teen") return "청소년 주의";
  if (rating === "mature") return "성인 대상";
  return "전체 이용";
}

export function StudioPublicationControls({
  directive,
  title,
  description,
  cover,
  preflight,
  disabled = false,
  onChange,
}: StudioPublicationControlsProps) {
  const [scheduleDraft, setScheduleDraft] = useState(() =>
    formatStudioPublicationLocalDateTime(
      directive.scheduledAt,
      directive.timeZone,
    ),
  );
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const timeZones = useMemo(() => {
    const zones = new Set<string>([
      directive.timeZone,
      ...COMMON_TIME_ZONES,
    ]);
    try {
      zones.add(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      // UTC remains available.
    }
    return [...zones].filter(Boolean);
  }, [directive.timeZone]);

  useEffect(() => {
    setScheduleDraft(
      formatStudioPublicationLocalDateTime(
        directive.scheduledAt,
        directive.timeZone,
      ),
    );
  }, [directive.scheduledAt, directive.timeZone]);

  const patch = (changes: Partial<CreatorPublicationDirective>) => {
    onChange(normalizeCreatorPublicationDirective({ ...directive, ...changes }));
  };

  const setMode = (mode: CreatorPublicationDirective["mode"]) => {
    if (mode === "immediate") {
      setScheduleError(null);
      patch({ mode, scheduledAt: null });
      return;
    }
    const scheduledAt = directive.scheduledAt ?? nextRoundedSchedule();
    setScheduleError(null);
    patch({ mode, scheduledAt });
  };

  const updateSchedule = (
    value: string,
    timeZone = directive.timeZone,
  ) => {
    setScheduleDraft(value);
    const resolution = resolveStudioPublicationSchedule(value, timeZone);
    setScheduleError(resolution.message);
    patch({ timeZone, scheduledAt: resolution.iso });
  };

  const setVisibility = (visibility: CreatorPublicationVisibility) => {
    patch({
      visibility,
      searchIndexing:
        visibility === "public" ? directive.searchIndexing : false,
      ...(visibility === "private"
        ? { mode: "immediate", scheduledAt: null }
        : {}),
    });
    if (visibility === "private") setScheduleError(null);
  };

  const setReadingMode = (readingMode: CreatorPublicationReadingMode) => {
    patch({
      readingMode,
      readingDirection:
        readingMode === "vertical" ? "ltr" : directive.readingDirection,
    });
  };

  const setReadingDirection = (
    readingDirection: CreatorPublicationReadingDirection,
  ) => {
    patch({ readingDirection });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-panel/35 p-4 sm:p-5">
        <SectionHeading
          icon={<CalendarClock size={16} />}
          title="공개 시점"
          description="즉시 공개하거나 시간대가 보존되는 예약 공개를 설정합니다."
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <ChoiceCard
            active={directive.mode === "immediate"}
            disabled={disabled}
            icon={<Clock3 size={16} />}
            title="저장 즉시 공개"
            description="사전검사를 통과한 현재 revision을 바로 독자에게 공개합니다."
            onClick={() => setMode("immediate")}
          />
          <ChoiceCard
            active={directive.mode === "scheduled"}
            disabled={disabled || directive.visibility === "private"}
            icon={<CalendarClock size={16} />}
            title="예약 공개"
            description="선택한 지역 시각을 UTC로 고정해 서버가 자동 공개합니다."
            onClick={() => setMode("scheduled")}
          />
        </div>
        {directive.mode === "scheduled" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
            <label className="text-xs text-fg-2">
              예약 날짜와 시간
              <input
                type="datetime-local"
                value={scheduleDraft}
                disabled={disabled}
                onChange={(event) => updateSchedule(event.target.value)}
                className={cn(fieldClass, "mt-1 h-11")}
              />
            </label>
            <label className="text-xs text-fg-2">
              기준 시간대
              <select
                value={directive.timeZone}
                disabled={disabled}
                onChange={(event) =>
                  updateSchedule(scheduleDraft, event.target.value)
                }
                className={cn(fieldClass, "mt-1 h-11")}
              >
                {timeZones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </label>
            {scheduleError && (
              <p className="text-xs text-bad sm:col-span-2" role="alert">
                {scheduleError}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-panel/35 p-4 sm:p-5">
        <SectionHeading
          icon={<Eye size={16} />}
          title="공개 범위"
          description="목록 노출과 정확한 링크 접근 권한을 서로 분리합니다."
        />
        <div className="grid gap-2 md:grid-cols-3">
          <ChoiceCard
            active={directive.visibility === "public"}
            disabled={disabled}
            icon={<Globe2 size={16} />}
            title="전체 공개"
            description="추천·탐색·시리즈 목록과 직접 링크에서 모두 볼 수 있습니다."
            onClick={() => setVisibility("public")}
          />
          <ChoiceCard
            active={directive.visibility === "unlisted"}
            disabled={disabled}
            icon={<Link2 size={16} />}
            title="링크 공개"
            description="탐색 화면에는 나오지 않고 정확한 작품 링크로만 접근합니다."
            onClick={() => setVisibility("unlisted")}
          />
          <ChoiceCard
            active={directive.visibility === "private"}
            disabled={disabled}
            icon={<LockKeyhole size={16} />}
            title="비공개"
            description="게시 상태를 초안으로 유지하며 소유자와 공동 작업자만 확인합니다."
            onClick={() => setVisibility("private")}
          />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-3">
          {directive.visibility === "public" ? (
            <Eye size={13} />
          ) : (
            <EyeOff size={13} />
          )}
          현재 설정: {visibilityDescription(directive.visibility)}
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-panel/35 p-4 sm:p-5">
        <SectionHeading
          icon={<BookOpen size={16} />}
          title="독자 경험"
          description="작품 형식과 페이지 진행 방향을 게시 메타데이터에 고정합니다."
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <ChoiceCard
            active={directive.readingMode === "vertical"}
            disabled={disabled}
            icon={<Smartphone size={16} />}
            title="세로 스크롤"
            description="모바일 웹툰에 적합하며 위에서 아래로 연속해서 읽습니다."
            onClick={() => setReadingMode("vertical")}
          />
          <ChoiceCard
            active={directive.readingMode === "paged"}
            disabled={disabled}
            icon={<LayoutPanelTop size={16} />}
            title="페이지 넘김"
            description="출판 만화처럼 페이지 단위로 이동하는 작품에 적합합니다."
            onClick={() => setReadingMode("paged")}
          />
        </div>
        {directive.readingMode === "paged" && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <ChoiceCard
              active={directive.readingDirection === "ltr"}
              disabled={disabled}
              icon={<BookOpen size={16} />}
              title="왼쪽 → 오른쪽"
              description="한국·서구권 디지털 만화의 일반적인 진행 방향입니다."
              onClick={() => setReadingDirection("ltr")}
            />
            <ChoiceCard
              active={directive.readingDirection === "rtl"}
              disabled={disabled}
              icon={<BookOpen size={16} />}
              title="오른쪽 → 왼쪽"
              description="일본식 단행본 진행 방향을 유지합니다."
              onClick={() => setReadingDirection("rtl")}
            />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-panel/35 p-4 sm:p-5">
        <SectionHeading
          icon={<ShieldCheck size={16} />}
          title="참여·콘텐츠 정책"
          description="댓글과 리믹스 권한은 화면 표시뿐 아니라 서버 요청에서도 다시 검사합니다."
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <ToggleRow
            checked={directive.comments === "open"}
            disabled={disabled}
            label="새 댓글 허용"
            description="끄면 기존 댓글은 유지하고 새 댓글 등록만 차단합니다."
            onChange={(checked) =>
              patch({ comments: checked ? "open" : "closed" })
            }
          />
          <ToggleRow
            checked={directive.allowRemix}
            disabled={disabled}
            label="이어서 편집 허용"
            description="다른 창작자가 이 작품을 원본으로 리믹스할 수 있습니다."
            onChange={(allowRemix) => patch({ allowRemix })}
          />
        </div>
        <fieldset className="mt-3">
          <legend className="text-xs font-medium text-fg-2">독자 등급</legend>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
            {(["all", "teen", "mature"] as const).map((rating) => (
              <button
                key={rating}
                type="button"
                aria-pressed={directive.contentRating === rating}
                disabled={disabled}
                onClick={() => patch({ contentRating: rating })}
                className={cn(
                  "min-h-11 rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                  directive.contentRating === rating
                    ? "border-accent/60 bg-accent/10 text-fg"
                    : "border-line bg-card/35 text-fg-2 hover:bg-card/65",
                )}
              >
                {ratingLabel(rating)}
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="rounded-2xl border border-line bg-panel/35 p-4 sm:p-5">
        <SectionHeading
          icon={<Share2 size={16} />}
          title="검색·공유 카드"
          description="공개 목록과 메신저 링크 미리보기에 사용할 독자용 문구를 준비합니다."
        />
        <ToggleRow
          checked={directive.searchIndexing}
          disabled={disabled || directive.visibility !== "public"}
          label="검색 색인 허용"
          description={
            directive.visibility === "public"
              ? "검색 엔진과 내부 검색이 작품을 수집할 수 있도록 표시합니다."
              : "링크 공개·비공개 작품은 검색 색인을 항상 끕니다."
          }
          onChange={(searchIndexing) => patch({ searchIndexing })}
        />
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3">
            <label className="block text-xs text-fg-2">
              공유 카드 제목{" "}
              <span className="numeral text-fg-3">
                {directive.socialTitle.length}/70
              </span>
              <input
                value={directive.socialTitle}
                maxLength={70}
                disabled={disabled}
                onChange={(event) =>
                  patch({ socialTitle: event.target.value })
                }
                placeholder={title.trim() || "작품 제목"}
                className={cn(fieldClass, "mt-1 h-11")}
              />
            </label>
            <label className="block text-xs text-fg-2">
              공유 카드 설명{" "}
              <span className="numeral text-fg-3">
                {directive.socialDescription.length}/160
              </span>
              <textarea
                value={directive.socialDescription}
                maxLength={160}
                rows={3}
                disabled={disabled}
                onChange={(event) =>
                  patch({ socialDescription: event.target.value })
                }
                placeholder={
                  description.trim() || "작품을 한두 문장으로 소개해 주세요."
                }
                className={cn(fieldClass, "mt-1 resize-y py-2.5")}
              />
            </label>
            <label className="block text-xs text-fg-2">
              읽기 쉬운 주소
              <div className="mt-1 flex min-h-11 items-center rounded-xl border border-line bg-canvas px-3 focus-within:border-accent/55 focus-within:ring-2 focus-within:ring-accent/35">
                <span className="shrink-0 text-xs text-fg-3">/create/</span>
                <input
                  value={directive.canonicalSlug}
                  maxLength={80}
                  disabled={disabled}
                  onChange={(event) =>
                    patch({ canonicalSlug: event.target.value })
                  }
                  placeholder="작품-id"
                  className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none disabled:cursor-not-allowed"
                />
              </div>
            </label>
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-canvas shadow-sm">
            <div className="aspect-[1.91/1] bg-raised/60">
              {cover ? (
                <img
                  src={cover}
                  alt="공유 카드 표지 미리보기"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-fg-3">
                  <FileWarning size={22} />
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="flex items-center gap-1 text-[0.68rem] uppercase tracking-wide text-fg-3">
                <Search size={11} /> toonstudio.cloud
              </p>
              <p className="mt-1 line-clamp-1 text-sm font-semibold text-fg">
                {directive.socialTitle || title.trim() || "작품 제목"}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-3">
                {directive.socialDescription ||
                  description.trim() ||
                  "작품 설명이 여기에 표시됩니다."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        className={cn(
          "rounded-2xl border p-4 sm:p-5",
          preflight.errors.length > 0
            ? "border-bad/40 bg-bad/5"
            : preflight.warnings.length > 0
              ? "border-warn/40 bg-warn/5"
              : "border-good/40 bg-good/5",
        )}
        aria-live="polite"
      >
        <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
          {preflight.errors.length > 0 ? (
            <AlertTriangle size={16} className="text-bad" />
          ) : preflight.warnings.length > 0 ? (
            <FileWarning size={16} className="text-warn" />
          ) : (
            <Check size={16} className="text-good" />
          )}
          게시 사전검사
          <span className="ml-auto text-xs font-normal text-fg-3">
            오류 <span className="numeral">{preflight.errors.length}</span> · 경고{" "}
            <span className="numeral">{preflight.warnings.length}</span>
          </span>
        </h3>
        {preflight.issues.length === 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-good">
            공개를 막는 문제가 없습니다. 최종 미리보기에서 독자 화면을
            확인하세요.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {preflight.issues.map((issue) => (
              <li
                key={`${issue.code}:${issue.path}`}
                className="flex gap-2 text-xs leading-relaxed"
              >
                {issue.severity === "error" ? (
                  <AlertTriangle
                    size={13}
                    className="mt-0.5 shrink-0 text-bad"
                  />
                ) : (
                  <FileWarning
                    size={13}
                    className="mt-0.5 shrink-0 text-warn"
                  />
                )}
                <span
                  className={
                    issue.severity === "error" ? "text-bad" : "text-fg-2"
                  }
                >
                  {issue.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="sr-only" aria-live="polite">
        댓글 {directive.comments === "open" ? "허용" : "차단"}, 리믹스{" "}
        {directive.allowRemix ? "허용" : "차단"}, 독자 등급{" "}
        {ratingLabel(directive.contentRating)}
        {directive.searchIndexing ? ", 검색 색인 허용" : ", 검색 색인 차단"}
      </div>
    </div>
  );
}
