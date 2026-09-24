import { useCallback, useEffect, useRef, useState } from "react";
import { canonicalJson } from "@toonspectrum/studio-project-model";
import {
  DEFAULT_REVIEW_DELIVERY_PROFILE,
  reviewDeliveryListSchema,
  type ReviewDeliveryJob,
} from "@toonspectrum/studio-project-model/review-delivery";

import {
  getAuthSessionRevision,
  getAuthUserId,
  listeners as sessionListeners,
} from "@/compat/auth-session-state";
import { useAuthActorId } from "@/compat/use-auth-actor-id";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpaceVerifiedReview } from "../virtual-space/studio-virtual-space-review-invitation";
import {
  acceptStudioReviewDelivery,
  cancelStudioReviewDelivery,
  downloadStudioReviewDelivery,
  issueStudioReviewDelivery,
  listStudioReviewDeliveries,
  prepareStudioReviewDelivery,
} from "./studio-review-delivery-api";

const button = "min-h-11 rounded-lg border border-line px-3 text-sm disabled:opacity-50";
const field = "min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm";
const labels: Record<ReviewDeliveryJob["state"], readonly [string, string]> = {
  prepared: ["준비됨", "Prepared"],
  issued: ["전달 발행", "Issued"],
  delivered: ["수신자 다운로드 요청", "Recipient download issued"],
  accepted: ["수신 완료", "Accepted"],
  cancelled: ["취소됨", "Cancelled"],
};

type DeliveryList = ReturnType<typeof reviewDeliveryListSchema.parse>;
type AuthorityGate = "offline" | "signed-out" | null;
type StableIdentity = { readonly fingerprint: string; readonly operationId: string };
type StablePrepareIdentity = StableIdentity & { readonly id: string };

function browserOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const result = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(result)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

function stableIdentity(
  current: StableIdentity | null,
  fingerprint: string,
): StableIdentity {
  return current?.fingerprint === fingerprint
    ? current
    : { fingerprint, operationId: crypto.randomUUID() };
}

function stablePrepareIdentity(
  current: StablePrepareIdentity | null,
  fingerprint: string,
): StablePrepareIdentity {
  return current?.fingerprint === fingerprint
    ? current
    : { fingerprint, id: crypto.randomUUID(), operationId: crypto.randomUUID() };
}

/** Account identity is part of this private delivery surface's React identity. */
export function StudioReviewDelivery({ verified }: {
  readonly verified: StudioVirtualSpaceVerifiedReview;
}) {
  const actorId = useAuthActorId();
  return <StudioReviewDeliveryForActor
    key={canonicalJson([actorId, verified.subject])}
    actorId={actorId}
    verified={verified}
  />;
}

function StudioReviewDeliveryForActor({ actorId, verified }: {
  readonly actorId: string | null;
  readonly verified: StudioVirtualSpaceVerifiedReview;
}) {
  const bt = useBilingual("StudioReviewDelivery");
  const subjectKey = canonicalJson(verified.subject);
  const workId = verified.subject.workId;
  const [data, setData] = useState<DeliveryList | null>(null);
  const [recipient, setRecipient] = useState("");
  const [title, setTitle] = useState(verified.review.title);
  const [statement, setStatement] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [online, setOnline] = useState(browserOnline);
  const [gate, setGate] = useState<AuthorityGate>(() => actorId ? null : "signed-out");
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const prepareAttempt = useRef<StablePrepareIdentity | null>(null);
  const commandAttempt = useRef<StableIdentity | null>(null);

  const current = useCallback((own: number, actor: string | null, session: number) => (
    own === generation.current
    && actor === actorId
    && actor === getAuthUserId()
    && session === getAuthSessionRevision()
    && document.visibilityState !== "hidden"
    && browserOnline()
  ), [actorId]);

  const invalidate = useCallback((reason: AuthorityGate = null) => {
    generation.current += 1;
    pending.current = false;
    active.current?.abort();
    active.current = null;
    setData(null);
    setBusy("");
    setNotice("");
    setGate(reason);
  }, []);

  const load = useCallback(async () => {
    if (!actorId) {
      invalidate("signed-out");
      return;
    }
    if (!browserOnline()) {
      setOnline(false);
      invalidate("offline");
      return;
    }
    if (document.visibilityState === "hidden") {
      invalidate();
      return;
    }
    const actor = actorId;
    const own = ++generation.current;
    const session = getAuthSessionRevision();
    active.current?.abort();
    active.current = null;
    setOnline(true);
    setGate(null);
    setNotice("");
    setBusy("list");
    try {
      const next = await listStudioReviewDeliveries(workId);
      if (!current(own, actor, session)) return;
      setData(next);
      setRecipient((value) => next.recipients.some((item) => item.userId === value)
        ? value
        : next.recipients[0]?.userId ?? "");
    } catch {
      if (current(own, actor, session)) {
        setData(null);
        setNotice(bt("공식 전달 목록을 확인하지 못했어요.", "Could not load official deliveries."));
      }
    } finally {
      if (current(own, actor, session)) setBusy("");
    }
  }, [actorId, bt, current, invalidate, workId]);

  useEffect(() => {
    void load();
    const sessionChanged = () => {
      const nextActor = getAuthUserId();
      invalidate(nextActor ? null : "signed-out");
      if (nextActor === actorId && document.visibilityState !== "hidden" && browserOnline()) void load();
    };
    const visible = () => {
      if (document.visibilityState === "hidden") invalidate();
      else void load();
    };
    const offline = () => {
      setOnline(false);
      invalidate("offline");
    };
    const backOnline = () => {
      setOnline(true);
      invalidate();
      void load();
    };
    const focus = () => {
      invalidate();
      void load();
    };
    sessionListeners.add(sessionChanged);
    document.addEventListener("visibilitychange", visible);
    globalThis.addEventListener("offline", offline);
    globalThis.addEventListener("online", backOnline);
    globalThis.addEventListener("focus", focus);
    return () => {
      generation.current += 1;
      pending.current = false;
      active.current?.abort();
      active.current = null;
      sessionListeners.delete(sessionChanged);
      document.removeEventListener("visibilitychange", visible);
      globalThis.removeEventListener("offline", offline);
      globalThis.removeEventListener("online", backOnline);
      globalThis.removeEventListener("focus", focus);
    };
  }, [actorId, invalidate, load, subjectKey]);

  const action = async (
    key: string,
    operation: () => Promise<unknown>,
    success: string,
  ): Promise<boolean> => {
    if (!actorId || !online || pending.current || busy) return false;
    pending.current = true;
    const actor = actorId;
    const session = getAuthSessionRevision();
    const own = generation.current;
    setBusy(key);
    setNotice("");
    try {
      await operation();
      if (!current(own, actor, session)) return false;
      setNotice(success);
      await load();
      return true;
    } catch {
      if (current(own, actor, session)) {
        setNotice(bt(
          "결과를 확정하지 못했어요. 같은 요청으로 다시 시도하면 중복 처리하지 않습니다.",
          "The result could not be confirmed. Retrying the same request will not duplicate it.",
        ));
      }
      return false;
    } finally {
      pending.current = false;
      if (current(generation.current, actorId, getAuthSessionRevision())) setBusy("");
    }
  };

  const prepare = async () => {
    if (!data?.canPrepare || !recipient || !confirmed || !statement.trim() || busy || !online) return;
    const normalizedTitle = title.trim() || verified.review.title;
    const normalizedStatement = statement.trim();
    const fingerprint = canonicalJson({
      kind: "prepare",
      subject: verified.subject,
      title: normalizedTitle,
      recipient,
      mode: data.mode,
      statement: normalizedStatement,
      profile: DEFAULT_REVIEW_DELIVERY_PROFILE,
    });
    const identity = stablePrepareIdentity(prepareAttempt.current, fingerprint);
    prepareAttempt.current = identity;
    const succeeded = await action(`prepare:${identity.id}`, async () => {
      const rightsGraphDigest = await digest({
        subject: verified.subject,
        recipient,
        mode: data.mode,
        statement: normalizedStatement,
        profile: DEFAULT_REVIEW_DELIVERY_PROFILE,
      });
      return prepareStudioReviewDelivery(verified.subject.workId, {
        id: identity.id,
        operationId: identity.operationId,
        subject: verified.subject,
        title: normalizedTitle,
        recipientUserId: recipient,
        profile: DEFAULT_REVIEW_DELIVERY_PROFILE,
        rights: {
          contract: "studio-review-delivery-rights-v1",
          statementVersion: 1,
          mode: data.mode,
          rightsGraphDigest,
          confirmed: true,
          statement: normalizedStatement,
        },
      });
    }, bt(
      "공식 전달을 준비했어요. 발행 전 manifest를 확인하세요.",
      "Official delivery prepared. Check the manifest before issuing.",
    ));
    if (succeeded) {
      prepareAttempt.current = null;
      setConfirmed(false);
    }
  };

  const command = async (job: ReviewDeliveryJob, kind: "issue" | "cancel" | "accept") => {
    const fingerprint = canonicalJson({
      kind,
      deliveryId: job.id,
      workId: job.workId,
      expectedVersion: job.version,
      manifestDigest: job.manifestDigest,
    });
    const identity = stableIdentity(commandAttempt.current, fingerprint);
    commandAttempt.current = identity;
    const input = {
      operationId: identity.operationId,
      expectedVersion: job.version,
      manifestDigest: job.manifestDigest,
    };
    const succeeded = await action(`${kind}:${job.id}`, () => (
      kind === "issue"
        ? issueStudioReviewDelivery(job.workId, job.id, input)
        : kind === "cancel"
          ? cancelStudioReviewDelivery(job.workId, job.id, input)
          : acceptStudioReviewDelivery(job.workId, job.id, { ...input, confirmed: true })
    ), kind === "issue"
      ? bt("수신자에게 전달을 발행했어요.", "Delivery issued to the recipient.")
      : kind === "cancel"
        ? bt("전달을 취소했어요.", "Delivery cancelled.")
        : bt("수신 완료를 확인했어요.", "Receipt accepted."));
    if (succeeded) commandAttempt.current = null;
  };

  const download = async (job: ReviewDeliveryJob) => {
    if (busy || !online) return;
    const fingerprint = canonicalJson({
      kind: "download",
      deliveryId: job.id,
      workId: job.workId,
      expectedVersion: job.version,
      manifestDigest: job.manifestDigest,
    });
    const identity = stableIdentity(commandAttempt.current, fingerprint);
    commandAttempt.current = identity;
    const controller = new AbortController();
    active.current = controller;
    const input = {
      operationId: identity.operationId,
      expectedVersion: job.version,
      manifestDigest: job.manifestDigest,
    };
    const succeeded = await action(`download:${job.id}`, async () => {
      const blob = await downloadStudioReviewDelivery(job.workId, job.id, input, controller.signal);
      const { downloadBlob } = await import("../export/studio-export");
      downloadBlob(blob, `toonstudio-approved-delivery-${job.id}.zip`);
    }, bt(
      "검증된 전달 ZIP 다운로드를 요청했어요.",
      "Verified delivery ZIP download requested.",
    ));
    if (succeeded) commandAttempt.current = null;
    if (active.current === controller) active.current = null;
  };

  return <section className="mt-4 space-y-3 rounded-xl border border-line p-3" aria-label={bt("공식 전달과 수신 확인", "Official delivery and receipt")}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="font-semibold">{bt("공식 전달", "Official delivery")}</h3>
        <p className="text-sm text-fg-2">{bt(
          "승인된 정확한 원본 이미지·해시·운영 모드를 고정하고 팀 수신자의 다운로드와 수락을 따로 기록합니다.",
          "Pin the exact approved images, checksums, and operating mode, then record recipient download and acceptance separately.",
        )}</p>
      </div>
      <button type="button" className={button} disabled={Boolean(busy) || !actorId || !online} onClick={() => void load()}>{bt("새로 확인", "Refresh")}</button>
    </div>

    {gate ? <p role="alert" className="rounded-lg border border-warn/35 bg-warn/10 p-3 text-sm">
      {gate === "offline"
        ? bt("연결이 복구되어 현재 권한과 전달 버전을 다시 확인하기 전에는 공식 전달을 실행하지 않습니다.", "Official delivery is disabled until reconnection and fresh authority verification.")
        : bt("로그인한 계정으로 공식 전달 권한을 다시 확인해 주세요.", "Sign in and verify official delivery access again.")}
    </p> : null}

    {data?.canPrepare ? <div className="grid gap-3 rounded-lg bg-panel p-3 md:grid-cols-2">
      <label className="text-sm">{bt("수신 팀원", "Team recipient")}
        <select className={`${field} mt-1`} value={recipient} disabled={Boolean(busy) || !online} onChange={(event) => setRecipient(event.target.value)}>
          {!data.recipients.length ? <option value="">{bt("전달 가능한 팀원이 없습니다", "No eligible team recipient")}</option> : null}
          {data.recipients.map((item) => <option key={item.userId} value={item.userId}>{item.displayName}</option>)}
        </select>
      </label>
      <label className="text-sm">{bt("전달 제목", "Delivery title")}
        <input className={`${field} mt-1`} maxLength={160} value={title} disabled={Boolean(busy) || !online} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="text-sm md:col-span-2">{bt("권리·사용 조건 확인 근거", "Rights and usage attestation")}
        <textarea className="mt-1 min-h-24 w-full rounded-lg border border-line bg-card p-3 text-sm" maxLength={2000} value={statement} disabled={Boolean(busy) || !online} onChange={(event) => setStatement(event.target.value)} />
      </label>
      <label className="flex min-h-11 items-start gap-2 text-sm md:col-span-2">
        <input type="checkbox" className="mt-1 size-5" checked={confirmed} disabled={Boolean(busy) || !online} onChange={(event) => setConfirmed(event.target.checked)} />
        {bt(
          `${data.mode === "paid" ? "유료" : "무료"} 운영 모드와 위 근거를 확인했습니다. 이는 자동 법률 인증이 아닙니다.`,
          `I confirmed the ${data.mode} operating mode and the statement above. This is not automatic legal certification.`,
        )}
      </label>
      <button type="button" className={button} disabled={!recipient || !confirmed || !statement.trim() || Boolean(busy) || !online} onClick={() => void prepare()}>{bt("전달 준비", "Prepare delivery")}</button>
    </div> : null}

    <div className="space-y-3">{data?.items.map((job) => <article key={job.id} className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold">{job.title}</h4>
          <p className="text-sm text-fg-2">{job.recipient.displayName} · {bt(...labels[job.state])}</p>
        </div>
        <code className="break-all text-xs">{job.manifestDigest}</code>
      </div>
      <details className="mt-2 text-xs">
        <summary>{bt("고정 manifest 확인", "Inspect pinned manifest")}</summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-panel p-2">{JSON.stringify(job.manifest, null, 2)}</pre>
      </details>
      {!job.currentRecipientBinding && job.state !== "cancelled" ? <p role="alert" className="mt-2 text-sm">{bt(
        "수신자의 현재 팀 권한이 준비 당시와 달라 다운로드·수락을 막았습니다.",
        "Recipient access changed since preparation; download and acceptance are blocked.",
      )}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {job.canIssue ? <button type="button" className={button} disabled={Boolean(busy) || !online} onClick={() => void command(job, "issue")}>{bt("전달 발행", "Issue")}</button> : null}
        {job.canDownload ? <button type="button" className={button} disabled={Boolean(busy) || !online} onClick={() => void download(job)}>{bt("검증 ZIP 저장", "Save verified ZIP")}</button> : null}
        {job.canAccept ? <button type="button" className={button} disabled={Boolean(busy) || !online} onClick={() => void command(job, "accept")}>{bt("수신 완료 확인", "Accept receipt")}</button> : null}
        {job.canCancel ? <button type="button" className={button} disabled={Boolean(busy) || !online} onClick={() => void command(job, "cancel")}>{bt("전달 취소", "Cancel delivery")}</button> : null}
      </div>
    </article>)}</div>

    {data && !data.items.length ? <p className="text-sm text-fg-2">{bt("아직 공식 전달 기록이 없습니다.", "No official delivery records yet.")}</p> : null}
    {busy ? <p role="status" className="text-sm">{bt("현재 상태를 확인 중…", "Checking current state…")}</p> : null}
    {notice ? <p role="status" className="text-sm">{notice}</p> : null}
  </section>;
}
