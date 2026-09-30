import {
  Check,
  Copy,
  Eye,
  History,
  Link2,
  LoaderCircle,
  MessageSquareText,
  PencilLine,
  QrCode,
  Settings2,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  productionManuscriptRevisionLabel,
  type ProductionManuscriptProcess,
} from "./production-manuscript-model";
import {
  createProductionManuscriptSnapshot,
  listProductionManuscriptSnapshots,
  type ProductionManuscriptSnapshot,
} from "./production-manuscript-snapshots";
import {
  createVersionShareLink,
  isVersionShareLinkExpired,
  listVersionShareLinks,
  revokeVersionShareLink,
  VERSION_SHARE_EXPIRY_OPTIONS,
  type VersionShareLink,
  type VersionSharePermission,
  type VersionShareSettings,
} from "./one-click-version-share-model";
import {
  EmptyVersionsArt,
  VersionFlowDiagram,
  VersionThumbnailArt,
} from "./OneClickVersionShareArt";
import "./one-click-version-share.css";

/** useBilingual이 반환하는 한/영 문구 함수. */
type BilingualText = (ko: string, en: string) => string;

const PERMISSION_META: ReadonlyArray<{
  readonly id: VersionSharePermission;
  readonly icon: LucideIcon;
}> = [
  { id: "view", icon: Eye },
  { id: "comment", icon: MessageSquareText },
  { id: "edit", icon: PencilLine },
];

const CONFETTI_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#06b6d4", "#f43f5e", "#a3e635",
];

function formatDateTime(value: string, locale: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatExpiry(link: VersionShareLink, bt: BilingualText): string {
  if (link.revoked) return bt("회수됨", "Revoked");
  if (!link.expiresAt) return bt("만료 없음", "No expiry");
  if (isVersionShareLinkExpired(link)) return bt("만료됨", "Expired");
  return bt(
    `${formatDateTime(link.expiresAt, "ko-KR")} 만료`,
    `Expires ${formatDateTime(link.expiresAt, "en-US")}`,
  );
}

/** 권한 라벨/설명 — 렌더마다 재생성되지 않도록 모듈 스코프에 둔다. */
function permissionLabel(bt: BilingualText, permission: VersionSharePermission): string {
  if (permission === "view") return bt("보기 전용", "View only");
  if (permission === "edit") return bt("보기·댓글·편집", "View · Comment · Edit");
  return bt("보기·댓글", "View · Comment");
}

function permissionDescription(bt: BilingualText, permission: VersionSharePermission): string {
  if (permission === "view") return bt("원고를 읽기만 할 수 있습니다.", "Can only read the manuscript.");
  if (permission === "edit") return bt("직접 수정 제안을 남길 수 있습니다.", "Can leave direct edit suggestions.");
  return bt("댓글로 의견을 남길 수 있습니다.", "Can leave comments.");
}

interface ConfettiPiece {
  readonly key: string;
  readonly dx: string;
  readonly dy: string;
  readonly rot: string;
  readonly color: string;
  readonly delay: string;
}

/** 이벤트 핸들러에서 호출한다 — 렌더 중 호출 금지(react-hooks/purity). */
function makeConfettiPieces(burstKey: number): readonly ConfettiPiece[] {
  return Array.from({ length: 26 }, (_, index) => {
    const angle = (index / 26) * Math.PI * 2 + Math.random() * 0.5;
    const distance = 60 + Math.random() * 110;
    return {
      key: `${burstKey}-${index}`,
      dx: `${Math.cos(angle) * distance}px`,
      dy: `${Math.sin(angle) * distance * 0.7 + 70}px`,
      rot: `${Math.random() * 720 - 360}deg`,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      delay: `${Math.random() * 0.12}s`,
    };
  });
}

function Confetti({ pieces }: { readonly pieces: readonly ConfettiPiece[] }) {
  if (pieces.length === 0) return null;
  return <div className="ocvs-confetti-layer" aria-hidden="true">
    {pieces.map((piece) => <span
      key={piece.key}
      className="ocvs-confetti-piece"
      style={{
        ["--ocvs-dx" as string]: piece.dx,
        ["--ocvs-dy" as string]: piece.dy,
        ["--ocvs-rot" as string]: piece.rot,
        backgroundColor: piece.color,
        animationDelay: piece.delay,
      }}
    />)}
  </div>;
}

function VersionThumbnail({ snapshot }: { readonly snapshot: ProductionManuscriptSnapshot }) {
  return <div
    className="relative aspect-video w-full overflow-hidden rounded-xl border border-accent/30"
    aria-hidden="true"
  >
    <VersionThumbnailArt
      snapshotId={snapshot.id}
      name={snapshot.name}
      className="absolute inset-0 h-full w-full"
    />
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-2 pt-6">
      <p className="truncate text-xs font-black text-white">{snapshot.name}</p>
      <p className="truncate text-[0.625rem] font-bold text-white/75">
        {productionManuscriptRevisionLabel(snapshot.revisionKind)}
      </p>
    </div>
  </div>;
}

/* ------------------------------------------------------------------ */
/* 공유 설정 패널                                                        */
/* ------------------------------------------------------------------ */

interface ShareSettingsPanelProps {
  readonly bt: BilingualText;
  readonly headingId: string;
  readonly settings: VersionShareSettings;
  readonly onPatch: (patch: Partial<VersionShareSettings>) => void;
}

function ShareSettingsPanel({ bt, headingId, settings, onPatch }: ShareSettingsPanelProps) {
  return <div id="ocvs-settings-panel" className="border-t border-line p-5 sm:p-7" aria-labelledby={headingId}>
    <h3 id={headingId} className="text-sm font-black text-fg">{bt("링크 공유 설정", "Link share settings")}</h3>
    <fieldset className="mt-4">
      <legend className="text-xs font-bold text-fg-2">{bt("공유받는 사람 권한", "Recipient permission")}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {PERMISSION_META.map(({ id, icon: Icon }) => <button
          key={id}
          type="button"
          aria-pressed={settings.permission === id}
          onClick={() => onPatch({ permission: id })}
          className={cn(
            "rounded-2xl border p-3 text-left transition-colors",
            settings.permission === id
              ? "border-accent bg-accent-soft/40"
              : "border-line bg-panel hover:bg-raised",
          )}
        >
          <span className="flex items-center gap-1.5 text-sm font-black text-fg">
            <Icon className="size-4" aria-hidden="true" /> {permissionLabel(bt, id)}
          </span>
          <span className="mt-1 block text-xs leading-5 text-fg-2">{permissionDescription(bt, id)}</span>
        </button>)}
      </div>
    </fieldset>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="block text-xs font-bold text-fg-2">
        {bt("링크 만료", "Link expiry")}
        <select
          value={settings.expiresInDays}
          onChange={(event) => onPatch({ expiresInDays: Number(event.target.value) })}
          className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm font-semibold text-fg"
        >
          <option value={0}>{bt("만료 없음", "No expiry")}</option>
          {VERSION_SHARE_EXPIRY_OPTIONS.map((days) => <option key={days} value={days}>
            {bt(`${days}일 후 만료`, `Expires in ${days} days`)}
          </option>)}
        </select>
      </label>
      <label className="block text-xs font-bold text-fg-2">
        {bt("비밀번호 (선택)", "Password (optional)")}
        <input
          type="password"
          value={settings.password}
          maxLength={64}
          autoComplete="new-password"
          onChange={(event) => onPatch({ password: event.target.value })}
          placeholder={bt("없으면 누구나 링크로 열 수 있습니다", "Anyone with the link can open it")}
          className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg placeholder:text-fg-3"
        />
      </label>
    </div>
    <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold text-fg">
      <input
        type="checkbox"
        checked={settings.watermark}
        onChange={(event) => onPatch({ watermark: event.target.checked })}
        className="size-5 shrink-0 accent-accent"
      />
      <span className="flex items-center gap-1.5">
        <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
        {bt("워터마크 적용", "Apply watermark")}
      </span>
      <span className="text-xs font-normal text-fg-3">
        {bt("공유 화면에 작업자 표시를 남깁니다", "Shows the sharer on the shared view")}
      </span>
    </label>
  </div>;
}

/* ------------------------------------------------------------------ */
/* 발급된 링크 리빌 카드                                                  */
/* ------------------------------------------------------------------ */

interface ShareLinkRevealCardProps {
  readonly bt: BilingualText;
  readonly link: VersionShareLink;
  readonly snapshot: ProductionManuscriptSnapshot;
  readonly qrDataUrl: string | null;
  readonly onCopy: () => void;
  readonly onOpenFullWizard?: (snapshot: ProductionManuscriptSnapshot) => void;
}

function ShareLinkRevealCard({
  bt, link, snapshot, qrDataUrl, onCopy, onOpenFullWizard,
}: ShareLinkRevealCardProps) {
  return <div className="border-t border-line p-5 sm:p-7">
    <div className="ocvs-link-reveal rounded-2xl border border-accent/35 bg-accent-soft/20 p-4 sm:p-5" role="status">
      <p className="flex items-center gap-2 text-sm font-black text-fg">
        <Check className="size-4 text-good" aria-hidden="true" />
        {bt(
          `${snapshot.name} 버전이 공유됐어요!`,
          `${snapshot.name} is now shared!`,
        )}
        <span className="ocvs-new-badge rounded-full bg-accent px-2 py-0.5 text-[0.625rem] font-black text-on-accent">{bt("NEW", "NEW")}</span>
      </p>
      <div className="mt-3 flex flex-col gap-3 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="ocvs-share-url-input"
              readOnly
              value={link.url}
              onFocus={(event) => event.target.select()}
              aria-label={bt("버전 공유 링크", "Version share link")}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 font-mono text-xs text-fg"
            />
            <button type="button" onClick={onCopy} className={buttonClass()}>
              <Copy className="size-4" aria-hidden="true" /> {bt("링크 복사", "Copy link")}
            </button>
          </div>
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-2">
            <div className="flex gap-1.5">
              <dt className="font-bold text-fg-3">{bt("권한", "Permission")}</dt>
              <dd className="font-semibold">{permissionLabel(bt, link.settings.permission)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-bold text-fg-3">{bt("만료", "Expiry")}</dt>
              <dd className="font-semibold">{formatExpiry(link, bt)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="font-bold text-fg-3">{bt("워터마크", "Watermark")}</dt>
              <dd className="font-semibold">{link.settings.watermark ? bt("켜짐", "On") : bt("꺼짐", "Off")}</dd>
            </div>
            {link.settings.password ? <div className="flex gap-1.5">
              <dt className="font-bold text-fg-3">{bt("비밀번호", "Password")}</dt>
              <dd className="font-semibold">{bt("설정됨", "Set")}</dd>
            </div> : null}
          </dl>
          {onOpenFullWizard ? <button
            type="button"
            onClick={() => onOpenFullWizard(snapshot)}
            className={cn(buttonClass({ variant: "quiet", size: "sm" }), "mt-3")}
          >
            <Wand2 className="size-4" aria-hidden="true" />
            {bt("외부 검수 마법사로 상세 설정하기", "Fine-tune in the external review wizard")}
          </button> : null}
        </div>
        <div className="flex shrink-0 items-start justify-center lg:justify-end">
          {qrDataUrl ? <img
            src={qrDataUrl}
            alt={bt("공유 링크 QR 코드", "Share link QR code")}
            width={120}
            height={120}
            className="ocvs-qr-reveal rounded-xl border border-line bg-white p-1.5"
          /> : <div className="flex size-[120px] items-center justify-center rounded-xl border border-dashed border-line text-fg-3" aria-hidden="true">
            <QrCode className="size-8" />
          </div>}
        </div>
      </div>
    </div>
  </div>;
}

/* ------------------------------------------------------------------ */
/* 버전 타임라인                                                        */
/* ------------------------------------------------------------------ */

interface ShareLinkRowProps {
  readonly bt: BilingualText;
  readonly link: VersionShareLink;
  readonly onRevoke: (linkId: string) => void;
}

function ShareLinkRow({ bt, link, onRevoke }: ShareLinkRowProps) {
  const expired = isVersionShareLinkExpired(link);
  const revocable = !link.revoked && !expired;
  return <li className="flex items-center gap-2 text-xs">
    <span className={cn(
      "inline-flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 font-mono",
      expired ? "bg-panel text-fg-3 line-through" : "bg-accent-soft/40 text-fg-2",
    )}>
      <Link2 className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{link.url.replace(/^https?:\/\//u, "")}</span>
    </span>
    <span className="shrink-0 text-fg-3">{formatExpiry(link, bt)}</span>
    {revocable ? <button
      type="button"
      onClick={() => onRevoke(link.id)}
      aria-label={bt(`${link.snapshotName} 공유 링크 회수`, `Revoke ${link.snapshotName} share link`)}
      className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg text-fg-3 hover:bg-bad/10 hover:text-bad"
    >
      <Trash2 className="size-3.5" aria-hidden="true" />
    </button> : null}
  </li>;
}

interface VersionTimelineItemProps {
  readonly bt: BilingualText;
  readonly snapshot: ProductionManuscriptSnapshot;
  readonly isLatest: boolean;
  readonly index: number;
  readonly links: readonly VersionShareLink[];
  readonly canEdit: boolean;
  readonly onShare: (snapshot: ProductionManuscriptSnapshot) => void;
  readonly onOpenFullWizard?: (snapshot: ProductionManuscriptSnapshot) => void;
  readonly onRevoke: (linkId: string) => void;
}

function VersionTimelineItem({
  bt, snapshot, isLatest, index, links, canEdit, onShare, onOpenFullWizard, onRevoke,
}: VersionTimelineItemProps) {
  const snapshotLinks = links.filter((link) => link.snapshotId === snapshot.id);
  const sharedCount = snapshotLinks.filter((link) => !isVersionShareLinkExpired(link)).length;
  return <li
    className="ocvs-timeline-item relative flex gap-3 rounded-2xl border border-line bg-panel p-3 sm:p-4"
    style={{ ["--ocvs-stagger" as string]: `${Math.min(index, 8) * 60}ms` }}
  >
    <div className="w-24 shrink-0 sm:w-32">
      <VersionThumbnail snapshot={snapshot} />
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-black text-fg">{snapshot.name}</span>
        {isLatest ? <span className="rounded-full bg-accent px-2 py-0.5 text-[0.625rem] font-black text-on-accent">
          {bt("최신", "Latest")}
        </span> : null}
        {sharedCount > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-good/15 px-2 py-0.5 text-[0.625rem] font-bold text-good">
          <Link2 className="size-3" aria-hidden="true" />
          {bt(`공유 중 ${sharedCount}`, `${sharedCount} shared`)}
        </span> : null}
      </div>
      <p className="mt-1 truncate text-xs text-fg-3">
        {formatDateTime(snapshot.createdAt, "ko-KR")}
        {snapshot.memo ? ` · ${snapshot.memo}` : null}
      </p>
      {snapshotLinks.length > 0 ? <ul className="mt-2 space-y-1.5">
        {snapshotLinks.map((link) => <ShareLinkRow key={link.id} bt={bt} link={link} onRevoke={onRevoke} />)}
      </ul> : null}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {canEdit ? <button
          type="button"
          onClick={() => onShare(snapshot)}
          className={buttonClass({ variant: "outline", size: "sm" })}
        >
          <Share2 className="size-4" aria-hidden="true" />
          {bt("이 버전으로 공유", "Share this version")}
        </button> : null}
        {onOpenFullWizard && canEdit ? <button
          type="button"
          onClick={() => onOpenFullWizard(snapshot)}
          className={buttonClass({ variant: "quiet", size: "sm" })}
        >
          <Wand2 className="size-4" aria-hidden="true" />
          {bt("마법사로 열기", "Open in wizard")}
        </button> : null}
      </div>
    </div>
  </li>;
}

/* ------------------------------------------------------------------ */
/* 복사 토스트                                                          */
/* ------------------------------------------------------------------ */

function CopiedToast({ bt, leaving }: { readonly bt: BilingualText; readonly leaving: boolean }) {
  return <div
    role="status"
    data-leaving={leaving}
    className="ocvs-toast fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
  >
    <p className="flex items-center gap-2 rounded-2xl bg-fg px-5 py-3 text-sm font-black text-card shadow-xl">
      <Check className="size-4 text-good" aria-hidden="true" />
      {bt("복사됨! 링크를 전달해 보세요", "Copied! Share the link")}
    </p>
  </div>;
}

/* ------------------------------------------------------------------ */
/* 메인: 원클릭 버전 + 공유 링크                                           */
/* ------------------------------------------------------------------ */

export interface OneClickVersionShareProps {
  readonly process: ProductionManuscriptProcess;
  readonly canEdit: boolean;
  /** 상세 설정(ProductionExternalReviewWizard)으로 이어지는 빠른 경로. */
  readonly onOpenFullWizard?: (snapshot: ProductionManuscriptSnapshot) => void;
  readonly onChanged: () => void;
}

/** 에러 발생 시 "다시 시도" 버튼이 재실행할 작업. */
type ErrorRetryContext =
  | { readonly source: "one-click" }
  | { readonly source: "share"; readonly snapshot: ProductionManuscriptSnapshot };

/**
 * 원클릭 버전 + 공유 링크.
 *
 * 원고 작업 화면에서 "새 버전 만들기" 한 번의 클릭으로
 * 버전 스냅샷 생성 → 공유 링크 자동 발급까지 이어지는 마법 같은 동선.
 * 기존 ProductionManuscriptSnapshotPanel의 저장 로직을 재사용하고,
 * ProductionExternalReviewWizard로는 "상세 설정" 브리지로 연결한다.
 */
export function OneClickVersionShare({
  process,
  canEdit,
  onOpenFullWizard,
  onChanged,
}: OneClickVersionShareProps) {
  const bt = useBilingual("OneClickVersionShare");
  const artifactId = process.artifact.id;
  const headingId = useId();
  const settingsHeadingId = useId();
  const timelineHeadingId = useId();

  const [snapshots, setSnapshots] = useState<readonly ProductionManuscriptSnapshot[]>(() =>
    listProductionManuscriptSnapshots(artifactId));
  const [links, setLinks] = useState<readonly VersionShareLink[]>(() =>
    listVersionShareLinks(artifactId));
  const [settings, setSettings] = useState<VersionShareSettings>({
    permission: "comment",
    expiresInDays: 7,
    watermark: true,
    password: "",
  });
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confettiPieces, setConfettiPieces] = useState<readonly ConfettiPiece[]>([]);
  const [celebrating, setCelebrating] = useState(false);
  const [freshLink, setFreshLink] = useState<VersionShareLink | null>(null);
  const [freshSnapshot, setFreshSnapshot] = useState<ProductionManuscriptSnapshot | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [toastLeaving, setToastLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorContext, setErrorContext] = useState<ErrorRetryContext | null>(null);
  const toastTimer = useRef<number | null>(null);
  const celebrateTimer = useRef<number | null>(null);

  const celebrate = useCallback(() => {
    setConfettiPieces(makeConfettiPieces(Date.now()));
    setCelebrating(true);
    if (celebrateTimer.current !== null) window.clearTimeout(celebrateTimer.current);
    celebrateTimer.current = window.setTimeout(() => setCelebrating(false), 950);
  }, []);

  const refresh = useCallback(() => {
    setSnapshots(listProductionManuscriptSnapshots(artifactId));
    setLinks(listVersionShareLinks(artifactId));
  }, [artifactId]);

  useEffect(() => {
    refresh();
    setFreshLink(null);
    setFreshSnapshot(null);
    setQrDataUrl(null);
    setError(null);
    setErrorContext(null);
  }, [refresh]);

  useEffect(() => () => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    if (celebrateTimer.current !== null) window.clearTimeout(celebrateTimer.current);
  }, []);

  const issueLinkForSnapshot = useCallback((
    snapshot: ProductionManuscriptSnapshot,
    appliedSettings: VersionShareSettings,
  ): VersionShareLink | null => {
    const link = createVersionShareLink(
      artifactId,
      { snapshotId: snapshot.id, snapshotName: snapshot.name },
      appliedSettings,
    );
    if (link) {
      setLinks(listVersionShareLinks(artifactId));
      setFreshLink(link);
      setFreshSnapshot(snapshot);
      setQrDataUrl(null);
      void QRCode.toDataURL(link.url, { width: 160, margin: 1 }).then(
        (dataUrl) => setQrDataUrl(dataUrl),
        () => setQrDataUrl(null),
      );
    }
    return link;
  }, [artifactId]);

  const handleOneClick = useCallback(() => {
    const head = process.headRevision;
    if (!head) {
      setError(bt("작업본(HEAD)이 없어 버전을 만들 수 없습니다.", "No working copy (HEAD) to version."));
      setErrorContext({ source: "one-click" });
      return;
    }
    setBusy(true);
    setError(null);
    setErrorContext(null);
    // 스냅샷 저장 로직은 ProductionManuscriptSnapshotPanel과 동일한 모듈을 재사용한다.
    const snapshot = createProductionManuscriptSnapshot(artifactId, {
      revisionId: head.id,
      rootGraphHash: head.rootGraphHash,
      revisionKind: head.kind,
      revisionMessage: head.message,
    }, "");
    if (!snapshot) {
      setBusy(false);
      setError(bt("버전을 저장하지 못했습니다. 다시 시도해 주세요.", "Could not save the version. Please try again."));
      setErrorContext({ source: "one-click" });
      return;
    }
    const link = issueLinkForSnapshot(snapshot, settings);
    setBusy(false);
    if (!link) {
      setError(bt("공유 링크를 발급하지 못했습니다.", "Could not issue the share link."));
      setErrorContext({ source: "one-click" });
      return;
    }
    // 축하 연출
    celebrate();
    refresh();
    onChanged();
  }, [artifactId, bt, celebrate, issueLinkForSnapshot, onChanged, process.headRevision, refresh, settings]);

  const handleShareExisting = useCallback((snapshot: ProductionManuscriptSnapshot) => {
    setError(null);
    setErrorContext(null);
    const link = issueLinkForSnapshot(snapshot, settings);
    if (link) {
      celebrate();
    } else {
      setError(bt("공유 링크를 발급하지 못했습니다.", "Could not issue the share link."));
      setErrorContext({ source: "share", snapshot });
    }
  }, [bt, celebrate, issueLinkForSnapshot, settings]);

  const handleRetry = useCallback(() => {
    if (!errorContext) return;
    if (errorContext.source === "one-click") {
      handleOneClick();
    } else {
      handleShareExisting(errorContext.snapshot);
    }
  }, [errorContext, handleOneClick, handleShareExisting]);

  const handleRevoke = useCallback((linkId: string) => {
    setLinks(revokeVersionShareLink(artifactId, linkId));
    setFreshLink((current) => current?.id === linkId ? { ...current, revoked: true } : current);
  }, [artifactId]);

  const handleCopy = useCallback(async () => {
    if (!freshLink) return;
    try {
      await navigator.clipboard.writeText(freshLink.url);
    } catch {
      // 클립보드 API 실패 시에도 토스트는 보여주고, input 포커스로 수동 복사를 유도한다.
      document.getElementById("ocvs-share-url-input")?.focus();
    }
    setCopied(true);
    setToastLeaving(false);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      setToastLeaving(true);
      window.setTimeout(() => {
        setCopied(false);
        setToastLeaving(false);
      }, 260);
    }, 1600);
  }, [freshLink]);

  const patchSettings = useCallback((patch: Partial<VersionShareSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const headMissing = !process.headRevision;

  return <section className="overflow-hidden rounded-3xl border border-line bg-card" aria-labelledby={headingId}>
    {/* 히어로: 원클릭 버튼 */}
    <div className="relative overflow-hidden bg-gradient-to-br from-accent-soft/40 via-card to-card p-5 sm:p-7">
      <Confetti pieces={confettiPieces} />
      <p className="text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">ONE-CLICK SHARE</p>
      <h2 id={headingId} className="mt-2 text-xl font-black text-fg sm:text-2xl">
        {bt("클릭 한 번으로 버전 만들고 공유하기", "Version & share in one click")}
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-fg-2">
        {bt(
          "현재 작업본을 버전으로 저장하고 공유 링크까지 자동으로 발급합니다. 마법사 없이 바로 공유할 수 있어요.",
          "Save the current work as a version and get a share link automatically. No wizard needed.",
        )}
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={handleOneClick}
          disabled={!canEdit || busy || headMissing}
          data-celebrating={celebrating}
          title={headMissing
            ? bt("작업본이 없어 버전을 만들 수 없습니다", "No working copy to version")
            : bt("현재 작업본으로 새 버전을 만들고 공유 링크를 발급합니다", "Create a new version and issue a share link")}
          className="ocvs-hero-button inline-flex min-h-14 items-center justify-center gap-2.5 rounded-2xl bg-accent px-7 text-base font-black text-on-accent shadow-lg shadow-accent/25 transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          {busy
            ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            : <Sparkles className="size-5" aria-hidden="true" />}
          {busy
            ? bt("버전 만드는 중…", "Creating version…")
            : bt("새 버전 만들고 공유하기", "New version & share")}
        </button>
        <button
          type="button"
          onClick={() => setShowSettings((value) => !value)}
          aria-expanded={showSettings}
          aria-controls="ocvs-settings-panel"
          className={buttonClass({ variant: "outline", size: "sm" })}
        >
          <Settings2 className="size-4" aria-hidden="true" />
          {bt("공유 설정", "Share settings")}
        </button>
      </div>
      {!canEdit ? <p className="mt-3 text-xs text-fg-3">
        {bt("버전을 만들려면 편집 권한이 필요합니다.", "Edit permission is required to create versions.")}
      </p> : null}
      <div className="mt-6 max-w-[340px] text-fg-3" aria-hidden="true">
        <VersionFlowDiagram
          className="h-auto w-full"
          labels={[
            bt("작업본", "Working copy"),
            bt("버전 저장", "Save version"),
            bt("링크 공유", "Share link"),
          ]}
        />
      </div>
    </div>

    {error ? <div
      role="alert"
      className="mx-5 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad sm:mx-7"
    >
      <p className="min-w-0 flex-1">{error}</p>
      {errorContext ? <button
        type="button"
        onClick={handleRetry}
        className={buttonClass({ variant: "outline", size: "sm" })}
      >
        {bt("다시 시도", "Retry")}
      </button> : null}
    </div> : null}

    {/* 공유 설정 */}
    {showSettings ? <ShareSettingsPanel
      bt={bt}
      headingId={settingsHeadingId}
      settings={settings}
      onPatch={patchSettings}
    /> : null}

    {/* 발급된 링크 리빌 카드 */}
    {freshLink && freshSnapshot ? <ShareLinkRevealCard
      bt={bt}
      link={freshLink}
      snapshot={freshSnapshot}
      qrDataUrl={qrDataUrl}
      onCopy={() => void handleCopy()}
      onOpenFullWizard={onOpenFullWizard}
    /> : null}

    {/* 버전 타임라인 */}
    <div className="border-t border-line p-5 sm:p-7" aria-labelledby={timelineHeadingId}>
      <h3 id={timelineHeadingId} className="flex items-center gap-2 text-sm font-black text-fg">
        <History className="size-4 text-accent" aria-hidden="true" />
        {bt("버전 히스토리", "Version history")}
        <span className="rounded-full bg-panel px-2 py-0.5 text-[0.625rem] font-black text-fg-2">
          {snapshots.length}
        </span>
      </h3>
      {snapshots.length > 0 ? <ol className="mt-4 space-y-3">
        {snapshots.map((snapshot, index) => <VersionTimelineItem
          key={snapshot.id}
          bt={bt}
          snapshot={snapshot}
          isLatest={index === 0}
          index={index}
          links={links}
          canEdit={canEdit}
          onShare={handleShareExisting}
          onOpenFullWizard={onOpenFullWizard}
          onRevoke={handleRevoke}
        />)}
      </ol> : <div className="mt-4 rounded-2xl border border-dashed border-line p-8 text-center">
        <EmptyVersionsArt className="mx-auto h-32 w-auto" />
        <p className="mt-2 font-black text-fg">{bt("아직 버전이 없습니다", "No versions yet")}</p>
        <p className="mt-1 text-sm text-fg-2">
          {bt(
            "아래 버튼을 누르면 첫 버전이 만들어지고 공유 링크가 바로 발급됩니다.",
            "Press the button below to create your first version with a share link.",
          )}
        </p>
        <button
          type="button"
          onClick={handleOneClick}
          disabled={!canEdit || busy || headMissing}
          className={cn(buttonClass(), "mt-4")}
        >
          <Sparkles className="size-4" aria-hidden="true" />
          {bt("첫 버전 만들기", "Create first version")}
        </button>
      </div>}
    </div>

    {/* 복사 토스트 */}
    {copied ? <CopiedToast bt={bt} leaving={toastLeaving} /> : null}

    {/* 외부 검수 마법사 연결 안내 (브리지) */}
    <p className="border-t border-line px-5 py-4 text-xs leading-5 text-fg-3 sm:px-7">
      {bt(
        "더 세밀한 검수 설정(제출본 선택·다운로드 허용 등)이 필요하면 외부 검수 마법사로 이어집니다. 원클릭 공유는 빠른 경로입니다.",
        "For finer review settings (submission choice, download permission), continue to the external review wizard. One-click share is the fast path.",
      )}
      <span className="ml-1 font-mono text-[0.625rem]">
        {bt("권한 매핑", "Permission mapping")}: {bt("보기", "View")}→viewer · {bt("댓글", "Comment")}→commenter · {bt("편집", "Edit")}→approver
      </span>
    </p>
  </section>;
}
