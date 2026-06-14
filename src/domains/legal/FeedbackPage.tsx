import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Clock, MessageSquare, MessagesSquare, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { FeedbackCategory, FeedbackPost, FeedbackReply, FeedbackStatus } from "@/lib/types";

import { InquiryForm } from "@/components/inquiry-form";
import { Container } from "@/components/section";
import { Button } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-utils";
import { useApp, useHydrated } from "@/lib/store";
import { cn } from "@/lib/utils";


const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  question: "질문",
  idea: "의견·제안",
  bug: "버그신고",
};
const CATEGORY_TONE: Record<FeedbackCategory, string> = {
  question: "border-accent/50 bg-accent-soft/60 text-accent",
  idea: "border-good/40 bg-good/10 text-good",
  bug: "border-bad/40 bg-bad/10 text-bad",
};
const STATUS_LABEL: Record<FeedbackStatus, string> = { open: "답변대기", answered: "답변완료" };

const composeSchema = z.object({
  category: z.enum(["question", "idea", "bug"]),
  title: z.string().trim().min(2, "제목은 2자 이상 입력해 주세요.").max(100),
  text: z.string().trim().min(5, "내용은 5자 이상 입력해 주세요.").max(2000),
});
type ComposeValues = z.infer<typeof composeSchema>;

function authHeaders(token: string | null): Record<string, string> {
  return token ? { "Content-Type": "application/json", "x-user-id": token } : { "Content-Type": "application/json" };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export function FeedbackPage() {
  const userId = useApp((s) => s.userId);
  const sessionToken = useApp((s) => s.sessionToken);
  const hydrated = useHydrated();
  const [category, setCategory] = useState<FeedbackCategory | "all">("all");
  const [status, setStatus] = useState<FeedbackStatus | "all">("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [posts, setPosts] = useState<FeedbackPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [composeTags, setComposeTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const addTag = () => {
    const t = tagDraft.trim().replace(/^#/, "").slice(0, 20);
    if (t && !composeTags.includes(t) && composeTags.length < 5) setComposeTags((p) => [...p, t]);
    setTagDraft("");
  };

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ComposeValues>({
    resolver: zodResolver(composeSchema),
    defaultValues: { category: "question", title: "", text: "" },
  });

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (category !== "all") params.set("category", category);
    if (status !== "all") params.set("status", status);
    if (tagFilter) params.set("tag", tagFilter);
    fetch(`/api/feedback/posts?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load_failed"))))
      .then((data: { items: FeedbackPost[] }) => {
        if (alive) setPosts(data.items ?? []);
      })
      .catch(() => alive && setError("게시판을 불러오지 못했어요."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      controller.abort();
    };
  }, [category, status, tagFilter, refreshTick]);

  const onSubmit = handleSubmit(async (values) => {
    if (!userId) return;
    const res = await fetch("/api/feedback/posts", {
      method: "POST",
      headers: authHeaders(sessionToken),
      body: JSON.stringify({ ...values, tags: composeTags }),
    });
    if (res.ok) {
      reset({ category: values.category, title: "", text: "" });
      setComposeTags([]);
      setRefreshTick((t) => t + 1);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? "글을 등록하지 못했어요.");
    }
  });

  return (
    <Container size="default" className="py-10">
      <header className="mb-6">
        <p className="eyebrow flex items-center gap-1.5 text-accent">
          <MessagesSquare size={14} /> Q&amp;A · FEEDBACK
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">의견 게시판</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-2">
          서비스 이용 중 궁금한 점(Q&amp;A), 기능 제안, 버그를 남겨주세요. 운영자가 확인하고 답변하면 <b className="text-good">답변완료</b>로 표시됩니다.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* 목록 */}
        <div className="order-2 lg:order-1">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Tabs
              value={category}
              onChange={(v) => setCategory(v as FeedbackCategory | "all")}
              options={[["all", "전체"], ["question", "질문"], ["idea", "의견·제안"], ["bug", "버그신고"]]}
            />
            <span className="h-4 w-px bg-line" />
            <Tabs
              value={status}
              onChange={(v) => setStatus(v as FeedbackStatus | "all")}
              options={[["all", "전체"], ["open", "답변대기"], ["answered", "답변완료"]]}
            />
            <button type="button" onClick={() => setRefreshTick((t) => t + 1)} className="ml-auto inline-flex items-center gap-1 text-xs text-fg-3 hover:text-fg">
              <RefreshCw size={13} className={cn(loading && "animate-spin")} /> 갱신
            </button>
          </div>

          {tagFilter && (
            <div className="mb-3 flex items-center gap-2 text-xs text-fg-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/50 bg-accent-soft/50 px-2.5 py-0.5 text-accent">
                #{tagFilter}
              </span>
              <button type="button" onClick={() => setTagFilter(null)} className="text-fg-3 hover:text-fg">
                태그 필터 해제 ✕
              </button>
            </div>
          )}

          {error && <p className="mb-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{error}</p>}

          {loading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton h-20 rounded-xl" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-card/40 p-10 text-center text-sm text-fg-3">
              아직 등록된 글이 없어요. 첫 글을 남겨보세요.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  expanded={expandedId === post.id}
                  onToggle={() => setExpandedId((id) => (id === post.id ? null : post.id))}
                  userId={userId}
                  onTagClick={(t) => setTagFilter(t)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* 작성 폼 */}
        <aside className="order-1 lg:order-2">
          <div className="sticky top-20 rounded-2xl border border-line bg-panel/40 p-4">
            <h2 className="mb-3 text-sm font-semibold">새 글 작성</h2>
            {!hydrated ? (
              <div className="skeleton h-40 rounded-lg" />
            ) : userId ? (
              <form onSubmit={onSubmit} className="space-y-3">
                <div>
                  <label htmlFor="feedback-category" className="mb-1 block text-xs text-fg-3">분류</label>
                  <select id="feedback-category" {...register("category")} className="w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg outline-none focus:border-accent/50">
                    <option value="question">질문 (Q&amp;A)</option>
                    <option value="idea">의견·제안</option>
                    <option value="bug">버그신고</option>
                  </select>
                </div>
                <div>
                  <input {...register("title")} placeholder="제목" maxLength={100} className="w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg outline-none focus:border-accent/50" />
                  {errors.title && <p className="mt-1 text-[0.7rem] text-bad">{errors.title.message}</p>}
                </div>
                <div>
                  <textarea {...register("text")} rows={5} maxLength={2000} placeholder="내용을 자세히 적어주세요." className="w-full resize-none rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-fg outline-none focus:border-accent/50" />
                  {errors.text && <p className="mt-1 text-[0.7rem] text-bad">{errors.text.message}</p>}
                </div>
                <div>
                  <label htmlFor="feedback-tags" className="mb-1 block text-xs text-fg-3">태그 (선택, 최대 5개)</label>
                  {composeTags.length > 0 && (
                    <div className="mb-1.5 flex flex-wrap gap-1">
                      {composeTags.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setComposeTags((p) => p.filter((x) => x !== t))}
                          className="inline-flex items-center gap-0.5 rounded-full border border-accent/50 bg-accent-soft/50 px-2 py-0.5 text-[0.68rem] text-accent"
                        >
                          #{t} ✕
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    id="feedback-tags"
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    onBlur={addTag}
                    placeholder="예: UI, 모바일 (Enter/쉼표로 추가)"
                    maxLength={20}
                    disabled={composeTags.length >= 5}
                    className="w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-fg outline-none focus:border-accent/50 disabled:opacity-50"
                  />
                </div>
                <Button type="submit" disabled={isSubmitting} className="w-full justify-center gap-1.5">
                  <MessageSquare size={14} /> 등록
                </Button>
              </form>
            ) : (
              <p className="rounded-lg border border-line bg-card/60 px-3 py-6 text-center text-xs text-fg-3">
                로그인하면 글을 쓸 수 있어요. <br /> 읽기는 누구나 가능합니다.
              </p>
            )}

            {/* 게시판에 올리기 어려운 내용(계정·권리·제휴)은 비공개 문의로 — /contact와 같은 접수함을 쓴다. */}
            <details className="mt-4 rounded-xl border border-line bg-card/50 open:bg-card/70">
              <summary className="cursor-pointer rounded-xl px-3 py-2.5 text-xs font-semibold text-fg-2 transition-colors hover:text-fg">
                운영팀에 비공개 문의
              </summary>
              <div className="border-t border-line px-3 pb-3 pt-3">
                <p className="mb-3 text-[0.7rem] leading-relaxed text-fg-3">
                  공개 게시판 대신 운영팀에게만 전달돼요. 로그인 없이 보낼 수 있습니다.
                </p>
                <InquiryForm defaultCategory="contact" />
              </div>
            </details>
          </div>
        </aside>
      </div>
    </Container>
  );
}

function Tabs({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="inline-flex flex-wrap gap-1">
      {options.map(([val, label]) => (
        <button
          key={val}
          type="button"
          onClick={() => onChange(val)}
          aria-pressed={value === val}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            value === val ? "border-accent/55 bg-accent-soft text-accent" : "border-line bg-card text-fg-3 hover:text-fg"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function PostCard({ post, expanded, onToggle, userId, onTagClick }: { post: FeedbackPost; expanded: boolean; onToggle: () => void; userId: string | null; onTagClick: (tag: string) => void }) {
  return (
    <li className="rounded-xl border border-line bg-card/60 p-3.5">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full border px-2 py-0.5 text-[0.66rem] font-medium", CATEGORY_TONE[post.category])}>
            {CATEGORY_LABEL[post.category]}
          </span>
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.66rem] font-medium",
            post.status === "answered" ? "bg-good/15 text-good" : "bg-warn/15 text-warn"
          )}>
            {post.status === "answered" ? <CheckCircle2 size={11} /> : <Clock size={11} />}
            {STATUS_LABEL[post.status]}
          </span>
          <span className="ml-auto text-[0.68rem] text-fg-3">{timeAgo(post.createdAt)}</span>
        </div>
        <h3 className="mt-2 text-sm font-semibold text-fg">{post.title}</h3>
        <p className={cn("mt-1 whitespace-pre-wrap text-xs leading-relaxed text-fg-2", !expanded && "line-clamp-2")}>{post.text}</p>
        <div className="mt-2 flex items-center gap-2 text-[0.68rem] text-fg-3">
          <span>{post.author.name}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1"><MessageSquare size={11} /> {post.replyCount}</span>
        </div>
      </button>
      {post.tags?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {post.tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTagClick(t)}
              className="rounded-full border border-line bg-raised/40 px-2 py-0.5 text-[0.66rem] text-fg-3 transition-colors hover:border-accent/50 hover:text-accent"
            >
              #{t}
            </button>
          ))}
        </div>
      )}
      {expanded && <PostThread postId={post.id} userId={userId} />}
    </li>
  );
}

function PostThread({ postId, userId }: { postId: string; userId: string | null }) {
  const sessionToken = useApp((s) => s.sessionToken);
  const [replies, setReplies] = useState<FeedbackReply[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch(`/api/feedback/posts/${postId}/replies`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: FeedbackReply[]) => alive && setReplies(Array.isArray(data) ? data : []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [postId, tick]);

  const send = async () => {
    if (!userId || !text.trim()) return;
    setSending(true);
    const res = await fetch(`/api/feedback/posts/${postId}/replies`, {
      method: "POST",
      headers: authHeaders(sessionToken),
      body: JSON.stringify({ text }),
    });
    setSending(false);
    if (res.ok) {
      setText("");
      setTick((t) => t + 1);
    }
  };

  return (
    <div className="mt-3 border-t border-line pt-3">
      {replies.length === 0 ? (
        <p className="text-[0.7rem] text-fg-3">아직 답변이 없어요.</p>
      ) : (
        <ul className="space-y-2">
          {replies.map((r) => (
            <ReplyNode key={r.id} reply={r} depth={0} />
          ))}
        </ul>
      )}
      {userId ? (
        <div className="mt-3 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="답변 남기기"
            maxLength={1500}
            className="flex-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-fg outline-none focus:border-accent/50"
          />
          <button type="button" onClick={send} disabled={sending || !text.trim()} className={buttonClass({ size: "sm", variant: "solid" })}>
            등록
          </button>
        </div>
      ) : (
        <p className="mt-3 text-[0.68rem] text-fg-3">로그인하면 답변을 남길 수 있어요.</p>
      )}
    </div>
  );
}

function ReplyNode({ reply, depth }: { reply: FeedbackReply; depth: number }) {
  return (
    <li style={{ marginLeft: depth * 14 }}>
      <div className={cn("rounded-lg border px-2.5 py-1.5", reply.isOfficial ? "border-accent/40 bg-accent-soft/30" : "border-line bg-panel/40")}>
        <div className="flex items-center gap-1.5 text-[0.66rem] text-fg-3">
          <span className="font-medium text-fg-2">{reply.author.name}</span>
          {reply.isOfficial && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-accent/15 px-1.5 text-accent">
              <ShieldCheck size={10} /> 운영자
            </span>
          )}
          <span className="ml-auto">{timeAgo(reply.createdAt)}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-fg">{reply.text}</p>
      </div>
      {reply.children?.length ? (
        <ul className="mt-2 space-y-2">
          {reply.children.map((c) => (
            <ReplyNode key={c.id} reply={c} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
