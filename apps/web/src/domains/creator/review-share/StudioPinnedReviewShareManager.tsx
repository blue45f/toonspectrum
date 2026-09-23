import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getAuthSessionRevision,
  getAuthUserId,
  listeners as sessionListeners,
} from "@/compat/auth-session-state";
import { useAuthActorId } from "@/compat/use-auth-actor-id";
import type {
  PinnedShareCreate,
  PinnedShareOwnerView,
  PinnedSharePage,
} from "@toonspectrum/studio-project-model/pinned-review-share";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpaceVerifiedReview } from "../virtual-space/studio-virtual-space-review-invitation";
import {
  createPinnedReviewShare,
  listPinnedReviewShareSources,
  listPinnedReviewShares,
  revokePinnedReviewShare,
} from "./studio-pinned-review-share-client";

type Purpose = PinnedShareCreate["purpose"];
type Role = PinnedShareCreate["role"];

interface OneTimeLink {
  readonly url: string;
  readonly purpose: Purpose;
  readonly replayed: boolean;
}

const purposeLabel = (purpose: Purpose, ko: boolean) => ({
  "external-review": ko ? "외부 검토" : "External review",
  mentoring: ko ? "멘토링" : "Mentoring",
  showcase: ko ? "공개 전시" : "Public showcase",
})[purpose];

function activeShare(share: PinnedShareOwnerView): boolean {
  return !share.revokedAt && Date.parse(share.expiresAt) > Date.now();
}

function absoluteShareUrl(share: PinnedShareOwnerView, token: string | null): string | null {
  if (typeof window === "undefined") return null;
  if (share.input.purpose === "showcase") {
    return new URL(`/showcase/reviews/${encodeURIComponent(share.id)}`, window.location.origin).toString();
  }
  if (!token) return null;
  const url = new URL("/production/pinned-review", window.location.origin);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}

export function StudioPinnedReviewShareManager({ verified }: {
  readonly verified: StudioVirtualSpaceVerifiedReview;
}) {
  const actorId = useAuthActorId();
  return <StudioPinnedReviewShareManagerForActor
    key={JSON.stringify([actorId, verified.subject])}
    actorId={actorId}
    verified={verified}
  />;
}

function StudioPinnedReviewShareManagerForActor({ actorId, verified }: {
  readonly actorId: string | null;
  readonly verified: StudioVirtualSpaceVerifiedReview;
}) {
  const bt = useBilingual("StudioPinnedReviewShareManager");
  const key = JSON.stringify(verified.subject);
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<PinnedSharePage[]>([]);
  const [sourceOffset, setSourceOffset] = useState<number | null>(0);
  const [sourceApproved, setSourceApproved] = useState(false);
  const [shares, setShares] = useState<PinnedShareOwnerView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [purpose, setPurpose] = useState<Purpose>("external-review");
  const [role, setRole] = useState<Role>("commenter");
  const [title, setTitle] = useState(verified.review.title);
  const [instructions, setInstructions] = useState("");
  const [expiresInHours, setExpiresInHours] = useState(72);
  const [watermark, setWatermark] = useState(true);
  const [rightsStatement, setRightsStatement] = useState("");
  const [publicationConsent, setPublicationConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [oneTimeLink, setOneTimeLink] = useState<OneTimeLink | null>(null);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const [authorityEpoch, setAuthorityEpoch] = useState(0);
  const generation = useRef<object>({});
  const attempted = useRef<{ fingerprint: string; id: string; operationId: string } | null>(null);

  const currentAuthority = useCallback((own: object, sessionRevision: number): boolean => {
    const publishedActor = getAuthUserId();
    return own === generation.current
      && sessionRevision === getAuthSessionRevision()
      && publishedActor === actorId
      && document.visibilityState !== "hidden"
      && (typeof navigator === "undefined" || navigator.onLine !== false);
  }, [actorId]);

  const refreshShares = async (append = false) => {
    const own = generation.current, sessionRevision = getAuthSessionRevision();
    if (!actorId || !online || document.visibilityState === "hidden") return;
    const cursor = append ? nextCursor : null;
    const result = await listPinnedReviewShares(verified.subject.workId, cursor);
    if (!currentAuthority(own, sessionRevision)) return;
    setShares((current) => append ? [...current, ...result.items] : result.items);
    setNextCursor(result.nextCursor);
  };

  const loadSources = async (offset: number, append = false) => {
    const own = generation.current, sessionRevision = getAuthSessionRevision();
    if (!actorId || !online || document.visibilityState === "hidden") return;
    const result = await listPinnedReviewShareSources(verified.subject.workId, verified.subject, offset);
    if (!currentAuthority(own, sessionRevision)) return;
    setSources((current) => {
      const combined = append ? [...current, ...result.pages] : result.pages;
      return [...new Map(combined.map((page) => [page.ordinal, page])).values()].sort((a, b) => a.ordinal - b.ordinal);
    });
    setSelected((current) => current.length ? current : result.pages.map((page) => page.ordinal));
    setSourceApproved(result.approved);
    setSourceOffset(result.nextOffset);
  };

  useEffect(() => {
    if (!open) {
      generation.current = {};
      return;
    }
    const own = {}, sessionRevision = getAuthSessionRevision();
    generation.current = own;
    setLoading(true); setNotice(""); setOneTimeLink(null); setSources([]); setShares([]); setSelected([]);
    setSourceOffset(0); setSourceApproved(false); setNextCursor(null); setTitle(verified.review.title);
    if (!actorId) {
      setLoading(false);
      setNotice(bt("로그인한 계정으로 공유 권한을 다시 확인해 주세요.", "Sign in and verify share access again."));
      return () => { generation.current = {}; };
    }
    if (!online || document.visibilityState === "hidden") {
      setLoading(false);
      setNotice(bt("연결이 복구되고 화면이 활성화되면 공유 범위를 다시 확인합니다.", "Share scope will be checked again after reconnection and focus."));
      return () => { generation.current = {}; };
    }
    void Promise.all([
      listPinnedReviewShareSources(verified.subject.workId, verified.subject, 0),
      listPinnedReviewShares(verified.subject.workId, null),
    ]).then(([sourceResult, shareResult]) => {
      if (!currentAuthority(own, sessionRevision)) return;
      setSources(sourceResult.pages);
      setSelected(sourceResult.pages.map((page) => page.ordinal));
      setSourceOffset(sourceResult.nextOffset);
      setSourceApproved(sourceResult.approved);
      setShares(shareResult.items);
      setNextCursor(shareResult.nextCursor);
    }).catch(() => {
      if (currentAuthority(own, sessionRevision)) {
        setNotice(bt("공유 가능한 검수본을 불러오지 못했어요.", "Could not load shareable review pages."));
      }
    }).finally(() => {
      if (currentAuthority(own, sessionRevision)) setLoading(false);
    });
    return () => { generation.current = {}; };
  }, [actorId, authorityEpoch, bt, currentAuthority, key, online, open, verified.review.title, verified.subject, verified.subject.workId]);

  useEffect(() => {
    const refreshAuthority = () => setAuthorityEpoch((value) => value + 1);
    const onlineChanged = () => {
      setOnline(typeof navigator === "undefined" || navigator.onLine !== false);
      refreshAuthority();
    };
    const visibilityChanged = () => refreshAuthority();
    sessionListeners.add(refreshAuthority);
    globalThis.addEventListener("focus", refreshAuthority);
    globalThis.addEventListener("online", onlineChanged);
    globalThis.addEventListener("offline", onlineChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      sessionListeners.delete(refreshAuthority);
      globalThis.removeEventListener("focus", refreshAuthority);
      globalThis.removeEventListener("online", onlineChanged);
      globalThis.removeEventListener("offline", onlineChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, []);

  useEffect(() => {
    if (purpose === "showcase") {
      setRole("viewer");
    } else {
      setPublicationConsent(false);
    }
  }, [purpose]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const showcaseAllowed = sourceApproved && verified.review.status === "approved";
  const canCreate = Boolean(actorId) && online && selected.length > 0 && title.trim().length > 0 && !busy
    && (purpose !== "showcase" || (showcaseAllowed && publicationConsent && rightsStatement.trim().length > 0));

  const togglePage = (ordinal: number) => {
    setSelected((current) => current.includes(ordinal)
      ? current.filter((value) => value !== ordinal)
      : [...current, ordinal].sort((a, b) => a - b));
  };

  const create = async () => {
    if (!canCreate) return;
    const normalizedRole: Role = purpose === "showcase" ? "viewer" : role;
    const inputWithoutIdentity = {
      subject: verified.subject,
      title: title.trim(),
      instructions: instructions.trim(),
      purpose,
      role: normalizedRole,
      pageOrdinals: selected,
      expiresInHours,
      watermark,
      rightsStatement: rightsStatement.trim(),
      publicationConsent: purpose === "showcase" && publicationConsent,
    } satisfies Omit<PinnedShareCreate, "id" | "operationId">;
    const fingerprint = JSON.stringify(inputWithoutIdentity);
    if (attempted.current?.fingerprint !== fingerprint) {
      attempted.current = { fingerprint, id: crypto.randomUUID(), operationId: crypto.randomUUID() };
    }
    const identity = attempted.current;
    const own = generation.current, sessionRevision = getAuthSessionRevision();
    setBusy(true); setNotice(""); setOneTimeLink(null);
    try {
      const result = await createPinnedReviewShare(verified.subject.workId, { ...inputWithoutIdentity, ...identity });
      if (!currentAuthority(own, sessionRevision)) return;
      attempted.current = null;
      const url = absoluteShareUrl(result.share, result.token);
      if (url) setOneTimeLink({ url, purpose: result.share.input.purpose, replayed: result.replayed });
      setNotice(result.replayed && !url
        ? bt("이 요청은 이미 처리됐어요. 비공개 토큰은 다시 표시되지 않으므로 새 공유를 만들어 주세요.", "This request was already processed. Private tokens are not shown twice; create a new share if you need another link.")
        : bt("선택한 고정 검수본으로 공유 링크를 만들었어요.", "Created a link for the selected immutable review pages."));
      await refreshShares();
    } catch {
      if (currentAuthority(own, sessionRevision)) setNotice(bt("공유 생성 결과를 확인하지 못했어요. 같은 입력으로 다시 시도하면 중복 생성하지 않습니다.", "Could not confirm share creation. Retrying the same input will not create a duplicate."));
    } finally {
      if (currentAuthority(own, sessionRevision)) setBusy(false);
    }
  };

  const revoke = async (share: PinnedShareOwnerView) => {
    if (busy || !activeShare(share)) return;
    const own = generation.current, sessionRevision = getAuthSessionRevision();
    setBusy(true); setNotice(""); setOneTimeLink(null);
    try {
      const updated = await revokePinnedReviewShare(verified.subject.workId, share.id);
      if (!currentAuthority(own, sessionRevision)) return;
      setShares((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice(bt("공유 링크를 철회했어요.", "Revoked the share link."));
    } catch {
      if (currentAuthority(own, sessionRevision)) setNotice(bt("철회 결과를 확인하지 못했어요. 목록을 새로 확인해 주세요.", "Could not confirm revocation. Refresh the list before retrying."));
    } finally {
      if (currentAuthority(own, sessionRevision)) setBusy(false);
    }
  };

  return <section className="mt-4 rounded-xl border border-line p-3" aria-label={bt("고정 검수본 공유", "Share immutable review")}>
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">{bt("외부 검토·멘토링·전시 링크", "External review, mentoring and showcase links")}</summary>
      {open ? <>
      <p className="mt-2 text-sm text-fg-2">{bt("현재 편집본이 아니라 선택한 검수 이미지의 해시와 페이지 범위를 고정합니다. 비공개 토큰은 생성 직후 한 번만 표시됩니다.", "Pins the selected review images, hashes and page range rather than the current editable work. Private tokens are shown only once after creation.")}</p>
      {loading ? <p role="status" className="mt-3 text-sm">{bt("공유 범위 확인 중…", "Checking share scope…")}</p> : <>
        <fieldset className="mt-4 rounded-lg border border-line p-3">
          <legend className="px-1 text-sm font-semibold">{bt("공유할 페이지", "Pages to share")}</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sources.map((page) => <label key={page.ordinal} className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm">
              <input type="checkbox" checked={selectedSet.has(page.ordinal)} disabled={busy} onChange={() => togglePage(page.ordinal)} />
              <span>{bt(`${page.ordinal + 1}페이지`, `Page ${page.ordinal + 1}`)}</span>
              <span className="ml-auto text-xs text-fg-3">{Math.ceil(page.byteLength / 1024)} KB</span>
            </label>)}
          </div>
          {sourceOffset !== null ? <button type="button" className="mt-3 min-h-11 rounded-lg border border-line px-3 text-sm" disabled={busy || !online}
            onClick={() => { setBusy(true); void loadSources(sourceOffset, true).catch(() => setNotice(bt("다음 페이지를 불러오지 못했어요.", "Could not load more pages."))).finally(() => setBusy(false)); }}>
            {bt("페이지 더 불러오기", "Load more pages")}</button> : null}
        </fieldset>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-sm font-semibold">{bt("사용 목적", "Purpose")}
            <select className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3" value={purpose} disabled={busy}
              onChange={(event) => setPurpose(event.target.value as Purpose)}>
              <option value="external-review">{bt("외부 검토", "External review")}</option>
              <option value="mentoring">{bt("멘토링", "Mentoring")}</option>
              <option value="showcase">{bt("공개 전시", "Public showcase")}</option>
            </select>
          </label>
          <label className="text-sm font-semibold">{bt("권한", "Access")}
            <select className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3" value={purpose === "showcase" ? "viewer" : role}
              disabled={busy || purpose === "showcase"} onChange={(event) => setRole(event.target.value as Role)}>
              <option value="viewer">{bt("열람만", "View only")}</option>
              <option value="commenter">{bt("열람·댓글", "View and comment")}</option>
            </select>
          </label>
          <label className="text-sm font-semibold md:col-span-2">{bt("링크 제목", "Link title")}
            <input className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3" maxLength={160} value={title} disabled={busy}
              onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="text-sm font-semibold md:col-span-2">{bt("검토 안내", "Review instructions")}
            <textarea className="mt-1 w-full rounded-lg border border-line bg-card p-3" rows={3} maxLength={2000} value={instructions} disabled={busy}
              onChange={(event) => setInstructions(event.target.value)} />
          </label>
          <label className="text-sm font-semibold">{bt("유효 시간", "Lifetime")}
            <select className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3" value={expiresInHours} disabled={busy}
              onChange={(event) => setExpiresInHours(Number(event.target.value))}>
              <option value={24}>{bt("24시간", "24 hours")}</option><option value={72}>{bt("3일", "3 days")}</option>
              <option value={168}>{bt("7일", "7 days")}</option><option value={720}>{bt("30일", "30 days")}</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 self-end rounded-lg border border-line px-3 text-sm">
            <input type="checkbox" checked={watermark} disabled={busy} onChange={(event) => setWatermark(event.target.checked)} />
            {bt("검토 워터마크 표시", "Show review watermark")}
          </label>
        </div>

        {purpose === "showcase" ? <div className="mt-4 space-y-3 rounded-lg border border-warn/40 bg-warn/10 p-3">
          {!showcaseAllowed ? <p role="alert" className="text-sm">{bt("공개 전시는 승인된 검수본에서만 만들 수 있어요.", "Public showcases require an approved review.")}</p> : null}
          <label className="block text-sm font-semibold">{bt("공개 권리 확인 근거", "Publication rights statement")}
            <textarea className="mt-1 w-full rounded-lg border border-line bg-card p-3" rows={2} maxLength={2000} value={rightsStatement} disabled={busy}
              onChange={(event) => setRightsStatement(event.target.value)} />
          </label>
          <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={publicationConsent} disabled={busy || !showcaseAllowed}
            onChange={(event) => setPublicationConsent(event.target.checked)} />
            <span>{bt("이 고정 검수본을 공개 전시에 게시하는 데 명시적으로 동의합니다. 원고 자체의 공개 상태는 바꾸지 않습니다.", "I explicitly consent to publishing this immutable review in the showcase. This does not change the manuscript's publication state.")}</span>
          </label>
        </div> : null}

        <button type="button" className="mt-4 min-h-11 rounded-lg border border-accent bg-accent px-4 text-sm font-bold text-on-accent disabled:opacity-50"
          disabled={!canCreate} onClick={() => { void create(); }}>{busy ? bt("처리 중…", "Working…") : bt("고정 공유 링크 만들기", "Create immutable share link")}</button>

        {oneTimeLink ? <div className="mt-4 rounded-lg border border-good/40 bg-good/10 p-3" role="status">
          <p className="text-sm font-semibold">{purposeLabel(oneTimeLink.purpose, true)} · {bt("지금 한 번만 표시되는 링크", "One-time link")}</p>
          <input aria-label={bt("공유 링크", "Share link")} className="mt-2 min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm" readOnly value={oneTimeLink.url} onFocus={(event) => event.currentTarget.select()} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm" onClick={() => {
              void navigator.clipboard?.writeText(oneTimeLink.url).then(() => setNotice(bt("링크를 복사했어요.", "Copied the link."))).catch(() => setNotice(bt("링크 입력란을 선택해 직접 복사해 주세요.", "Select the link field and copy it manually.")));
            }}>{bt("링크 복사", "Copy link")}</button>
            <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm" onClick={() => setOneTimeLink(null)}>{bt("링크 숨기기", "Hide link")}</button>
          </div>
        </div> : null}

        <div className="mt-5 border-t border-line pt-4">
          <h4 className="font-bold">{bt("만든 공유", "Created shares")}</h4>
          <div className="mt-2 space-y-2">
            {shares.map((share) => {
              const active = activeShare(share);
              return <article key={share.id} className="rounded-lg border border-line p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="font-semibold">{share.input.title}</p><p className="text-xs text-fg-3">{purposeLabel(share.input.purpose, true)} · {share.input.pageOrdinals.length}{bt("페이지", " pages")}</p></div>
                  <span className="rounded-full border border-line px-2 py-1 text-xs">{share.revokedAt ? bt("철회됨", "Revoked") : active ? bt("사용 가능", "Active") : bt("만료됨", "Expired")}</span>
                </div>
                <p className="mt-2 text-xs text-fg-3">{bt("만료", "Expires")} · <time dateTime={share.expiresAt}>{new Date(share.expiresAt).toLocaleString()}</time></p>
                {active ? <button type="button" className="mt-2 min-h-11 rounded-lg border border-bad/50 px-3 text-sm text-bad" disabled={busy || !online}
                  onClick={() => { void revoke(share); }}>{bt("링크 철회", "Revoke link")}</button> : null}
              </article>;
            })}
            {!shares.length ? <p className="text-sm text-fg-3">{bt("아직 만든 공유가 없어요.", "No shares have been created yet.")}</p> : null}
          </div>
          {nextCursor ? <button type="button" className="mt-3 min-h-11 rounded-lg border border-line px-3 text-sm" disabled={busy || !online}
            onClick={() => { setBusy(true); void refreshShares(true).catch(() => setNotice(bt("공유 목록을 더 불러오지 못했어요.", "Could not load more shares."))).finally(() => setBusy(false)); }}>
            {bt("공유 더 불러오기", "Load more shares")}</button> : null}
        </div>
      </>}
      {notice ? <p className="mt-3 text-sm" role="status">{notice}</p> : null}
      </> : null}
    </details>
  </section>;
}
