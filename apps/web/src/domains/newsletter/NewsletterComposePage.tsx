/**
 * 작가 뉴스레터 작성·발송 페이지(`/newsletter/compose`).
 *
 * 필명(작가 이름) 단위로 구독자 수를 확인하고, 제목·본문을 써서 임시 저장하거나
 * 발송한다. 발송 전 미리보기로 실제 메일 형태를 확인한다.
 *
 * 주의: 실제 이메일은 아직 나가지 않는다. 발송은 로컬 기록 전용 어댑터를 통한
 * 상태 전이 + 이력 기록까지만이며, 화면에도 그 사실을 그대로 표시한다
 * (`newsletter-mail-adapter.ts`가 유일한 실제 발송 연결 지점).
 */

import { Eye, History, PenLine, Plus, Save, Send, Trash2, Users } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { getAuthSession } from "@/domains/auth/public/session/auth-session-state";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useAuthActorId } from "@/domains/auth/public/session/use-auth-actor-id";
import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { NOINDEX_PRIVATE_ROBOTS } from "@/shared/lib/seo-route-policy";
import { formatCount } from "@/shared/lib/utils";
import { useDocumentTitle, useMetaRobots } from "@/shared/seo/use-document-title";

import {
  buildNewsletterPreview,
  countNewsletterSubscribers,
  listAuthorNewsletterIssues,
  listAuthorNewsletterSendHistory,
} from "./newsletter-model";
import { useNewsletterStore } from "./newsletter-store";
import type { NewsletterIssue, SendIssueFailureReason } from "./newsletter-types";

type Notice = { readonly kind: "success" | "error"; readonly text: string } | null;

/**
 * 뉴스레터 스토어는 IndexedDB 비동기 persist라, 복원이 끝나기 전에 화면을 열면
 * 빈 초기 상태가 진짜처럼 보이고(구독자 0명·초안 없음), 그 상태에서 임시 저장을
 * 누르면 복원된 issues에 방금 만든 초안이 덮여 사라진다. 복원 완료를 게이트로 쓴다.
 */
function useNewsletterHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useNewsletterStore.persist.onFinishHydration(cb),
    () => useNewsletterStore.persist.hasHydrated(),
    () => false,
  );
}

export function NewsletterComposePage() {
  const t = useBilingual("newsletter");
  const actorId = useAuthActorId();
  useDocumentTitle("뉴스레터 작성");
  useMetaRobots(NOINDEX_PRIVATE_ROBOTS);
  const hydrated = useNewsletterHydrated();

  const penName = useNewsletterStore((state) => state.penName);
  const setPenName = useNewsletterStore((state) => state.setPenName);
  const subscriptions = useNewsletterStore((state) => state.subscriptions);
  const issues = useNewsletterStore((state) => state.issues);
  const sendHistory = useNewsletterStore((state) => state.sendHistory);
  const createIssue = useNewsletterStore((state) => state.createIssue);
  const updateIssue = useNewsletterStore((state) => state.updateIssue);
  const deleteIssue = useNewsletterStore((state) => state.deleteIssue);
  const sendIssue = useNewsletterStore((state) => state.sendIssue);

  const [penNameInput, setPenNameInput] = useState<string>(
    () => penName ?? getAuthSession()?.user.name ?? "",
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (penName) setPenNameInput(penName);
  }, [penName]);

  const myIssues = penName ? listAuthorNewsletterIssues(issues, penName) : [];
  const myHistory = penName ? listAuthorNewsletterSendHistory(sendHistory, penName) : [];
  const subscriberCount = penName ? countNewsletterSubscribers(subscriptions, penName) : 0;
  const editingIssue = myIssues.find((issue) => issue.id === editingId) ?? null;
  const editingSent = editingIssue?.status === "sent";
  const editorLocked = !penName || editingSent;
  const preview = buildNewsletterPreview({ authorName: penName ?? "", title, body });

  const failureCopy = (reason: SendIssueFailureReason): string => {
    switch (reason) {
      case "empty-title":
        return t("제목을 입력해 주세요.", "Please enter a subject.");
      case "empty-body":
        return t("본문을 입력해 주세요.", "Please write the body.");
      case "no-subscribers":
        return t(
          "아직 이 브라우저에서 구독한 독자가 없어 발송할 수 없어요.",
          "No reader has subscribed from this browser yet, so there is no one to send to.",
        );
      case "already-sent":
        return t("이미 발송한 뉴스레터예요.", "This newsletter was already sent.");
      case "not-found":
        return t("초안을 찾을 수 없어요.", "The draft could not be found.");
    }
  };

  const startNew = () => {
    setEditingId(null);
    setTitle("");
    setBody("");
    setNotice(null);
  };

  const loadIssue = (issue: NewsletterIssue) => {
    setEditingId(issue.id);
    setTitle(issue.title);
    setBody(issue.body);
    setNotice(null);
  };

  /** 편집 내용을 초안으로 확정하고 그 ID를 돌려준다. 발송 전에도 같은 경로를 쓴다. */
  const saveDraft = (): string | null => {
    if (!penName) return null;
    if (editingId) {
      const updated = updateIssue(editingId, { title, body });
      return updated ? updated.id : null;
    }
    const created = createIssue(penName, { title, body });
    setEditingId(created.id);
    return created.id;
  };

  /** 초안을 확정하지 못한 이유를 공지로 남긴다 — 조용히 끝나면 사용자는 저장된 줄 안다. */
  const draftFailureNotice = () => {
    setNotice({
      kind: "error",
      text: !penName
        ? t("필명을 먼저 저장해 주세요. 필명이 있어야 초안을 만들 수 있어요.", "Save your pen name first — a draft needs one.")
        : t("임시 저장하지 못했어요. 편집 중인 초안을 찾을 수 없어요.", "Couldn't save the draft. The issue being edited could not be found."),
    });
  };

  const handleSaveDraft = () => {
    if (saveDraft()) {
      setNotice({ kind: "success", text: t("임시 저장했어요.", "Draft saved.") });
    } else {
      draftFailureNotice();
    }
  };

  const handleSend = async () => {
    const issueId = saveDraft();
    if (!issueId) {
      draftFailureNotice();
      return;
    }
    setSending(true);
    try {
      const result = await sendIssue(issueId);
      if (result.sent) {
        setNotice({
          kind: "success",
          text: t(
            `발송을 기록했어요. 수신 ${result.record?.recipientCount ?? 0}명 · 실제 이메일은 메일 서비스 연결 후 발송됩니다.`,
            `Send recorded for ${result.record?.recipientCount ?? 0} recipients. Actual email goes out once a mail service is connected.`,
          ),
        });
      } else if (result.reason) {
        setNotice({ kind: "error", text: failureCopy(result.reason) });
      }
    } catch {
      // 어댑터가 결과 반환이 아니라 예외로 실패하는 경우(연결 오류 등)에도
      // 무반응으로 끝나지 않게 오류 공지를 남긴다.
      setNotice({
        kind: "error",
        text: t(
          "발송 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.",
          "Something went wrong while sending. Please try again in a moment.",
        ),
      });
    } finally {
      setSending(false);
    }
  };

  const handleDelete = () => {
    if (!editingId) return;
    if (deleteIssue(editingId)) {
      startNew();
    } else {
      setNotice({
        kind: "error",
        text: t("삭제하지 못했어요. 이미 삭제됐거나 초안이 아니에요.", "Couldn't delete it. It may already be deleted or no longer a draft."),
      });
    }
  };

  if (!hydrated) {
    return (
      <Container size="wide" className="py-10">
        <p role="status" className="text-sm text-fg-2">
          {t("저장된 뉴스레터를 불러오는 중이에요…", "Loading your saved newsletters…")}
        </p>
      </Container>
    );
  }

  return (
    <Container size="wide" className="py-10">
      <header className="mb-8">
        <p className="eyebrow flex items-center gap-1.5 text-accent">
          <PenLine size={13} /> {t("뉴스레터", "NEWSLETTER")}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          {t("뉴스레터 보내기", "Send a newsletter")}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-2">
          {t(
            "새 화가 나오면 구독자에게 이메일 한 통으로 소식을 전하세요. 발송은 주 1회 묶음을 기본으로 안내합니다.",
            "Tell your subscribers about a new episode with one email. Subscribers are guided to a weekly digest by default.",
          )}
        </p>
      </header>

      {!actorId ? (
        <section className="rounded-2xl border border-line bg-panel/50 p-6">
          <h2 className="text-base font-semibold text-fg">
            {t("로그인하면 뉴스레터를 보낼 수 있어요", "Sign in to send newsletters")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-2">
            {t(
              "뉴스레터 작성과 발송 기록은 내 계정에 묶여 있어요.",
              "Newsletter drafts and send history are tied to your account.",
            )}
          </p>
          <button
            type="button"
            onClick={() => requestAuthModalOpen({ reason: "protected-action", mode: "login" })}
            className="mt-4 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            {t("로그인하기", "Sign in")}
          </button>
        </section>
      ) : (
        <div className="flex flex-col gap-8">
          <section className="rounded-2xl border border-line bg-panel/50 p-6">
            <h2 className="text-base font-semibold text-fg">{t("작가 이름", "Author name")}</h2>
            <p className="mt-1 text-sm text-fg-2">
              {t(
                "독자가 구독한 작가 이름과 같아야 구독자 수와 발송 대상이 연결됩니다.",
                "Use the same name readers subscribed to, so subscriber counts and recipients line up.",
              )}
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="flex min-w-56 flex-1 flex-col gap-1.5 text-sm text-fg-2">
                {t("필명", "Pen name")}
                <input
                  value={penNameInput}
                  onChange={(event) => setPenNameInput(event.target.value)}
                  placeholder={t("예: 김밤하늘", "e.g. Your pen name")}
                  className="rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-fg"
                />
              </label>
              <button
                type="button"
                onClick={() => setPenName(penNameInput)}
                className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:border-line-strong"
              >
                {t("저장", "Save")}
              </button>
            </div>
            {penName && (
              <p className="mt-4 flex items-center gap-2 text-sm text-fg-2">
                <Users size={15} className="text-accent" />
                {t(
                  `현재 구독자 ${formatCount(subscriberCount)}명`,
                  `${formatCount(subscriberCount)} subscribers`,
                )}
                <span className="text-xs text-fg-3">
                  {t(
                    "(데모 기준 + 이 브라우저 구독 합산, 서버 집계 연결 전 로컬 기준)",
                    "(demo baseline plus this browser's subscriptions, local until server counts are connected)",
                  )}
                </span>
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-panel/50 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-fg">
                {editingSent
                  ? t("발송 완료된 뉴스레터", "Sent newsletter")
                  : t("새 뉴스레터 작성", "Write a newsletter")}
              </h2>
              <button
                type="button"
                onClick={startNew}
                className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
              >
                <Plus size={14} /> {t("새 글", "New")}
              </button>
            </div>

            {!penName && (
              <p className="mt-3 text-sm text-accent">
                {t("먼저 작가 이름을 저장해 주세요.", "Save your author name first.")}
              </p>
            )}
            {editingSent && (
              <p className="mt-3 text-sm text-fg-2">
                {t(
                  "발송이 끝난 글은 수정할 수 없어요. 내용은 아래 미리보기에서 확인할 수 있습니다.",
                  "Sent newsletters can't be edited. You can review the content in the preview below.",
                )}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm text-fg-2">
                {t("제목", "Subject")}
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={editorLocked}
                  placeholder={t("예: 「하늘 고래」 24화 소식", "e.g. New episode news")}
                  className="rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-fg disabled:opacity-60"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-fg-2">
                {t("본문", "Body")}
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  disabled={editorLocked}
                  rows={10}
                  placeholder={t(
                    "구독자에게 전할 소식을 적어 주세요. 빈 줄로 단락을 나눌 수 있어요.",
                    "Write the news for your subscribers. Separate paragraphs with a blank line.",
                  )}
                  className="rounded-xl border border-line bg-card px-3 py-2.5 text-sm leading-relaxed text-fg disabled:opacity-60"
                />
              </label>
            </div>

            {notice && (
              <p
                role={notice.kind === "error" ? "alert" : "status"}
                className={`mt-4 text-sm ${notice.kind === "error" ? "text-red-500" : "text-accent"}`}
              >
                {notice.text}
              </p>
            )}

            {!editingSent && (
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={!penName}
                  className="flex items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:border-line-strong disabled:opacity-50"
                >
                  <Save size={15} /> {t("임시 저장", "Save draft")}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
                  >
                    <Trash2 size={15} /> {t("초안 삭제", "Delete draft")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!penName || sending}
                  className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Send size={15} />
                  {sending ? t("보내는 중…", "Sending…") : t("발송하기", "Send")}
                </button>
                <span className="text-xs text-fg-3">
                  {t(
                    "지금은 로컬 기록 전용이에요. 실제 이메일은 메일 서비스 연결 후 발송됩니다.",
                    "Local record only for now. Actual email goes out once a mail service is connected.",
                  )}
                </span>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-panel/50 p-6">
            <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
              <Eye size={16} className="text-accent" /> {t("메일 미리보기", "Email preview")}
            </h2>
            <div className="mt-4 rounded-xl border border-line bg-card p-5">
              <p className="text-xs text-fg-3">
                {t("보낸 사람", "From")}: {preview.fromName || t("(작가 이름)", "(author name)")}
              </p>
              <p className="mt-1 text-lg font-bold text-fg">
                {preview.subject || t("(제목 없음)", "(no subject)")}
              </p>
              <div className="mt-4 flex flex-col gap-3">
                {preview.paragraphs.length === 0 ? (
                  <p className="text-sm text-fg-3">{t("본문이 여기에 표시됩니다.", "The body appears here.")}</p>
                ) : (
                  preview.paragraphs.map((paragraph, index) => (
                    <p key={index} className="whitespace-pre-line text-sm leading-relaxed text-fg-2">
                      {paragraph}
                    </p>
                  ))
                )}
              </div>
              <hr className="my-5 border-line" />
              <p className="text-xs leading-relaxed text-fg-3">
                {t(
                  `이 메일은 ${preview.fromName || "작가"} 뉴스레터를 구독해서 받았어요. 더 이상 받고 싶지 않으면 구독 해지(${preview.unsubscribePath})에서 끌 수 있습니다.`,
                  `You received this because you subscribed to this author's newsletter. You can unsubscribe anytime at ${preview.unsubscribePath}.`,
                )}
              </p>
            </div>
          </section>

          {penName && (
            <section className="rounded-2xl border border-line bg-panel/50 p-6">
              <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
                <History size={16} className="text-accent" /> {t("내 글과 발송 이력", "My newsletters and send history")}
              </h2>
              {myIssues.length === 0 ? (
                <p className="mt-3 text-sm text-fg-3">
                  {t("아직 쓴 뉴스레터가 없어요.", "You haven't written a newsletter yet.")}
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-2">
                  {myIssues.map((issue) => (
                    <li key={issue.id}>
                      <button
                        type="button"
                        onClick={() => loadIssue(issue)}
                        className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-line-strong"
                      >
                        <span className="text-sm font-medium text-fg">
                          {issue.title.trim() || t("(제목 없음)", "(no subject)")}
                        </span>
                        <span className="text-xs text-fg-3">
                          {issue.status === "sent"
                            ? t(
                                `발송 완료 · ${issue.sentAt ? new Date(issue.sentAt).toLocaleString() : ""}`,
                                `Sent · ${issue.sentAt ? new Date(issue.sentAt).toLocaleString() : ""}`,
                              )
                            : t(
                                `임시 저장 · ${new Date(issue.updatedAt).toLocaleString()}`,
                                `Draft · ${new Date(issue.updatedAt).toLocaleString()}`,
                              )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {myHistory.length > 0 && (
                <ul className="mt-4 flex flex-col gap-1.5 border-t border-line pt-4">
                  {myHistory.map((record) => (
                    <li key={record.id} className="text-xs text-fg-3">
                      {t(
                        `${new Date(record.sentAt).toLocaleString()} · 「${record.issueTitle}」 수신 ${record.recipientCount}명 · ${record.adapterId === "local-log" ? "로컬 기록 전용" : record.adapterId}`,
                        `${new Date(record.sentAt).toLocaleString()} · “${record.issueTitle}” to ${record.recipientCount} recipients · ${record.adapterId === "local-log" ? "local record only" : record.adapterId}`,
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </Container>
  );
}
