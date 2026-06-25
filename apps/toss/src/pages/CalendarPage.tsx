// 연재 캘린더 (/calendar) — 요일별 그리드의 토스(TDS) 렌더.
// 모든 로직은 @toonspectrum/core 공용 함수에서 온다(웹·NestJS 라우트와 단일 소스):
//   · WEEK_DAYS(요일 분류) · kstTodayIdx/kstDayOfWeek+DAY_IDX_FROM_GETDAY(KST '오늘' 인덱스)
//   · groupByWeekday(연재중 웹툰을 요일별·조회순 그룹화 — 서버 getCalendarData 와 동일 함수)
//   · applyTitleFilters(선택 장르 좁히기) · platform(id).name(원시 id 금지) · statsAreEstimated(정직성)
// 웹은 7열 그리드지만 토스는 모바일 우선이라 '요일 탭(오늘 선택) + 하루 세로 리스트'로 렌더한다.
// ICS 다운로드(buildWeeklyIcs/downloadIcs)는 파일 다운로드라 웹 전용 — 토스로 포팅하지 않는다.
import { Top } from '@toss/tds-mobile';
import {
  WEEK_DAYS,
  groupByWeekday,
  topGenres,
  platformCoverage,
  kstTodayIdx,
  applyTitleFilters,
  statsAreEstimated,
  platform,
  formatCount,
  EMPTY_TITLE_FILTERS,
} from '@toonspectrum/core';
import { useEffect, useMemo, useState } from 'react';

import { fetchTitles, coverUrl, type Title } from '../lib/api';
import { navigate } from '../router';
import { theme, pageShell } from '../theme';
import { Badge, Chips, Cover } from '../ui';
import { BannerAd } from '../components/BannerAd';

const ALL = '전체';

export function CalendarPage() {
  const [items, setItems] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 'KST 오늘' 인덱스(0=월 … 6=일)를 코어 헬퍼로 고정 — 토스 런타임 TZ와 무관.
  const todayIdx = useMemo(() => kstTodayIdx(), []);
  const [dayIdx, setDayIdx] = useState(todayIdx);
  const [genre, setGenre] = useState(ALL);

  useEffect(() => {
    fetchTitles()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : '불러오지 못했어요.'))
      .finally(() => setLoading(false));
  }, []);

  // 캘린더 대상 = 웹툰·연재중·연재요일 보유 (서버 getCalendarData 필터와 동일).
  const ongoing = useMemo(
    () => items.filter((t) => t.type === 'webtoon' && t.status === 'ongoing' && t.updateDays?.length),
    [items],
  );

  // 장르 칩 — core.topGenres 단일 소스(연재 작품 빈도순 상위 7).
  const genres = useMemo(() => [ALL, ...topGenres(ongoing, { limit: 7 })], [ongoing]);

  // 선택 장르로 좁히기 — 공용 applyTitleFilters 재사용(별도 로직 없음).
  const scoped = useMemo(() => {
    if (genre === ALL) return ongoing;
    return applyTitleFilters(ongoing, { ...EMPTY_TITLE_FILTERS, genres: [genre] });
  }, [ongoing, genre]);

  // 요일별·조회순 그룹화 — 코어 groupByWeekday(서버 라우트와 동일 함수).
  const byDay = useMemo(() => groupByWeekday(scoped), [scoped]);

  // 플랫폼 커버리지 — core.platformCoverage 단일 소스(캘린더·탐색·검색 공용). 표시명만 덧붙임.
  const coverage = useMemo(
    () => platformCoverage(scoped).slice(0, 6).map((c) => ({ ...c, name: platform(c.id).name })),
    [scoped],
  );

  const selDay = Math.min(dayIdx, WEEK_DAYS.length - 1);
  const selItems = byDay[selDay] ?? [];
  const totalScheduled = scoped.length;
  const open = (t: Title) => navigate(`/title/${encodeURIComponent(t.id)}`);

  return (
    <div style={{ minHeight: '100dvh', background: theme.bg }}>
      <Top
        title={<Top.TitleParagraph size={22}>📅 연재</Top.TitleParagraph>}
        subtitleBottom={
          <Top.SubtitleParagraph size={15}>
            {loading
              ? '요일별 연재 일정'
              : `오늘 ${WEEK_DAYS[todayIdx]}요일 · 새 회차 ${formatCount(byDay[todayIdx]?.length ?? 0)}편`}
          </Top.SubtitleParagraph>
        }
      />
      <div style={pageShell}>
        {/* 장르 좁히기 + 전체 연재 집계 */}
        {genres.length > 1 && (
          <div className="rise" style={{ marginBottom: 12 }}>
            <Chips items={genres} active={genre} onPick={setGenre} />
          </div>
        )}

        {/* 요일 탭 — 오늘 선택, 각 칸에 작품 수. role=tablist 로 a11y 보강. */}
        <div
          className="chips rise"
          role="tablist"
          aria-label="요일 선택"
          style={{ marginBottom: 14, animationDelay: '40ms' }}
        >
          {WEEK_DAYS.map((day, i) => {
            const on = i === selDay;
            const isToday = i === todayIdx;
            const n = byDay[i]?.length ?? 0;
            return (
              <button
                key={day}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setDayIdx(i)}
                className="pressable"
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  minWidth: 46,
                  padding: '7px 12px',
                  borderRadius: 14,
                  cursor: 'pointer',
                  border: on ? 'none' : `1px solid ${theme.border}`,
                  background: on ? theme.accent : 'transparent',
                  color: on ? theme.accentInk : isToday ? theme.accent : theme.textMuted,
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1 }}>
                  {day}
                  {isToday && !on && (
                    <span aria-hidden style={{ fontSize: 8, verticalAlign: 'top', marginLeft: 2 }}>
                      ●
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, opacity: on ? 0.85 : 0.7 }}>{n}</span>
              </button>
            );
          })}
        </div>

        {loading && (
          <p style={{ textAlign: 'center', color: theme.textMuted, padding: '40px 0' }}>불러오는 중…</p>
        )}
        {error && !loading && (
          <p style={{ textAlign: 'center', color: theme.danger, padding: '24px 0' }}>{error}</p>
        )}

        {!loading && !error && (
          <>
            {/* 플랫폼 커버리지 — 원시 id 대신 platform(id).name, '추정' 비율은 표기하지 않음(카운트는 색인 실측). */}
            {coverage.length > 0 && (
              <div
                className="rise"
                style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16, animationDelay: '70ms' }}
              >
                {coverage.map((p) => (
                  <span
                    key={p.id}
                    title={`${p.name} ${p.count}편`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      height: 26,
                      padding: '0 10px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      color: theme.textMuted,
                      background: 'rgba(255,255,255,0.06)',
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: p.color }} />
                    {p.name}
                    <span style={{ color: theme.text, fontWeight: 700 }}>{p.count}</span>
                  </span>
                ))}
              </div>
            )}

            {/* 선택 요일 세로 리스트 */}
            {selItems.length === 0 ? (
              <p
                style={{
                  textAlign: 'center',
                  color: theme.textMuted,
                  padding: '44px 16px',
                  borderRadius: theme.radius,
                  border: `1px dashed ${theme.border}`,
                  background: 'rgba(255,255,255,0.03)',
                }}
              >
                {totalScheduled === 0
                  ? genre === ALL
                    ? '연재요일 정보가 있는 작품이 없어요.'
                    : `‘${genre}’ 연재 작품이 없어요.`
                  : `${WEEK_DAYS[selDay]}요일 연재 작품이 없어요.`}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {selItems.map((t, i) => {
                  const est = statsAreEstimated(t);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => open(t)}
                      className="pressable rise"
                      style={{
                        animationDelay: `${Math.min(i, 12) * 22}ms`,
                        display: 'flex',
                        gap: 12,
                        alignItems: 'center',
                        textAlign: 'left',
                        padding: 10,
                        background: theme.surface,
                        border: `1px solid ${theme.border}`,
                        borderRadius: theme.radius,
                        color: theme.text,
                        cursor: 'pointer',
                      }}
                    >
                      <Cover
                        gradient={t.cover}
                        src={coverUrl(t)}
                        alt={t.title}
                        height={62}
                        radius={10}
                      />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            fontSize: 14.5,
                            fontWeight: 700,
                            lineHeight: 1.32,
                          }}
                        >
                          {t.title}
                        </span>
                        <span style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                          {t.genres?.[0] && <Badge accent>{t.genres[0]}</Badge>}
                          {t.stats?.ratingAvg != null && (
                            <Badge>
                              ★ {t.stats.ratingAvg.toFixed(1)}
                              {est ? ' 추정' : ''}
                            </Badge>
                          )}
                          {t.availability?.[0] && <Badge>{platform(t.availability[0].platformId).name}</Badge>}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {totalScheduled > 0 && (
              <p style={{ textAlign: 'center', color: theme.textMuted, fontSize: 12, padding: '18px 0 4px' }}>
                전체 연재 ≈{formatCount(totalScheduled)}편 색인 · 조회순 정렬
              </p>
            )}

            {/* 요일별 연재 리스트가 끝나는 지점(below-fold)에 광고 — SSP 정책 준수 */}
            {selItems.length > 0 && <BannerAd />}
          </>
        )}
      </div>
    </div>
  );
}
