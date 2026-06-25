// 커뮤니티 / 리뷰 게시판 — 토스 미니앱.
//
// 웹 도메인(src/domains/community/*) + aidigestdesk apps/toss CommunityPage 의 검증된 구조를
// 그대로 복제하되, 모든 로직은 @toonspectrum/core 한 곳에서만 산다(중복 0). 이 파일은 렌더 + 입력만.
//
//   브랜치 A — 리뷰 피드: GET /api/reviews (공개·CORS OK·no-store). 웹 ReviewsPage 미러.
//   브랜치 B — 데모 커뮤니티: 채팅·게시판·카페 (createCommunityStore, '이 기기에만 저장').
//
// 쓰기형 server-backed 커뮤니티(POST /community/posts·/reviews/:id/replies)는 enforceUserOrError
// (x-user-id) → 토스 로그인(mTLS) 미가동 + CORS가 GET만 허용이라 defer-blocked. 따라서 리뷰는
// 읽기 전용으로 노출하고, 쓰기 상호작용은 aidigestdesk식 로컬 데모 엔진으로 제공한다.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { navigate } from '../router';
import { theme, pageShell } from '../theme';
import { Top } from '../tds-shim';
import { Cover } from '../ui';
import { BannerAd } from '../components/BannerAd';
import { coverUrl } from '../lib/api';
import { shareMessage } from '../lib/toss';
import {
  community,
  fetchReviews,
  formatRelativeTime,
  BOARD_CATEGORIES,
  REVIEW_SORTS,
  type BoardPost,
  type Cafe,
  type Channel,
  type CommunityState,
  type Post,
  type ReviewSort,
  type ReviewsResponse,
} from '../lib/community';

/* ── 공유 스타일 ───────────────────────────────────────────────────────── */

const card: React.CSSProperties = {
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 14,
  padding: 14,
};
const fieldStyle: React.CSSProperties = {
  width: '100%',
  background: theme.surfaceAlt,
  border: `1px solid ${theme.border}`,
  borderRadius: 12,
  color: theme.text,
  fontSize: 15,
  fontFamily: 'inherit',
  outline: 'none',
};
const primaryBtn = (enabled: boolean): React.CSSProperties => ({
  height: 44,
  padding: '0 16px',
  borderRadius: 12,
  border: 'none',
  cursor: enabled ? 'pointer' : 'not-allowed',
  background: enabled ? theme.accent : theme.surfaceAlt,
  color: enabled ? theme.accentInk : theme.textMuted,
  fontSize: 14.5,
  fontWeight: 700,
  flexShrink: 0,
});
const linkBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: theme.textMuted,
  fontSize: 12.5,
  fontWeight: 700,
  cursor: 'pointer',
  padding: 0,
};
const ghostBtn: React.CSSProperties = {
  height: 36,
  padding: '0 14px',
  borderRadius: 12,
  background: 'transparent',
  border: `1px solid ${theme.border}`,
  color: theme.textMuted,
  fontSize: 13.5,
  fontWeight: 700,
  cursor: 'pointer',
  flexShrink: 0,
};

/* ── 공통: 칩 행 / 모드·스코프 세그먼트 ──────────────────────────────────── */

function Pill({ active, onClick, children, ariaLabel }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className="pressable"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      style={{
        flexShrink: 0,
        height: 32,
        padding: '0 12px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        border: active ? 'none' : `1px solid ${theme.border}`,
        background: active ? theme.accent : 'transparent',
        color: active ? theme.accentInk : theme.textMuted,
      }}
    >
      {children}
    </button>
  );
}

function useCommunity(): CommunityState {
  return useSyncExternalStore(community.subscribe, community.getSnapshot, community.getSnapshot);
}

/* ═══════════════════════════════════════════════════════════════════════
   브랜치 A — 리뷰 피드 (GET /api/reviews, 읽기 전용)
   ═══════════════════════════════════════════════════════════════════════ */

function Stars({ value }: { value: number }) {
  // 0.5 단위 별점(0~5)을 ★/½/☆ 로 표기. 텍스트 폴백이라 폰트 의존 없음.
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span aria-label={`별점 ${value.toFixed(1)}점`} style={{ color: theme.accent, fontSize: 13, letterSpacing: 1 }}>
      {'★'.repeat(full)}
      {half ? '⯨' : ''}
      <span style={{ color: theme.border }}>{'☆'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)))}</span>
    </span>
  );
}

function ReviewCard({ review }: { review: ReviewsResponse['feed'][number] }) {
  const t = review.title;
  const [revealed, setRevealed] = useState(false);
  const hidden = review.spoiler && !revealed;

  return (
    <article style={card}>
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          type="button"
          className="pressable"
          onClick={() => navigate(`/title/${encodeURIComponent(t.slug || t.id)}`)}
          aria-label={`${t.title} 상세`}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
        >
          <Cover gradient={t.cover} src={coverUrl(t)} alt="" height={64} radius={10} />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t.title}
          </div>
          <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t.genres.slice(0, 2).join(' · ')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <Stars value={review.rating} />
            <span style={{ fontSize: 12, color: theme.textMuted }}>· {review.author}</span>
          </div>
        </div>
      </div>

      {hidden ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          style={{ ...ghostBtn, height: 'auto', padding: '10px 12px', width: '100%', marginTop: 10, lineHeight: 1.5, textAlign: 'left' }}
        >
          ⚠️ 스포일러가 포함된 리뷰예요. 눌러서 보기
        </button>
      ) : (
        <p style={{ fontSize: 13.5, color: theme.text, marginTop: 10, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
          {review.text}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        {review.tags.slice(0, 3).map((tag) => (
          <span key={tag} style={{ fontSize: 11, color: theme.textMuted, background: theme.surfaceAlt, borderRadius: 6, padding: '2px 7px' }}>
            #{tag}
          </span>
        ))}
        <span style={{ fontSize: 11.5, color: theme.textMuted, marginLeft: 'auto' }}>
          ♥ {review.likes.toLocaleString('ko-KR')} · {formatRelativeTime(review.createdAt)}
        </span>
      </div>
    </article>
  );
}

function ReviewsFeed() {
  const [sort, setSort] = useState<ReviewSort>('recent');
  const [hideSpoiler, setHideSpoiler] = useState(false);
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchReviews({ sort, spoiler: hideSpoiler ? 'hide' : undefined, signal: ctrl.signal })
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : '리뷰를 불러오지 못했어요.');
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [sort, hideSpoiler, reloadKey]);

  const feed = data?.feed ?? [];
  const stats = data?.stats;
  const topReviewed = data?.topReviewed ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 통계 요약 */}
      {stats && (
        <div style={{ display: 'flex', gap: 8, padding: '12px 0', borderTop: `1px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}` }}>
          {[
            { label: '총 리뷰', value: stats.total.toLocaleString('ko-KR') },
            { label: '평균 별점', value: stats.avg.toFixed(2) },
            { label: '스포일러', value: `${stats.spoilerPct}%` },
            { label: '리뷰된 작품', value: stats.distinctTitles.toLocaleString('ko-KR') },
          ].map((s) => (
            <div key={s.label} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: theme.text }}>{s.value}</div>
              <div style={{ fontSize: 10.5, color: theme.textMuted, marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 정렬 + 스포일러 토글 */}
      <div className="chips" style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
        {REVIEW_SORTS.map((s) => (
          <Pill key={s.id} active={sort === s.id} onClick={() => setSort(s.id)}>
            {s.label}
          </Pill>
        ))}
        <Pill active={hideSpoiler} onClick={() => setHideSpoiler((v) => !v)} ariaLabel="스포일러 숨기기 토글">
          {hideSpoiler ? '🙈 스포 숨김' : '👁 스포 표시'}
        </Pill>
      </div>

      {/* 본문: 로딩 / 에러 / 빈 / 피드 */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-busy="true" aria-label="리뷰 불러오는 중">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ ...card, height: 116, opacity: 0.5 }} aria-hidden />
          ))}
        </div>
      ) : error ? (
        <div style={{ ...card, textAlign: 'center', padding: '28px 16px' }} role="alert">
          <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
          <p style={{ fontSize: 14, color: theme.text, lineHeight: 1.6 }}>리뷰를 불러오지 못했어요.</p>
          <p style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>네트워크 상태를 확인하고 다시 시도해 주세요.</p>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} style={{ ...primaryBtn(true), height: 40, marginTop: 14 }}>
            다시 시도
          </button>
        </div>
      ) : feed.length === 0 ? (
        <p style={{ textAlign: 'center', color: theme.textMuted, padding: '32px 0', fontSize: 14 }}>
          아직 등록된 리뷰가 없어요.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: theme.textMuted }}>{feed.length.toLocaleString('ko-KR')}개의 리뷰</span>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} style={linkBtn}>↻ 갱신</button>
          </div>

          {/* 가장 많이 리뷰된 작품(웹 사이드바 미러) */}
          {topReviewed.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: theme.accent, letterSpacing: 0.5 }}>MOST REVIEWED</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: theme.text, marginTop: 2 }}>가장 많이 리뷰된 작품</div>
              <ol style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {topReviewed.map((item, i) => (
                  <li key={item.title.id}>
                    <button
                      type="button"
                      className="pressable"
                      onClick={() => navigate(`/title/${encodeURIComponent(item.title.slug || item.title.id)}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', textAlign: 'left' }}
                    >
                      <span style={{ width: 18, textAlign: 'center', color: theme.textMuted, fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ flexShrink: 0 }}>
                        <Cover gradient={item.title.cover} src={coverUrl(item.title)} alt="" height={36} radius={8} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: theme.text }}>
                        {item.title.title}
                      </span>
                      <span style={{ fontSize: 12, color: theme.textMuted, flexShrink: 0 }}>{item.count}개</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {feed.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </div>
        </>
      )}

      <p style={{ fontSize: 11, lineHeight: 1.6, color: theme.textMuted }}>
        리뷰는 ToonSpectrum 서비스의 공개 리뷰를 읽기 전용으로 보여줘요(작성/답글은 토스 앱에서 준비 중).
        표지·작품 정보는 각 플랫폼 공개 메타 기준이며 일부 수치는 추정(≈)일 수 있어요.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   브랜치 B — 데모 커뮤니티 (채팅 · 게시판 · 카페, 이 기기에만 저장)
   ═══════════════════════════════════════════════════════════════════════ */

/* ── 댓글 ──────────────────────────────────────────────────────────────── */
function Comments({ postId, nickname }: { postId: string; nickname: string }) {
  const state = useCommunity();
  const comments = community.selectComments(state, postId);
  const [body, setBody] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
      {comments.length === 0 ? (
        <p style={{ fontSize: 12.5, color: theme.textMuted }}>첫 댓글을 남겨보세요.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {comments.map((c) => {
            const mine = community.isOwner(c.authorId);
            const editing = editId === c.id;
            return (
              <li key={c.id} style={{ background: theme.surfaceAlt, borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 11.5, color: theme.textMuted }}>
                    <b style={{ color: theme.text }}>{c.author}</b> · {formatRelativeTime(c.createdAt)}
                    {c.editedAt ? ' · 수정됨' : ''}
                  </span>
                  {mine && !editing && (
                    <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button type="button" style={linkBtn} onClick={() => { setEditId(c.id); setEditBody(c.body); }}>수정</button>
                      <button type="button" style={{ ...linkBtn, color: theme.danger }} onClick={() => community.deleteComment(c.id)}>삭제</button>
                    </span>
                  )}
                </div>
                {editing ? (
                  <div style={{ marginTop: 6 }}>
                    <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={2}
                      aria-label="댓글 수정" style={{ ...fieldStyle, padding: 8, resize: 'vertical', lineHeight: 1.5 }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <button type="button" disabled={!editBody.trim()} style={{ ...primaryBtn(!!editBody.trim()), height: 36 }}
                        onClick={() => { if (editBody.trim()) { community.editComment(c.id, editBody.trim()); setEditId(null); } }}>저장</button>
                      <button type="button" style={ghostBtn} onClick={() => setEditId(null)}>취소</button>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: 13.5, color: theme.text, marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.body}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <form style={{ display: 'flex', gap: 8, marginTop: 10 }}
        onSubmit={(e) => { e.preventDefault(); if (body.trim()) { community.addComment({ postId, author: nickname, body: body.trim() }); setBody(''); } }}>
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="댓글 달기…" aria-label="댓글 입력"
          style={{ ...fieldStyle, flex: 1, height: 40, paddingLeft: 12 }} />
        <button type="submit" disabled={!body.trim()} style={{ ...primaryBtn(!!body.trim()), height: 40 }}>등록</button>
      </form>
    </div>
  );
}

/* ── 게시판 글 행 ──────────────────────────────────────────────────────── */
function BoardRow({ post, nickname }: { post: BoardPost; nickname: string }) {
  const state = useCommunity();
  const count = community.selectCommentCount(state, post.id);
  const mine = community.isOwner(post.authorId);
  const showCat = !post.category.startsWith('cafe:');
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [open, setOpen] = useState(false);

  return (
    <li style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {showCat && (
              <span style={{ fontSize: 11, fontWeight: 700, color: theme.accent, background: theme.accentSoft, borderRadius: 6, padding: '2px 7px' }}>
                {post.category}
              </span>
            )}
            {!editing && <span style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>{post.title}</span>}
          </div>
          <p style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
            <b style={{ color: theme.text }}>{post.author}</b> · {formatRelativeTime(post.createdAt)}{post.editedAt ? ' · 수정됨' : ''}
          </p>
        </div>
        {mine && !editing && (
          <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button type="button" style={linkBtn} onClick={() => { setTitle(post.title); setBody(post.body); setEditing(true); }}>수정</button>
            <button type="button" style={{ ...linkBtn, color: theme.danger }} onClick={() => community.deleteBoardPost(post.id)}>삭제</button>
          </span>
        )}
      </div>
      {editing ? (
        <div style={{ marginTop: 8 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" aria-label="제목 수정"
            style={{ ...fieldStyle, height: 40, paddingLeft: 12, marginBottom: 8 }} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} aria-label="내용 수정"
            style={{ ...fieldStyle, padding: 10, resize: 'vertical', lineHeight: 1.5 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" disabled={!title.trim() || !body.trim()} style={{ ...primaryBtn(!!title.trim() && !!body.trim()), height: 38 }}
              onClick={() => { if (title.trim() && body.trim()) { community.editBoardPost(post.id, { title: title.trim(), body: body.trim() }); setEditing(false); } }}>저장</button>
            <button type="button" style={ghostBtn} onClick={() => setEditing(false)}>취소</button>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 13.5, color: theme.textMuted, marginTop: 8, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{post.body}</p>
      )}
      {!editing && (
        <button type="button" style={{ ...linkBtn, marginTop: 8 }} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          💬 댓글 {count}{open ? ' 접기' : ''}
        </button>
      )}
      {open && !editing && <Comments postId={post.id} nickname={nickname} />}
    </li>
  );
}

/* ── 채팅 메시지 행 ────────────────────────────────────────────────────── */
function MessageRow({ post }: { post: Post }) {
  const mine = community.isOwner(post.authorId);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(post.body);
  return (
    <li style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12.5, color: theme.textMuted }}>
          <b style={{ color: theme.text }}>{post.author}</b> · {formatRelativeTime(post.createdAt)}{post.editedAt ? ' · 수정됨' : ''}
        </span>
        {mine && !editing && (
          <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button type="button" style={linkBtn} onClick={() => { setBody(post.body); setEditing(true); }}>수정</button>
            <button type="button" style={{ ...linkBtn, color: theme.danger }} onClick={() => community.deletePost(post.id)}>삭제</button>
          </span>
        )}
      </div>
      {editing ? (
        <div style={{ marginTop: 6 }}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} aria-label="메시지 수정"
            style={{ ...fieldStyle, padding: 8, resize: 'vertical', lineHeight: 1.5 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button type="button" disabled={!body.trim()} style={{ ...primaryBtn(!!body.trim()), height: 36 }}
              onClick={() => { if (body.trim()) { community.editPost(post.id, body.trim()); setEditing(false); } }}>저장</button>
            <button type="button" style={ghostBtn} onClick={() => setEditing(false)}>취소</button>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 14, color: theme.text, marginTop: 6, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{post.body}</p>
      )}
    </li>
  );
}

/* ── 채팅 뷰 ───────────────────────────────────────────────────────────── */
function ChatView({ nickname }: { nickname: string }) {
  const channels = useMemo<Channel[]>(() => community.listChannels(), []);
  const [active, setActive] = useState(channels[0]?.id ?? '');
  const [draft, setDraft] = useState('');
  const state = useCommunity();
  const channel = channels.find((c) => c.id === active) ?? channels[0] ?? null;
  const posts = channel ? community.selectChannelPosts(state, channel.id) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="chips" style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
        {channels.map((c) => (
          <Pill key={c.id} active={c.id === channel?.id} onClick={() => setActive(c.id)}># {c.name}</Pill>
        ))}
      </div>
      {channel && <p style={{ fontSize: 12.5, color: theme.textMuted }}>{channel.topic}</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {posts.map((p) => <MessageRow key={p.id} post={p} />)}
        {posts.length === 0 && <p style={{ textAlign: 'center', color: theme.textMuted, padding: '24px 0' }}>첫 메시지를 남겨보세요.</p>}
      </ul>
      <form style={{ display: 'flex', gap: 8 }}
        onSubmit={(e) => { e.preventDefault(); if (channel && draft.trim()) { community.addPost({ channelId: channel.id, author: nickname, body: draft.trim() }); setDraft(''); } }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="메시지 입력" aria-label="메시지 입력"
          style={{ ...fieldStyle, flex: 1, height: 44, paddingLeft: 12 }} />
        <button type="submit" disabled={!draft.trim()} style={primaryBtn(!!draft.trim())}>전송</button>
      </form>
    </div>
  );
}

/* ── 게시판 뷰 ─────────────────────────────────────────────────────────── */
function BoardView({ nickname }: { nickname: string }) {
  const [cat, setCat] = useState('전체');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [writeCat, setWriteCat] = useState<string>(BOARD_CATEGORIES[0]);
  const state = useCommunity();
  const posts = community.selectBoardPosts(state, cat === '전체' ? undefined : cat);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="chips" style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
        {['전체', ...BOARD_CATEGORIES].map((c) => (
          <Pill key={c} active={cat === c} onClick={() => setCat(c)}>{c}</Pill>
        ))}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {posts.map((p) => <BoardRow key={p.id} post={p} nickname={nickname} />)}
        {posts.length === 0 && <p style={{ textAlign: 'center', color: theme.textMuted, padding: '24px 0' }}>아직 글이 없어요. 첫 글을 남겨보세요.</p>}
      </ul>
      <form style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}
        onSubmit={(e) => { e.preventDefault(); if (title.trim() && body.trim()) { community.addBoardPost({ category: writeCat, title: title.trim(), body: body.trim(), author: nickname }); setTitle(''); setBody(''); setCat('전체'); } }}>
        <div className="chips" style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          {BOARD_CATEGORIES.map((c) => (
            <Pill key={c} active={writeCat === c} onClick={() => setWriteCat(c)}>{c}</Pill>
          ))}
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" aria-label="제목"
          style={{ ...fieldStyle, height: 42, paddingLeft: 12 }} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="내용" aria-label="내용"
          style={{ ...fieldStyle, padding: 10, resize: 'vertical', lineHeight: 1.5 }} />
        <button type="submit" disabled={!title.trim() || !body.trim()} style={{ ...primaryBtn(!!title.trim() && !!body.trim()), alignSelf: 'flex-start' }}>글 작성</button>
      </form>
    </div>
  );
}

/* ── 카페 뷰 ───────────────────────────────────────────────────────────── */
function CafeCard({ cafe, nickname }: { cafe: Cafe; nickname: string }) {
  const cafeCat = `cafe:${cafe.id}`;
  const state = useCommunity();
  const joined = community.isCafeMember(cafe.id);
  const members = community.getCafeMemberCount(cafe.id);
  const posts = community.selectBoardPosts(state, cafeCat);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  return (
    <article style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>{cafe.emoji ?? '☕'} {cafe.name}</div>
          <p style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 3, lineHeight: 1.5 }}>{cafe.description}</p>
          <p style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 4 }}>멤버 {members.toLocaleString('ko-KR')}명 (추정)</p>
        </div>
        <button type="button" onClick={() => (joined ? community.leaveCafe(cafe.id) : community.joinCafe(cafe.id))}
          style={{ flexShrink: 0, height: 36, padding: '0 14px', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            background: joined ? 'transparent' : theme.accent, color: joined ? theme.textMuted : theme.accentInk,
            border: joined ? `1px solid ${theme.border}` : 'none' }}>
          {joined ? '탈퇴' : '가입'}
        </button>
      </div>
      {joined && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${theme.border}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {posts.map((p) => <BoardRow key={p.id} post={p} nickname={nickname} />)}
            {posts.length === 0 && <p style={{ fontSize: 12.5, color: theme.textMuted }}>이 카페의 첫 글을 남겨보세요.</p>}
          </ul>
          <form style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            onSubmit={(e) => { e.preventDefault(); if (title.trim() && body.trim()) { community.addBoardPost({ category: cafeCat, title: title.trim(), body: body.trim(), author: nickname }); setTitle(''); setBody(''); } }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" aria-label="카페 글 제목"
              style={{ ...fieldStyle, height: 40, paddingLeft: 12 }} />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="내용" aria-label="카페 글 내용"
              style={{ ...fieldStyle, padding: 10, resize: 'vertical', lineHeight: 1.5 }} />
            <button type="submit" disabled={!title.trim() || !body.trim()} style={{ ...primaryBtn(!!title.trim() && !!body.trim()), height: 38, alignSelf: 'flex-start' }}>글 작성</button>
          </form>
        </div>
      )}
    </article>
  );
}

function CafeView({ nickname }: { nickname: string }) {
  const cafes = useMemo<Cafe[]>(() => community.listCafes(), []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {cafes.map((c) => <CafeCard key={c.id} cafe={c} nickname={nickname} />)}
      {cafes.length === 0 && <p style={{ textAlign: 'center', color: theme.textMuted, padding: '24px 0' }}>표시할 카페가 없어요.</p>}
    </div>
  );
}

/* ── 데모 커뮤니티(채팅·게시판·카페) 셸 ───────────────────────────────────── */
type Scope = 'chat' | 'board' | 'cafe';
const SCOPES: { id: Scope; label: string }[] = [
  { id: 'chat', label: '채팅방' },
  { id: 'board', label: '게시판' },
  { id: 'cafe', label: '카페' },
];

function DemoCommunity() {
  const [scope, setScope] = useState<Scope>('chat');
  const [nickname, setNick] = useState(() => community.getNickname());
  const current = nickname.trim() || community.getNickname();

  async function shareCommunity() {
    await shareMessage('ToonSpectrum 웹툰 커뮤니티에서 같이 수다 떨어요! 채팅·리뷰·카페까지 한곳에서.');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            className="pressable"
            onClick={() => setScope(s.id)}
            aria-pressed={scope === s.id}
            style={{ flex: 1, height: 38, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
              border: scope === s.id ? 'none' : `1px solid ${theme.border}`,
              background: scope === s.id ? theme.accent : 'transparent',
              color: scope === s.id ? theme.accentInk : theme.textMuted }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="community-nick" style={{ fontSize: 12, color: theme.textMuted, display: 'block', marginBottom: 6 }}>닉네임</label>
        <input
          id="community-nick"
          value={nickname}
          onChange={(e) => { setNick(e.target.value); community.setNickname(e.target.value); }}
          placeholder={community.getNickname()}
          aria-label="닉네임"
          style={{ ...fieldStyle, height: 42, paddingLeft: 12 }}
        />
      </div>

      {scope === 'chat' ? <ChatView nickname={current} />
        : scope === 'board' ? <BoardView nickname={current} />
        : <CafeView nickname={current} />}

      <button type="button" onClick={shareCommunity} style={{ ...ghostBtn, height: 44, alignSelf: 'center' }}>
        🔗 커뮤니티 공유하기
      </button>

      <p style={{ fontSize: 11, lineHeight: 1.6, color: theme.textMuted }}>
        채팅·게시판·카페 글은 <b style={{ color: theme.text }}>이 기기에만 저장되는 데모</b>예요(서버 미연동).
        작성 내용은 다른 사용자에게 보이지 않아요. 멤버 수는 추정치예요.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   페이지 셸
   ═══════════════════════════════════════════════════════════════════════ */

type Mode = 'reviews' | 'community';
const MODES: { id: Mode; label: string }[] = [
  { id: 'reviews', label: '리뷰 피드' },
  { id: 'community', label: '커뮤니티' },
];

export function CommunityPage() {
  const [mode, setMode] = useState<Mode>('reviews');

  return (
    <div style={pageShell}>
      <Top
        title={<Top.TitleParagraph>💬 커뮤니티 / 리뷰</Top.TitleParagraph>}
        subtitleBottom={<Top.SubtitleParagraph>독자 리뷰와 웹툰 수다를 한곳에서</Top.SubtitleParagraph>}
      />

      {/* 모드 전환: 리뷰 피드(서버 읽기) · 커뮤니티(로컬 데모) */}
      <div role="tablist" aria-label="커뮤니티 모드" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {MODES.map((m) => {
          const on = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={on}
              className="pressable"
              onClick={() => setMode(m.id)}
              style={{ flex: 1, height: 40, borderRadius: 10, fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
                border: on ? 'none' : `1px solid ${theme.border}`,
                background: on ? theme.accent : 'transparent',
                color: on ? theme.accentInk : theme.textMuted }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {mode === 'reviews' ? <ReviewsFeed /> : <DemoCommunity />}

      {/* 콘텐츠가 끝나는 지점(below-fold)에 광고 — SSP 정책 준수 */}
      <BannerAd />

      <button
        type="button"
        className="pressable"
        onClick={() => navigate('/')}
        style={{ display: 'block', margin: '12px auto 0', background: 'none', border: 'none', color: theme.textMuted, fontSize: 13, cursor: 'pointer' }}
      >
        ← 홈으로
      </button>
    </div>
  );
}

export default CommunityPage;
