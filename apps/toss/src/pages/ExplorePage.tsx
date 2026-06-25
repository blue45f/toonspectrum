// 탐색 (/explore) — 장르 스펙트럼 + 패싯 필터. 웹(src/domains/catalog/ExplorePage.tsx +
// components/title-filter-panel.tsx)을 미러링하되 TOSS UI(ui.tsx · tds-shim)로 렌더한다.
//
// 모든 로직은 @toonspectrum/core 에서 가져온다(웹·토스 단일 소스, 로직 중복 금지):
//   GENRES / TYPE_LABEL ............ 장르 스펙트럼 그리드 · 유형 토글 라벨
//   EMPTY_TITLE_FILTERS / TitleFilterState ... 필터 상태 (웹과 동일 shape)
//   applyTitleFilters .............. 클라이언트 패싯 필터 적용기 (웹과 동일 함수)
//   countActiveTitleFilters ........ 활성 필터 배지
//   sortTitles ..................... 정렬(search.ts)
//   STATUS/AGE/PRICING/TYPE/MIN_RATING_OPTIONS, YEAR_BUCKETS ... 패싯 옵션 단일 소스
//   PLATFORMS / platform ........... 플랫폼 이름·색(원시 id 미노출 — platform(id).name)
//   statsAreEstimated .............. 추정 지표 정직성(≈/추정 표식)
//
// 웹은 titleFiltersToParams -> /api/explore 를 호출하지만, 토스는 서버가 없으므로
// fetchTitles() 위에서 applyTitleFilters 를 직접 적용한다(동일 TitleFilterState · 동일 applier).
// 모바일: 패싯 패널은 TDS 바텀시트로 접는다. 장르 스펙트럼 = GENRES 의 탭 가능한 칩.
import {
  EMPTY_TITLE_FILTERS,
  GENRES,
  TYPE_LABEL,
  STATUS_OPTIONS,
  AGE_OPTIONS,
  PRICING_OPTIONS,
  TYPE_OPTIONS,
  MIN_RATING_OPTIONS,
  YEAR_BUCKETS,
  PLATFORMS,
  platform,
  applyTitleFilters,
  countActiveTitleFilters,
  sortTitles,
  statsAreEstimated,
  type TitleFilterState,
  type PlatformId,
  type SortKey,
} from '@toonspectrum/core';
import { Top } from '@toss/tds-mobile';
import { useEffect, useMemo, useState } from 'react';

import { fetchTitles, coverUrl, type Title } from '../lib/api';
import { navigate } from '../router';
import { theme, pageShell } from '../theme';
import { Badge, Cover } from '../ui';

// ── 장르 색상(코스메틱) ─────────────────────────────────────────────
// 웹 lib/genre-color.ts 의 oklch hue 매핑을 그대로 옮긴 브라우저-안전 헬퍼. 순수 표시용이라
// core 추출은 보류하고 여기 인라인한다(장르 추가/조정 시 lib/genre-color.ts 와 함께 갱신).
const GENRE_HUE: Record<string, { h: number; c: number }> = {
  로맨스: { h: 5, c: 0.16 }, 로판: { h: 340, c: 0.16 }, BL: { h: 315, c: 0.15 },
  판타지: { h: 290, c: 0.16 }, 현판: { h: 268, c: 0.15 }, SF: { h: 245, c: 0.15 },
  게임판타지: { h: 222, c: 0.14 }, 미스터리: { h: 205, c: 0.13 }, 스릴러: { h: 195, c: 0.12 },
  공포: { h: 150, c: 0.11 }, 일상: { h: 162, c: 0.12 }, 스포츠: { h: 138, c: 0.16 },
  코미디: { h: 100, c: 0.16 }, 학원: { h: 78, c: 0.15 }, 역사: { h: 62, c: 0.13 },
  드라마: { h: 35, c: 0.13 }, 무협: { h: 22, c: 0.17 }, 액션: { h: 12, c: 0.18 },
};
const FALLBACK_HUE = { h: 70, c: 0.04 };
const hueOf = (g: string) => GENRE_HUE[g] ?? FALLBACK_HUE;
const genreColor = (g: string, l = 0.78) => `oklch(${l} ${hueOf(g).c} ${hueOf(g).h})`;
const genreTint = (g: string, a = 0.16) => `oklch(0.72 ${hueOf(g).c} ${hueOf(g).h} / ${a})`;
const genreBorder = (g: string, a = 0.35) => `oklch(0.72 ${hueOf(g).c} ${hueOf(g).h} / ${a})`;
const spectrumGradient = (genres: readonly string[]) =>
  `linear-gradient(90deg, ${genres
    .map((g, i) => `${genreColor(g, 0.72)} ${Math.round((i / (genres.length - 1)) * 100)}%`)
    .join(', ')})`;

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'popular', label: '인기순' },
  { key: 'rating', label: '평점순' },
  { key: 'trending', label: '급상승' },
  { key: 'newest', label: '최신순' },
];

const TYPE_TABS: { value: '' | Title['type']; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'webtoon', label: TYPE_LABEL.webtoon },
  { value: 'webnovel', label: TYPE_LABEL.webnovel },
];

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

// 데이터에 실제 존재하는 플랫폼만 패싯에 노출(빈 플랫폼 숨김) — 웹 platformCoverage 와 동치.
function presentPlatforms(items: Title[]): PlatformId[] {
  const seen = new Set<PlatformId>();
  for (const t of items) for (const a of t.availability) seen.add(a.platformId);
  return (Object.keys(PLATFORMS) as PlatformId[]).filter((id) => seen.has(id));
}

export function ExplorePage() {
  const [items, setItems] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<TitleFilterState>(EMPTY_TITLE_FILTERS);
  const [sort, setSort] = useState<SortKey>('popular');
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    fetchTitles()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activeFilters = countActiveTitleFilters(filters);
  const heroGenre = filters.genres[0];
  const platformOptions = useMemo(() => presentPlatforms(items), [items]);

  // 토스: 서버 없이 core 의 applyTitleFilters → sortTitles 로 클라이언트 파생(웹과 동일 로직).
  const results = useMemo(
    () => sortTitles(applyTitleFilters(items, filters), sort),
    [items, filters, sort],
  );

  const patch = (p: Partial<TitleFilterState>) => setFilters((prev) => ({ ...prev, ...p }));
  const resetFilters = () => setFilters(EMPTY_TITLE_FILTERS);
  const open = (t: Title) => navigate(`/title/${encodeURIComponent(t.id)}`);

  return (
    <div style={{ minHeight: '100dvh', background: theme.bg }}>
      <Top
        title={<Top.TitleParagraph size={22}>🧭 탐색</Top.TitleParagraph>}
        subtitleBottom={
          <Top.SubtitleParagraph size={15}>
            {heroGenre ? `색을 따라 — ${heroGenre}` : '장르 스펙트럼으로 골라보기'}
          </Top.SubtitleParagraph>
        }
      />

      <div style={pageShell}>
        {/* 장르 스펙트럼 — 그라디언트 바 + 탭 가능한 GENRES 칩 */}
        <div className="rise" style={{ marginBottom: 16 }}>
          <div
            aria-hidden
            style={{ height: 8, borderRadius: 999, background: spectrumGradient(GENRES), marginBottom: 12 }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="장르">
            {GENRES.map((g) => {
              const on = filters.genres.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  className="pressable"
                  onClick={() => patch({ genres: toggle(filters.genres, g) })}
                  aria-pressed={on}
                  style={{
                    height: 32,
                    padding: '0 12px',
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: genreColor(g, on ? 0.92 : 0.82),
                    background: genreTint(g, on ? 0.3 : 0.12),
                    border: `1px solid ${genreBorder(g, on ? 0.7 : 0.26)}`,
                  }}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>

        {/* 유형 토글 + 상세 필터 진입 */}
        <div className="rise" style={{ animationDelay: '50ms', display: 'flex', gap: 8, marginBottom: 12 }}>
          <div
            role="group"
            aria-label="작품 유형"
            style={{ display: 'inline-flex', padding: 2, borderRadius: 12, background: theme.surfaceAlt, border: `1px solid ${theme.border}` }}
          >
            {TYPE_TABS.map((tab) => {
              const on =
                tab.value === '' ? filters.types.length === 0 : filters.types.length === 1 && filters.types[0] === tab.value;
              return (
                <button
                  key={tab.label}
                  type="button"
                  className="pressable"
                  onClick={() => patch({ types: tab.value === '' ? [] : [tab.value] })}
                  aria-pressed={on}
                  style={{
                    height: 32,
                    padding: '0 14px',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    background: on ? theme.accent : 'transparent',
                    color: on ? theme.accentInk : theme.textMuted,
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="pressable"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 36,
              padding: '0 14px',
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              color: activeFilters > 0 ? theme.accent : theme.text,
              background: activeFilters > 0 ? theme.accentSoft : theme.surface,
              border: `1px solid ${activeFilters > 0 ? 'transparent' : theme.border}`,
            }}
          >
            <span aria-hidden>⚙️</span>
            상세 필터
            {activeFilters > 0 && <Badge accent>{activeFilters}</Badge>}
          </button>
        </div>

        {/* 정렬 칩 */}
        <div className="rise chips" style={{ animationDelay: '90ms', marginBottom: 16 }}>
          {SORTS.map((s) => {
            const on = s.key === sort;
            return (
              <button
                key={s.key}
                type="button"
                className="pressable"
                onClick={() => setSort(s.key)}
                aria-pressed={on}
                style={{
                  flexShrink: 0,
                  height: 32,
                  padding: '0 14px',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: on ? 'none' : `1px solid ${theme.border}`,
                  background: on ? theme.accent : 'transparent',
                  color: on ? theme.accentInk : theme.textMuted,
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {/* 결과 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: theme.textMuted }}>
            작품 <strong style={{ color: theme.text }}>{results.length.toLocaleString('ko-KR')}</strong>편
          </span>
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: theme.textMuted }}
            >
              ↺ 필터 초기화
            </button>
          )}
        </div>

        {/* 결과 그리드 / 로딩 / 빈 상태 */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rise" style={{ animationDelay: `${i * 40}ms`, borderRadius: theme.radius, overflow: 'hidden', background: theme.surface, border: `1px solid ${theme.border}` }}>
                <div style={{ height: 140, background: theme.surfaceAlt }} />
                <div style={{ padding: '10px 12px 14px' }}>
                  <div style={{ height: 14, width: '85%', borderRadius: 6, background: theme.surfaceAlt }} />
                  <div style={{ height: 14, width: '55%', borderRadius: 6, marginTop: 8, background: theme.surfaceAlt }} />
                </div>
              </div>
            ))}
          </div>
        ) : results.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {results.map((t, i) => {
              const est = statsAreEstimated(t);
              const rating = t.stats?.ratingAvg;
              return (
                <button
                  key={t.id}
                  type="button"
                  className="pressable rise"
                  onClick={() => open(t)}
                  style={{
                    animationDelay: `${Math.min(i, 8) * 25}ms`,
                    textAlign: 'left',
                    background: theme.surface,
                    border: `1px solid ${theme.border}`,
                    borderRadius: theme.radius,
                    overflow: 'hidden',
                    padding: 0,
                    color: theme.text,
                    cursor: 'pointer',
                  }}
                >
                  <Cover gradient={t.cover} src={coverUrl(t)} alt={t.title} height={140} radius={0} />
                  <div style={{ padding: '10px 12px 12px' }}>
                    <div
                      style={{
                        fontSize: 14.5,
                        fontWeight: 700,
                        lineHeight: 1.35,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        minHeight: '2.7em',
                      }}
                    >
                      {t.title}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      {t.genres?.slice(0, 1).map((g) => (
                        <Badge key={g} accent>
                          {g}
                        </Badge>
                      ))}
                      {rating != null && rating > 0 && (
                        <Badge>
                          ★ {est ? '≈' : ''}
                          {rating.toFixed(1)}
                        </Badge>
                      )}
                    </div>
                    {t.availability[0] && (
                      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 7 }}>
                        {platform(t.availability[0].platformId).name}
                        {t.availability.length > 1 ? ` 외 ${t.availability.length - 1}` : ''}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '48px 16px',
              textAlign: 'center',
              borderRadius: theme.radius,
              border: `1px dashed ${theme.border}`,
              background: theme.surface,
            }}
          >
            <span style={{ fontSize: 30 }} aria-hidden>
              🔍
            </span>
            <p style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>조건에 맞는 작품이 없어요.</p>
            <p style={{ fontSize: 12.5, color: theme.textMuted }}>
              {activeFilters > 0 ? '필터를 조금 넓히거나 초기화해 보세요.' : '다른 장르나 태그로 탐색해 보세요.'}
            </p>
            {activeFilters > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                style={{
                  marginTop: 8,
                  height: 38,
                  padding: '0 16px',
                  borderRadius: 10,
                  border: `1px solid ${theme.border}`,
                  background: theme.surfaceAlt,
                  color: theme.text,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ↺ 필터 초기화
              </button>
            )}
          </div>
        )}
      </div>

      {/* 패싯 바텀시트 — 모바일에서 패널을 접어 올린다 */}
      {sheetOpen && (
        <FacetSheet
          value={filters}
          onChange={setFilters}
          platformOptions={platformOptions}
          activeFilters={activeFilters}
          resultCount={results.length}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}

// ── 패싯 바텀시트 ─────────────────────────────────────────────────
// components/title-filter-panel.tsx 의 facet 집합을 그대로 미러링하되(같은 옵션 단일 소스),
// 모바일에서 화면 하단에서 올라오는 시트로 렌더한다. 토스엔 보관함(saved) 스토어가 없어 그 facet은 제외.
function FacetSheet({
  value,
  onChange,
  platformOptions,
  activeFilters,
  resultCount,
  onClose,
}: {
  value: TitleFilterState;
  onChange: (next: TitleFilterState) => void;
  platformOptions: PlatformId[];
  activeFilters: number;
  resultCount: number;
  onClose: () => void;
}) {
  const patch = (p: Partial<TitleFilterState>) => onChange({ ...value, ...p });

  const chip = (on: boolean): React.CSSProperties => ({
    height: 32,
    padding: '0 12px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    border: `1px solid ${on ? 'transparent' : theme.border}`,
    background: on ? theme.accentSoft : 'transparent',
    color: on ? theme.accent : theme.textMuted,
  });

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="상세 필터"
        onClick={(e) => e.stopPropagation()}
        className="rise"
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '82dvh',
          display: 'flex',
          flexDirection: 'column',
          background: theme.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderTop: `1px solid ${theme.border}`,
          boxShadow: '0 -12px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
          <span aria-hidden style={{ width: 40, height: 4, borderRadius: 999, background: theme.border }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px 8px' }}>
          <strong style={{ fontSize: 17, fontWeight: 800, color: theme.text }}>
            상세 필터{activeFilters > 0 ? ` · ${activeFilters}` : ''}
          </strong>
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => onChange(EMPTY_TITLE_FILTERS)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: theme.textMuted }}
            >
              ↺ 초기화
            </button>
          )}
        </div>

        <div style={{ overflowY: 'auto', padding: '4px 18px 12px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <FacetGroup label="유형">
            {TYPE_OPTIONS.map((o) => (
              <button key={o.value} type="button" style={chip(value.types.includes(o.value))} aria-pressed={value.types.includes(o.value)} onClick={() => patch({ types: toggle(value.types, o.value) })}>
                {o.label}
              </button>
            ))}
          </FacetGroup>

          <FacetGroup label="장르">
            {GENRES.map((g) => (
              <button key={g} type="button" style={chip(value.genres.includes(g))} aria-pressed={value.genres.includes(g)} onClick={() => patch({ genres: toggle(value.genres, g) })}>
                {g}
              </button>
            ))}
          </FacetGroup>

          <FacetGroup label="연재 상태">
            {STATUS_OPTIONS.map((o) => (
              <button key={o.value} type="button" style={chip(value.status.includes(o.value))} aria-pressed={value.status.includes(o.value)} onClick={() => patch({ status: toggle(value.status, o.value) })}>
                {o.label}
              </button>
            ))}
          </FacetGroup>

          {platformOptions.length > 0 && (
            <FacetGroup label="플랫폼">
              {platformOptions.map((id) => {
                const on = value.platforms.includes(id);
                const p = platform(id);
                return (
                  <button key={id} type="button" style={chip(on)} aria-pressed={on} onClick={() => patch({ platforms: toggle(value.platforms, id) })}>
                    <span aria-hidden style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 999, background: p.color, marginRight: 6 }} />
                    {p.short}
                  </button>
                );
              })}
            </FacetGroup>
          )}

          <FacetGroup label="이용가">
            {AGE_OPTIONS.map((o) => (
              <button key={o.value} type="button" style={chip(value.ages.includes(o.value))} aria-pressed={value.ages.includes(o.value)} onClick={() => patch({ ages: toggle(value.ages, o.value) })}>
                {o.label}
              </button>
            ))}
          </FacetGroup>

          <FacetGroup label="가격">
            {PRICING_OPTIONS.map((o) => (
              <button key={o.value} type="button" style={chip(value.pricing.includes(o.value))} aria-pressed={value.pricing.includes(o.value)} onClick={() => patch({ pricing: toggle(value.pricing, o.value) })}>
                {o.label}
              </button>
            ))}
          </FacetGroup>

          <FacetGroup label="최소 평점">
            {MIN_RATING_OPTIONS.map((o) => (
              <button key={o.value} type="button" style={chip(value.minRating === o.value)} aria-pressed={value.minRating === o.value} onClick={() => patch({ minRating: o.value })}>
                {o.label}
              </button>
            ))}
          </FacetGroup>

          <FacetGroup label="연재 시작">
            {YEAR_BUCKETS.map((o) => {
              const on = !!value.yearRange && value.yearRange[0] === o.range[0] && value.yearRange[1] === o.range[1];
              return (
                <button key={o.label} type="button" style={chip(on)} aria-pressed={on} onClick={() => patch({ yearRange: on ? null : o.range })}>
                  {o.label}
                </button>
              );
            })}
          </FacetGroup>

          <FacetGroup label="원작 연결">
            <button type="button" style={chip(value.adaptedOnly)} aria-pressed={value.adaptedOnly} onClick={() => patch({ adaptedOnly: !value.adaptedOnly })}>
              원작·2차창작
            </button>
          </FacetGroup>
        </div>

        <div style={{ padding: '12px 18px calc(16px + env(safe-area-inset-bottom))', borderTop: `1px solid ${theme.border}` }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              minHeight: 52,
              borderRadius: 14,
              border: 'none',
              background: theme.accent,
              color: theme.accentInk,
              fontSize: 16,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {resultCount.toLocaleString('ko-KR')}편 보기
          </button>
        </div>
      </div>
    </div>
  );
}

function FacetGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: theme.textMuted }}>
        {label}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{children}</div>
    </div>
  );
}
