// 랭킹 (/ranking) — @toonspectrum/core 의 RANK_AXES/axisMeta/PERIODS/rankBy/statsAreEstimated 로
// 축 탭·기간 칩·순위 행을 TDS 렌더로 구현한다. 웹은 /api/ranking 을 호출하지만 토스는
// fetchTitles() 캐시 위에서 rankBy 를 클라이언트로 돌린다(동일 함수, 서버 불필요).
// 로직은 전부 core 에서 import — 랭킹/정렬/추정 판별을 이 파일에서 재구현하지 않는다.
// 데이터 정직성: deltaEstimated/statsAreEstimated 는 '≈/추정' 표식으로만 노출한다.
import { useEffect, useMemo, useState } from 'react';
import { Top } from '@toss/tds-mobile';
import {
  RANK_AXES,
  axisMeta,
  PERIODS,
  rankBy,
  statsAreEstimated,
  formatCount,
  platform,
  type RankAxis,
  type RankPeriod,
  type RankedTitle,
} from '@toonspectrum/core';
import { fetchTitles, coverUrl, type Title } from '../lib/api';
import { GameCover } from '../games/GameCover';
import { theme, pageShell } from '../theme';
import { navigate } from '../router';

const RANK_LIMIT = 50;

// 축별 표시 지표 — 웹 ranking-board.tsx metricFor 와 동일 매핑(라벨·산식은 core, 표시값만 파생).
function metricFor(axis: RankAxis): (t: Title) => { label: string; value: string } {
  switch (axis) {
    case 'trending':
      return (t) => ({ label: '트렌드', value: String(Math.round(t.stats.trendingScore)) });
    case 'rating':
    case 'hidden':
      return (t) => ({ label: '평점', value: t.stats.ratingAvg.toFixed(1) });
    case 'favorites':
      return (t) => ({ label: '관심', value: formatCount(t.stats.bookmarks) });
    case 'binge':
      return (t) => ({ label: '몰입', value: String(Math.round(t.stats.bingeIndex)) });
    case 'completed':
      return (t) => ({ label: '완독률', value: `${Math.round(t.stats.completionRate)}%` });
    case 'rookie':
      return (t) => ({ label: '데뷔', value: String(t.releaseYear) });
    case 'popular':
    default:
      return (t) => ({ label: '조회', value: formatCount(t.stats.views) });
  }
}

// 대표 플랫폼명(원시 id 금지 — platform(id).name 사용). 오리지널 우선, 없으면 첫 매칭.
function primaryPlatformName(t: Title): string | null {
  const list = t.availability || [];
  if (!list.length) return null;
  const original = list.find((a) => a.isOriginal) ?? list[0];
  return platform(original.platformId)?.name ?? null;
}

// 순위 변동 표식 — popular/trending 만 실데이터, 그 외 축은 deltaEstimated(추정)면 '≈' 로만 노출하고
// 절대 하드 라이브 수치처럼 강조하지 않는다(데이터 정직성).
function DeltaMark({ r }: { r: RankedTitle }) {
  if (!r.delta) {
    return <span style={{ fontSize: 11, color: theme.textMuted, opacity: 0.55 }}>—</span>;
  }
  const up = r.delta > 0;
  const est = r.deltaEstimated;
  const color = est ? theme.textMuted : up ? '#5ad19a' : theme.danger;
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 700, color }}
      aria-label={`${up ? '상승' : '하락'} ${Math.abs(r.delta)}${est ? ' 추정' : ''}`}
    >
      {est ? '≈' : ''}
      {up ? '▲' : '▼'}
      {Math.abs(r.delta)}
    </span>
  );
}

export function RankingPage() {
  const [items, setItems] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [axis, setAxis] = useState<RankAxis>('popular');
  const [period, setPeriod] = useState<RankPeriod>('weekly');

  useEffect(() => {
    fetchTitles()
      .then(setItems)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '불러오지 못했어요.'))
      .finally(() => setLoading(false));
  }, []);

  const meta = axisMeta(axis);
  const metric = useMemo(() => metricFor(axis), [axis]);
  // 동일한 core rankBy 를 클라이언트에서 실행 — 웹의 /api/ranking 과 같은 산식·정렬·delta 추정.
  const ranked = useMemo(
    () => rankBy(items, axis, { period, limit: RANK_LIMIT }),
    [items, axis, period],
  );

  const open = (t: Title) => navigate(`/title/${encodeURIComponent(t.id)}`);

  return (
    <div style={{ minHeight: '100dvh', background: theme.bg }}>
      <Top
        title={<Top.TitleParagraph size={22}>🏆 랭킹</Top.TitleParagraph>}
        subtitleBottom={
          <Top.SubtitleParagraph size={15}>축·기간별로 보는 화제의 작품</Top.SubtitleParagraph>
        }
      />
      <div style={pageShell}>
        {/* 축 탭 — RANK_AXES 가로 스크롤 세그먼트(라벨은 core 제공) */}
        <div
          className="chips rise"
          role="tablist"
          aria-label="랭킹 축"
          style={{ marginBottom: 12 }}
        >
          {RANK_AXES.map((a) => {
            const on = a.key === axis;
            return (
              <button
                key={a.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setAxis(a.key)}
                className="pressable"
                style={{
                  flexShrink: 0,
                  height: 36,
                  padding: '0 15px',
                  borderRadius: 999,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: on ? 'none' : `1px solid ${theme.border}`,
                  background: on ? theme.accent : 'transparent',
                  color: on ? theme.accentInk : theme.textMuted,
                }}
              >
                {a.label}
              </button>
            );
          })}
        </div>

        {/* 기간 칩(2차 행) — PERIODS daily/weekly/monthly/all */}
        <div
          className="chips rise"
          role="tablist"
          aria-label="집계 기간"
          style={{ animationDelay: '50ms', marginBottom: 14 }}
        >
          {PERIODS.map((p) => {
            const on = p.key === period;
            return (
              <button
                key={p.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setPeriod(p.key)}
                className="pressable"
                style={{
                  flexShrink: 0,
                  height: 30,
                  padding: '0 13px',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background: on ? theme.accentSoft : 'rgba(255,255,255,0.05)',
                  color: on ? theme.accent : theme.textMuted,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* 현재 축 산식(투명 산식 — core formula 그대로 노출) */}
        <div
          className="rise"
          style={{
            animationDelay: '80ms',
            marginBottom: 16,
            padding: '11px 13px',
            borderRadius: 12,
            background: theme.surface,
            border: `1px solid ${theme.border}`,
          }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 700, color: theme.text }}>{meta.desc}</div>
          <div
            style={{
              fontSize: 11.5,
              lineHeight: 1.45,
              color: theme.textMuted,
              marginTop: 4,
              wordBreak: 'keep-all',
            }}
          >
            <span style={{ color: theme.accent, fontWeight: 700, marginRight: 5 }}>산식</span>
            {meta.formula}
          </div>
        </div>

        {loading && (
          <p style={{ textAlign: 'center', color: theme.textMuted, padding: '40px 0' }}>
            순위 집계 중…
          </p>
        )}
        {error && (
          <p style={{ textAlign: 'center', color: theme.danger, padding: '24px 0' }}>{error}</p>
        )}

        {!loading && !error && ranked.length === 0 && (
          <p style={{ textAlign: 'center', color: theme.textMuted, padding: '40px 0' }}>
            이 조건에 맞는 작품이 없어요.
          </p>
        )}

        {ranked.length > 0 && (
          <ol
            aria-label={`${meta.label} 랭킹`}
            style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            {ranked.map((r, i) => {
              const t = r.title;
              const m = metric(t);
              const estimated = statsAreEstimated(t);
              const pName = primaryPlatformName(t);
              const top = r.rank <= 3;
              return (
                <li key={t.id} style={{ listStyle: 'none' }}>
                  <button
                    type="button"
                    onClick={() => open(t)}
                    className="pressable rise"
                    style={{
                      animationDelay: `${Math.min(i, 12) * 22}ms`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: 14,
                      border: `1px solid ${theme.border}`,
                      background: theme.surface,
                      color: theme.text,
                      cursor: 'pointer',
                    }}
                  >
                    {/* 순위 + 변동 */}
                    <div
                      style={{
                        width: 34,
                        flexShrink: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 19,
                          fontWeight: 900,
                          lineHeight: 1,
                          color: top ? theme.accent : theme.textMuted,
                        }}
                      >
                        {r.rank}
                      </span>
                      <DeltaMark r={r} />
                    </div>

                    {/* 표지(GameCover — 그라디언트 폴백 + 표지 킬스위치 정책 적용) */}
                    <div style={{ width: 40, flexShrink: 0 }}>
                      <GameCover
                        t={{
                          id: t.id,
                          title: t.title,
                          author: t.author,
                          genres: t.genres || [],
                          cover: t.cover,
                          coverImage: coverUrl(t) ?? undefined,
                          views: t.stats.views,
                          likes: t.stats.likes,
                          bookmarks: t.stats.bookmarks,
                        }}
                        radius={9}
                      />
                    </div>

                    {/* 제목 · 작가 · 플랫폼 */}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 14.5,
                          fontWeight: 700,
                          lineHeight: 1.3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t.title}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: theme.textMuted,
                          marginTop: 3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {[t.author || t.artist, pName].filter(Boolean).join(' · ') || ' '}
                      </div>
                    </div>

                    {/* 축 지표 + 추정 표식 */}
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.1 }}>
                        {estimated && (
                          <span style={{ color: theme.textMuted, fontWeight: 700, marginRight: 1 }}>
                            ≈
                          </span>
                        )}
                        {m.value}
                      </div>
                      <div
                        style={{
                          fontSize: 10.5,
                          color: theme.textMuted,
                          marginTop: 3,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        {m.label}
                        {estimated && (
                          <span
                            style={{
                              fontSize: 9.5,
                              fontWeight: 700,
                              color: theme.accent,
                              opacity: 0.85,
                            }}
                            title="핵심 지표가 추정값이에요"
                          >
                            추정
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {/* 정직성 푸터 — 산식·추정 안내 */}
        {ranked.length > 0 && (
          <p
            style={{
              fontSize: 11,
              color: theme.textMuted,
              opacity: 0.7,
              textAlign: 'center',
              lineHeight: 1.6,
              margin: '20px 0 0',
            }}
          >
            검증된 카탈로그 스냅샷에 투명 산식을 적용한 결과예요. ‘≈/추정’ 표식은 일부 지표가
            추정값임을 뜻하며, 라이브 실시간 수치가 아니에요.
          </p>
        )}
      </div>
    </div>
  );
}
