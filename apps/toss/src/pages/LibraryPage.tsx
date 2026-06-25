// 내 서재 / 라이브러리 (/library) — 찜·평점·구독·컬렉션·취향 분석을 한곳에 모은다.
// 웹(src/domains/catalog/LibraryPage.tsx + components/library-view.tsx)의 5탭(서재·평가·연재 알림·
// 취향 분석·컬렉션) + AccountPage ActivityTab(요약 통계)을 미러링하되, TOSS UI(ui.tsx · tds-shim)로 렌더한다.
//
// 모든 로직/영속은 단일 소스에서만 온다(로직 중복 금지):
//   lib/library.ts ........ 토스 영속 레이어(core createBookmarkStore/deriveSavedTitleIds 기반)
//   @toonspectrum/core .... buildTasteProfile/recommendForTaste(취향), statsAreEstimated(정직성),
//                           WEEK_DAYS(연재 요일), platform(플랫폼 이름·색)
//   lib/api.ts ............ fetchTitles/coverUrl(카탈로그 메타 — 구독/컬렉션 카드 enrich)
// 토스는 서버(/api/me/*)가 mTLS 미가동이라 '이 기기에만 저장'(localStorage 전용). 표지는 정책 준수.
import {
  buildTasteProfile,
  recommendForTaste,
  statsAreEstimated,
  WEEK_DAYS,
  type Title,
} from '@toonspectrum/core';
import { Top, Button } from '@toss/tds-mobile';
import { useEffect, useMemo, useState } from 'react';

import { BannerAd } from '../components/BannerAd';
import { coverUrl, fetchTitles } from '../lib/api';
import {
  createCollection,
  deleteCollection,
  removeSaved,
  renameCollection,
  resetLibrary,
  setRating,
  setRead,
  toggleSubscription,
  useCollections,
  useRatings,
  useReads,
  useSaved,
  useSubscriptions,
  type Collection,
  type RatingScale,
} from '../lib/library';
import { navigate } from '../router';
import { pageShell, theme } from '../theme';
import { Badge, Cover } from '../ui';

type Tab = 'shelf' | 'rated' | 'alerts' | 'taste' | 'collections';
type ReadState = 'want' | 'reading' | 'done' | 'dropped';
type RatedSort = 'high' | 'low' | 'title';

const READ_TABS: { value: ReadState; label: string }[] = [
  { value: 'want', label: '관심' },
  { value: 'reading', label: '보는 중' },
  { value: 'done', label: '완독' },
  { value: 'dropped', label: '하차' },
];
const RATED_SORTS: { value: RatedSort; label: string }[] = [
  { value: 'high', label: '별점 높은순' },
  { value: 'low', label: '별점 낮은순' },
  { value: 'title', label: '가나다순' },
];
// getDay()(일=0) → WEEK_DAYS(월=0) 인덱스 매핑.
const DAY_FROM_GETDAY = [6, 0, 1, 2, 3, 4, 5];
const COLLECTION_EMOJI = ['📚', '❤️', '🔥', '⭐', '🌙', '🎯', '🧊', '🍿'] as const;

/* ── 별점 스케일(표시 변환) — 웹 RatingScale 과 동일 모델 ─────────────────── */
function fmtRating(value: number, scale: RatingScale): string {
  if (scale === 'ten') return (value * 2).toFixed(1);
  if (scale === 'hundred') return String(Math.round(value * 20));
  return value.toFixed(1);
}

/* ── 입력 가능한 별점(0.5 단위) ──────────────────────────────────────────── */
function StarInput({ id, value }: { id: string; value: number }) {
  return (
    <div style={{ display: 'flex', gap: 1 }} role="group" aria-label="내 별점">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value >= n;
        const half = !filled && value >= n - 0.5;
        return (
          <button
            key={n}
            type="button"
            className="pressable"
            // 누른 별의 윗쪽 절반=‑0.5, 같은 값 재선택=해제(0).
            onClick={(e) => {
              e.stopPropagation();
              const next = value === n ? n - 0.5 : value === n - 0.5 ? 0 : n;
              setRating(id, next);
            }}
            aria-label={`${n}점`}
            aria-pressed={filled}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, color: filled || half ? theme.accent : theme.textMuted }}
          >
            {filled ? '★' : half ? '⯨' : '☆'}
          </button>
        );
      })}
    </div>
  );
}

function EmptyTeach({ icon, title, desc, cta }: { icon: string; title: string; desc: string; cta?: { label: string; to: string } }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '44px 18px', textAlign: 'center', borderRadius: theme.radius, border: `1px dashed ${theme.border}`, background: theme.surface }}>
      <span style={{ fontSize: 34 }} aria-hidden>{icon}</span>
      <div>
        <p style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>{title}</p>
        <p style={{ fontSize: 13, color: theme.textMuted, marginTop: 4, lineHeight: 1.55, maxWidth: 280 }}>{desc}</p>
      </div>
      {cta && (
        <button type="button" className="pressable" onClick={() => navigate(cta.to)} style={{ marginTop: 4, height: 44, padding: '0 20px', borderRadius: 12, border: 'none', background: theme.accent, color: theme.accentInk, fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}>
          {cta.label}
        </button>
      )}
    </div>
  );
}

/* ── 작은 작품 행(미니 포스터 + 제목/메타) — 평가·연재 목록 공용 ──────────── */
function TitleRow({ t, right, sub }: { t: Title; right?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <button
      type="button"
      className="pressable"
      onClick={() => navigate(`/title/${encodeURIComponent(t.id)}`)}
      style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', padding: 10, borderRadius: 14, background: theme.surface, border: `1px solid ${theme.border}`, color: theme.text, cursor: 'pointer' }}
      aria-label={`${t.title} 상세`}
    >
      <Cover gradient={t.cover} src={coverUrl(t)} alt="" height={60} radius={9} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
        {sub ?? (t.author && <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 3 }}>{t.author}</div>)}
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </button>
  );
}

export function LibraryPage() {
  const saved = useSaved();
  const ratings = useRatings();
  const reads = useReads();
  const subscriptions = useSubscriptions();
  const collections = useCollections();

  const [tab, setTab] = useState<Tab>('shelf');
  const [readTab, setReadTab] = useState<ReadState>('want');
  const [ratedSort, setRatedSort] = useState<RatedSort>('high');
  const [scale, setScale] = useState<RatingScale>('star');
  const [items, setItems] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);

  // 카탈로그 메타(표지·장르·요일) — 구독/컬렉션/취향 카드 enrich. 토스는 서버 없이 fetchTitles 로 받는다.
  useEffect(() => {
    let on = true;
    fetchTitles()
      .then((list) => on && setItems(list))
      .catch(() => {})
      .finally(() => on && setLoading(false));
    return () => {
      on = false;
    };
  }, []);

  const byId = useMemo(() => {
    const m = new Map<string, Title>();
    for (const t of items) {
      m.set(t.id, t);
      m.set(t.slug, t);
    }
    return m;
  }, [items]);

  // 별점·읽음 집계
  const ratedEntries = Object.entries(ratings);
  const readEntries = Object.entries(reads);
  const counts: Record<ReadState, number> = { want: 0, reading: 0, done: 0, dropped: 0 };
  for (const [, st] of readEntries) counts[st as ReadState] = (counts[st as ReadState] ?? 0) + 1;
  const subCount = Object.values(subscriptions).filter(Boolean).length;
  const savedCount = saved.length || readEntries.length;

  // 취향 프로필·추천(core 단일 소스). seen=평가+읽음+구독 id 로 추천에서 제외.
  const profile = useMemo(() => buildTasteProfile(items, ratings, reads as Record<string, ReadState>), [items, ratings, reads]);
  const recs = useMemo(() => {
    const seen = new Set<string>([...Object.keys(ratings), ...Object.keys(reads), ...Object.keys(subscriptions).filter((k) => subscriptions[k])]);
    return recommendForTaste(items, profile, seen, 6);
  }, [items, profile, ratings, reads, subscriptions]);

  // 평균 별점(요약 통계 — AccountPage ActivityTab 미러)
  const avgRating = ratedEntries.length ? ratedEntries.reduce((s, [, r]) => s + r, 0) / ratedEntries.length : 0;

  const TAB_LABELS: { value: Tab; label: string }[] = [
    { value: 'shelf', label: `서재 ${readEntries.length || ''}`.trim() },
    { value: 'rated', label: `평가 ${ratedEntries.length || ''}`.trim() },
    { value: 'alerts', label: `연재 알림 ${subCount || ''}`.trim() },
    { value: 'taste', label: '취향 분석' },
    { value: 'collections', label: '컬렉션' },
  ];

  return (
    <div style={{ minHeight: '100dvh', background: theme.bg }}>
      <Top
        title={<Top.TitleParagraph size={22}>★ 내 서재</Top.TitleParagraph>}
        subtitleBottom={<Top.SubtitleParagraph size={15}>찜한 작품·내 평점·연재 구독을 한곳에서</Top.SubtitleParagraph>}
      />

      <div style={pageShell}>
        {/* 요약 통계 스트립 — AccountPage ActivityTab 미러 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { label: '서재', value: String(savedCount) },
            { label: '평가', value: String(ratedEntries.length) },
            { label: '내 평균', value: avgRating ? fmtRating(avgRating, scale) : '·' },
            { label: '구독', value: String(subCount) },
          ].map((s) => (
            <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: '12px 4px', borderRadius: 14, background: theme.surface, border: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: theme.text }}>{s.value}</div>
              <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* 탭 — 가로 스크롤 칩 */}
        <div className="chips" role="tablist" aria-label="서재 탭" style={{ marginBottom: 16 }}>
          {TAB_LABELS.map((tb) => {
            const on = tb.value === tab;
            return (
              <button
                key={tb.value}
                type="button"
                role="tab"
                aria-selected={on}
                className="pressable"
                onClick={() => setTab(tb.value)}
                style={{ flexShrink: 0, height: 36, padding: '0 16px', borderRadius: 999, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', border: on ? 'none' : `1px solid ${theme.border}`, background: on ? theme.accent : 'transparent', color: on ? theme.accentInk : theme.textMuted }}
              >
                {tb.label}
              </button>
            );
          })}
        </div>

        {/* ── 서재 — 읽음 상태별 작품(관심/보는 중/완독/하차) + 찜 목록 ── */}
        {tab === 'shelf' && (
          <ShelfTab
            saved={saved}
            reads={reads}
            byId={byId}
            readTab={readTab}
            setReadTab={setReadTab}
            counts={counts}
            loading={loading}
          />
        )}

        {/* ── 내 평가 ── */}
        {tab === 'rated' && (
          <RatedTab
            ratedEntries={ratedEntries}
            byId={byId}
            sort={ratedSort}
            setSort={setRatedSort}
            scale={scale}
            setScale={setScale}
          />
        )}

        {/* ── 연재 알림(구독) — 요일별 ── */}
        {tab === 'alerts' && <AlertsTab subscriptions={subscriptions} byId={byId} />}

        {/* ── 취향 분석 ── */}
        {tab === 'taste' && (
          <TasteTab profile={profile} recs={recs} scale={scale} hasData={ratedEntries.length > 0 || readEntries.length > 0} />
        )}

        {/* ── 컬렉션 CRUD ── */}
        {tab === 'collections' && <CollectionsTab collections={collections} byId={byId} />}

        {/* 설정/초기화 푸터 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px', marginTop: 24, paddingTop: 16, borderTop: `1px solid ${theme.border}`, fontSize: 12, color: theme.textMuted }}>
          <span>별점 표기</span>
          <div role="group" aria-label="별점 표기 단위" style={{ display: 'inline-flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${theme.border}` }}>
            {(['star', 'ten', 'hundred'] as RatingScale[]).map((s) => {
              const on = scale === s;
              return (
                <button key={s} type="button" onClick={() => setScale(s)} aria-pressed={on} style={{ padding: '5px 10px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: on ? theme.accentSoft : 'transparent', color: on ? theme.accent : theme.textMuted }}>
                  {s === 'star' ? '5점' : s === 'ten' ? '10점' : '100점'}
                </button>
              );
            })}
          </div>
          {(readEntries.length > 0 || ratedEntries.length > 0 || saved.length > 0) && (
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.confirm('내 서재 데이터를 모두 초기화할까요?')) resetLibrary();
              }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: theme.danger }}
            >
              서재 초기화
            </button>
          )}
        </div>

        {/* '이 기기에만 저장' 정직성 카피 — SavedPage 와 동일(서버 동기화는 mTLS 라이브 후) */}
        <p style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 14, lineHeight: 1.55 }}>
          내 서재 기록은 이 기기에만 저장돼요. 평점·평균은 추정치(≈)일 수 있어요.
        </p>

        {/* 콘텐츠가 끝나는 지점(below-fold)에 광고 — 토스 애즈 SSP 정책 준수 */}
        <BannerAd />
      </div>
    </div>
  );
}

/* ── 서재 탭 ─────────────────────────────────────────────────────────────── */
function ShelfTab({
  saved,
  reads,
  byId,
  readTab,
  setReadTab,
  counts,
  loading,
}: {
  saved: ReturnType<typeof useSaved>;
  reads: Record<string, string>;
  byId: Map<string, Title>;
  readTab: ReadState;
  setReadTab: (v: ReadState) => void;
  counts: Record<ReadState, number>;
  loading: boolean;
}) {
  // 읽음 상태가 있는 작품을 카탈로그 메타와 합쳐 현재 탭으로 필터.
  const shelf = Object.entries(reads)
    .filter(([, st]) => st === readTab)
    .map(([id]) => byId.get(id))
    .filter((t): t is Title => Boolean(t));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 찜한 작품(빠른 진입) — 가로 스크롤 */}
      {saved.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>찜한 작품</h3>
            <span style={{ fontSize: 12, color: theme.textMuted }}>{saved.length}편 · 최근 담은 순</span>
          </div>
          <div className="chips" style={{ gap: 12 }}>
            {saved.map((s) => {
              const t = byId.get(s.id);
              return (
                <div key={s.id} style={{ width: 76, flexShrink: 0 }}>
                  <button type="button" className="pressable" onClick={() => navigate(`/title/${encodeURIComponent(s.id)}`)} style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} aria-label={`${s.title} 상세`}>
                    <Cover gradient={t?.cover ?? s.cover} src={t ? coverUrl(t) : s.coverImage} alt="" height={101} radius={10} />
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 6 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                    <button type="button" className="pressable" onClick={() => removeSaved(s.id)} aria-label={`${s.title} 찜 해제`} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, fontSize: 13, padding: 0 }}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 읽음 상태 세그먼트 */}
      <div role="group" aria-label="읽음 상태" style={{ display: 'flex', padding: 3, borderRadius: 12, background: theme.surfaceAlt, border: `1px solid ${theme.border}` }}>
        {READ_TABS.map((rt) => {
          const on = rt.value === readTab;
          return (
            <button key={rt.value} type="button" className="pressable" onClick={() => setReadTab(rt.value)} aria-pressed={on} style={{ flex: 1, height: 34, borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: on ? theme.accent : 'transparent', color: on ? theme.accentInk : theme.textMuted }}>
              {rt.label}{counts[rt.value] ? ` ${counts[rt.value]}` : ''}
            </button>
          );
        })}
      </div>

      {loading && Object.keys(reads).length > 0 && shelf.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ height: 80, borderRadius: 14, background: theme.surface, border: `1px solid ${theme.border}` }} />
          ))}
        </div>
      ) : shelf.length === 0 ? (
        <EmptyTeach
          icon="📚"
          title="아직 담은 작품이 없어요"
          desc="작품 상세에서 상태(관심·보는 중·완독)를 정하면 여기에 모여요."
          cta={{ label: '작품 탐색하기', to: '/explore' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shelf.map((t) => (
            <TitleRow
              key={t.id}
              t={t}
              right={
                <button
                  type="button"
                  className="pressable"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRead(t.id, null);
                  }}
                  aria-label="서재에서 빼기"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: 4 }}
                >
                  ✕
                </button>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 평가 탭 ─────────────────────────────────────────────────────────────── */
function RatedTab({
  ratedEntries,
  byId,
  sort,
  setSort,
  scale,
}: {
  ratedEntries: [string, number][];
  byId: Map<string, Title>;
  sort: RatedSort;
  setSort: (v: RatedSort) => void;
  scale: RatingScale;
  setScale: (v: RatingScale) => void;
}) {
  const sorted = [...ratedEntries].sort((a, b) => {
    if (sort === 'title') return (byId.get(a[0])?.title ?? '').localeCompare(byId.get(b[0])?.title ?? '', 'ko-KR');
    return sort === 'low' ? a[1] - b[1] : b[1] - a[1];
  });

  if (ratedEntries.length === 0) {
    return (
      <EmptyTeach
        icon="⭐"
        title="평가한 작품이 없어요"
        desc="별점을 남기면 취향 분석과 추천이 정교해져요."
        cta={{ label: '랭킹에서 평가하기', to: '/ranking' }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, color: theme.textMuted }}>
          평가 <strong style={{ color: theme.text }}>{ratedEntries.length}</strong>편
        </span>
        <div className="chips" style={{ flex: '0 1 auto' }}>
          {RATED_SORTS.map((s) => {
            const on = s.value === sort;
            return (
              <button key={s.value} type="button" className="pressable" onClick={() => setSort(s.value)} aria-pressed={on} style={{ flexShrink: 0, height: 30, padding: '0 11px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: on ? 'none' : `1px solid ${theme.border}`, background: on ? theme.accentSoft : 'transparent', color: on ? theme.accent : theme.textMuted }}>
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map(([id, r]) => {
          const t = byId.get(id);
          // 카탈로그에 없으면(스냅샷 누락) 최소 카드로 — 별점은 항상 조정 가능.
          if (!t) {
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, background: theme.surface, border: `1px solid ${theme.border}` }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{id}</div>
                <StarInput id={id} value={r} />
              </div>
            );
          }
          const est = statsAreEstimated(t);
          return (
            <TitleRow
              key={id}
              t={t}
              sub={<div style={{ marginTop: 6 }}><StarInput id={id} value={r} /></div>}
              right={
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: theme.accent }}>{fmtRating(r, scale)}</div>
                  {t.stats?.ratingAvg > 0 && (
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                      평균 {est ? '≈' : ''}{fmtRating(t.stats.ratingAvg, scale)}
                    </div>
                  )}
                </div>
              }
            />
          );
        })}
      </div>
    </div>
  );
}

/* ── 연재 알림 탭(요일별) ─────────────────────────────────────────────────── */
function AlertsTab({ subscriptions, byId }: { subscriptions: Record<string, boolean>; byId: Map<string, Title> }) {
  const subTitles = Object.entries(subscriptions)
    .filter(([, on]) => on)
    .map(([id]) => byId.get(id))
    .filter((t): t is Title => Boolean(t));
  const todayDay = WEEK_DAYS[DAY_FROM_GETDAY[new Date().getDay()]];

  if (Object.values(subscriptions).filter(Boolean).length === 0) {
    return (
      <EmptyTeach
        icon="🔔"
        title="구독한 연재가 없어요"
        desc="작품 상세에서 '연재 알림'을 켜면 요일별 업데이트를 모아 보여드려요."
        cta={{ label: '연재 캘린더 보기', to: '/calendar' }}
      />
    );
  }

  const todaySubs = subTitles.filter((t) => t.updateDays?.includes(todayDay));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {todaySubs.length > 0 && (
        <div style={{ padding: 14, borderRadius: theme.radius, border: `1px solid ${theme.accent}`, background: theme.accentSoft }}>
          <h3 style={{ fontSize: 14.5, fontWeight: 800, color: theme.accent, marginBottom: 10 }}>
            🔔 오늘({todayDay}) 새 회차 {todaySubs.length}편
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {todaySubs.map((t) => (
              <TitleRow key={t.id} t={t} />
            ))}
          </div>
        </div>
      )}

      {WEEK_DAYS.map((day) => {
        const list = subTitles.filter((t) => t.updateDays?.includes(day));
        if (list.length === 0) return null;
        const isToday = day === todayDay;
        return (
          <section key={day}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, marginBottom: 9, color: isToday ? theme.accent : theme.text }}>
              {day}요일
              <span style={{ fontSize: 12, fontWeight: 500, color: theme.textMuted }}>{list.length}편{isToday ? ' · 오늘' : ''}</span>
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {list.map((t) => (
                <TitleRow
                  key={t.id}
                  t={t}
                  right={
                    <button
                      type="button"
                      className="pressable"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSubscription(t.id);
                      }}
                      aria-label="알림 끄기"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.accent, fontSize: 16, padding: 4 }}
                    >
                      🔔
                    </button>
                  }
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* 구독했지만 카탈로그 메타가 없는 작품은 요일 미상 — 정직하게 안내 */}
      {subTitles.length === 0 && (
        <p style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.6 }}>
          구독한 작품의 연재 요일 정보를 불러오는 중이에요.
        </p>
      )}
    </div>
  );
}

/* ── 취향 분석 탭 ────────────────────────────────────────────────────────── */
function TasteTab({
  profile,
  recs,
  scale,
  hasData,
}: {
  profile: ReturnType<typeof buildTasteProfile>;
  recs: { title: Title; reason: string }[];
  scale: RatingScale;
  hasData: boolean;
}) {
  if (!hasData || (profile.ratedCount === 0 && profile.topGenres.length === 0)) {
    return (
      <EmptyTeach
        icon="🧭"
        title="취향 데이터를 모으는 중"
        desc="작품을 평가하거나 서재에 담으면 당신의 취향 스펙트럼을 분석해 드려요."
        cta={{ label: '지금 평가하기', to: '/ranking' }}
      />
    );
  }

  const maxGenre = profile.topGenres[0]?.weight || 1;
  const affinity = profile.affinityType === 'webtoon' ? '웹툰파' : profile.affinityType === 'webnovel' ? '웹소설파' : '균형 잡힌 독자';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16, borderRadius: theme.radius, background: theme.surface, border: `1px solid ${theme.border}` }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 11.5, color: theme.textMuted, letterSpacing: 0.3 }}>독자 유형</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: theme.accent, marginTop: 4 }}>{affinity}</p>
        </div>
        <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: theme.text }}>{profile.ratedCount}</div>
            <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>평가</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: theme.text }}>{profile.avgRating ? fmtRating(profile.avgRating, scale) : '·'}</div>
            <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>내 평균</div>
          </div>
        </div>
      </div>

      {profile.topGenres.length > 0 && (
        <div style={{ padding: 16, borderRadius: theme.radius, background: theme.surface, border: `1px solid ${theme.border}` }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: theme.text }}>선호 장르 스펙트럼</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {profile.topGenres.map((g) => {
              const pct = Math.round((g.weight / maxGenre) * 100);
              return (
                <div key={g.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
                    <span style={{ color: theme.text, fontWeight: 600 }}>{g.name}</span>
                    <span style={{ color: theme.textMuted }}>{pct}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: theme.surfaceAlt, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: theme.accent }} />
                  </div>
                </div>
              );
            })}
          </div>
          {profile.topTags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
              {profile.topTags.map((t) => (
                <Badge key={t.name}>#{t.name}</Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {recs.length > 0 && (
        <section>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: theme.text }}>✨ 취향 저격 추천</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {recs.map(({ title, reason }) => (
              <button
                key={title.id}
                type="button"
                className="pressable"
                onClick={() => navigate(`/title/${encodeURIComponent(title.id)}`)}
                style={{ textAlign: 'left', background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius, overflow: 'hidden', padding: 0, color: theme.text, cursor: 'pointer' }}
                aria-label={`${title.title} 상세`}
              >
                <Cover gradient={title.cover} src={coverUrl(title)} alt="" height={120} radius={0} />
                <div style={{ padding: '9px 11px 11px' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.6em' }}>{title.title}</div>
                  <div style={{ fontSize: 11, color: theme.accent, marginTop: 6, lineHeight: 1.4 }}>{reason}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ── 컬렉션 탭(CRUD) ─────────────────────────────────────────────────────── */
function CollectionsTab({ collections, byId }: { collections: Collection[]; byId: Map<string, Title> }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string>(COLLECTION_EMOJI[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const commitRename = () => {
    if (editingId && editName.trim()) renameCollection(editingId, editName);
    setEditingId(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 새 컬렉션 만들기 */}
      <div style={{ padding: 12, borderRadius: theme.radius, background: theme.surface, border: `1px solid ${theme.border}` }}>
        <div role="group" aria-label="아이콘 선택" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {COLLECTION_EMOJI.map((e) => {
            const on = e === emoji;
            return (
              <button key={e} type="button" className="pressable" onClick={() => setEmoji(e)} aria-label={`아이콘 ${e}`} aria-pressed={on} style={{ width: 38, height: 38, borderRadius: 11, fontSize: 18, cursor: 'pointer', border: on ? `1px solid ${theme.accent}` : `1px solid ${theme.border}`, background: on ? theme.accentSoft : theme.surfaceAlt }}>
                {e}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                createCollection(name.trim(), emoji);
                setName('');
              }
            }}
            aria-label="새 컬렉션 이름"
            placeholder="새 컬렉션 이름"
            style={{ flex: 1, minWidth: 0, height: 44, padding: '0 14px', borderRadius: 11, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 14 }}
          />
          <Button
            onClick={() => {
              if (name.trim()) {
                createCollection(name.trim(), emoji);
                setName('');
              }
            }}
            disabled={!name.trim()}
            style={{ minHeight: 44, padding: '0 16px', fontSize: 14 }}
          >
            만들기
          </Button>
        </div>
      </div>

      {collections.length === 0 ? (
        <EmptyTeach
          icon="📁"
          title="컬렉션이 없어요"
          desc="나만의 테마로 작품을 묶어보세요. 작품 상세에서 컬렉션에 담을 수 있어요."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {collections.map((c) => {
            const titles = c.titleIds.map((id) => byId.get(id)).filter((t): t is Title => Boolean(t)).slice(0, 5);
            const editing = editingId === c.id;
            return (
              <div key={c.id} style={{ padding: 14, borderRadius: theme.radius, background: theme.surface, border: `1px solid ${theme.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }} aria-hidden>{c.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editing ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename();
                          else if (e.key === 'Escape') setEditingId(null);
                        }}
                        aria-label="컬렉션 이름 변경"
                        style={{ width: '100%', height: 32, padding: '0 8px', borderRadius: 8, border: `1px solid ${theme.accent}`, background: theme.bg, color: theme.text, fontSize: 14.5, fontWeight: 700 }}
                      />
                    ) : (
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    )}
                    <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{c.titleIds.length}편</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {editing ? (
                      <button type="button" className="pressable" onClick={commitRename} aria-label="이름 저장" style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.accent, fontSize: 16, padding: 4 }}>✓</button>
                    ) : (
                      <button
                        type="button"
                        className="pressable"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditName(c.name);
                        }}
                        aria-label="이름 변경"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, fontSize: 15, padding: 4 }}
                      >
                        ✎
                      </button>
                    )}
                    <button type="button" className="pressable" onClick={() => deleteCollection(c.id)} aria-label="컬렉션 삭제" style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, fontSize: 15, padding: 4 }}>🗑</button>
                  </div>
                </div>
                {titles.length > 0 ? (
                  <div className="chips" style={{ gap: 8, marginTop: 12 }}>
                    {titles.map((t) => (
                      <button key={t.id} type="button" className="pressable" onClick={() => navigate(`/title/${encodeURIComponent(t.id)}`)} style={{ width: 48, flexShrink: 0, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} aria-label={`${t.title} 상세`}>
                        <Cover gradient={t.cover} src={coverUrl(t)} alt="" height={64} radius={8} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: theme.textMuted, marginTop: 12, lineHeight: 1.5 }}>
                    아직 비어 있어요. 작품 상세에서 '컬렉션에 담기'를 눌러보세요.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default LibraryPage;
