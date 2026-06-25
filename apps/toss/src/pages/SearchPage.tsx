// 검색 (/search) — Top 바 어포던스로 진입하는 통합 검색. 웹의 SearchPage + command-palette(인스턴트
// 자동완성)를 미러링하되, 로직은 전부 @toonspectrum/core 에서 가져오고(검색/필터/정렬/추정 판정 재구현
// 금지) TDS UI 프리미티브(SearchBar·Chips·Cover·Badge·Top)로만 렌더한다.
//
// 웹 팔레트는 키 입력마다 /api/search 네트워크를 치지만, 토스는 fetchTitles() 로 받아 캐시한 전체
// 목록(메모리) 위에서 suggest()/searchTitles() 로 클라이언트 검색한다 → 키 입력당 네트워크 없음.
// (AGENTS.md 의 useDeferredValue/네트워크 주석은 풀 리스트가 메모리에 있는 여기선 해당 없음.)
import { useEffect, useMemo, useState } from 'react';
import {
  searchTitles,
  suggest,
  topGenres,
  statsAreEstimated,
  platform,
  type Title,
  type SearchFilters,
  type SortKey,
  type PlatformId,
} from '@toonspectrum/core';
import { Top } from '@toss/tds-mobile';
import { fetchTitles, coverUrl } from '../lib/api';
import { SearchBar, Chips, Badge, Cover } from '../ui';
import { theme, pageShell } from '../theme';
import { navigate } from '../router';

// 웹 SearchExplorer 의 SORTS 와 동일한 라벨/순서(단일 소스). value 는 core 의 SortKey.
const SORTS: { value: SortKey; label: string }[] = [
  { value: 'relevance', label: '관련도' },
  { value: 'rating', label: '평점순' },
  { value: 'popular', label: '인기순' },
  { value: 'trending', label: '급상승순' },
  { value: 'bookmarks', label: '관심순' },
  { value: 'completion', label: '완독률순' },
  { value: 'newest', label: '최신순' },
  { value: 'title', label: '가나다순' },
];
const SORT_LABELS = SORTS.map((s) => s.label);
const sortKeyOf = (label: string): SortKey => SORTS.find((s) => s.label === label)?.value ?? 'relevance';

const ALL = '전체';
const FREE = '무료·기다무';

export function SearchPage() {
  const [items, setItems] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [genre, setGenre] = useState(ALL);
  const [freeOnly, setFreeOnly] = useState(false);
  const [sortLabel, setSortLabel] = useState(SORTS[0].label); // 관련도
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    fetchTitles()
      .then(setItems)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '불러오지 못했어요.'))
      .finally(() => setLoading(false));
  }, []);

  const query = q.trim();

  // 데이터에서 상위 장르를 도출 — core.topGenres 단일 소스. 칩 = [전체, 무료·기다무, ...장르]
  const genres = useMemo(() => [ALL, FREE, ...topGenres(items, { limit: 8 })], [items]);

  // 칩은 "무료" 토글 + 단일 장르를 한 줄에 섞어 보여준다(active 표시는 합성).
  const activeChip = freeOnly ? FREE : genre;
  const onPickChip = (c: string) => {
    if (c === FREE) {
      setFreeOnly((v) => !v);
    } else {
      setGenre(c);
      if (c === ALL) setFreeOnly(false);
    }
  };

  const filters: SearchFilters = useMemo(
    () => ({
      q: query || undefined,
      genres: genre !== ALL ? [genre] : undefined,
      freeOnly: freeOnly || undefined,
    }),
    [query, genre, freeOnly],
  );

  // 인스턴트 자동완성(상위 6) — 입력 중 + 포커스 시에만. core.suggest() 그대로.
  const suggestions = useMemo(
    () => (query && focused ? suggest(items, query, 6) : []),
    [items, query, focused],
  );

  // 전체 결과 — core.searchTitles() 가 필터+검색+정렬을 모두 담당. 재구현 없음.
  const results = useMemo(
    () => searchTitles(items, filters, sortKeyOf(sortLabel)),
    [items, filters, sortLabel],
  );

  const open = (t: Title) => navigate(`/title/${encodeURIComponent(t.id)}`);
  const platformNames = (t: Title) =>
    [...new Set(t.availability.map((a) => platform(a.platformId as PlatformId).name))].slice(0, 2);

  const hasFilter = Boolean(query) || genre !== ALL || freeOnly;

  return (
    <div style={{ minHeight: '100dvh', background: theme.bg }}>
      <Top title={<Top.TitleParagraph size={22}>🔍 검색</Top.TitleParagraph>} />
      <div style={pageShell}>
        {/* 검색 입력 + 인스턴트 자동완성 드롭다운 */}
        <div className="rise" style={{ position: 'relative', marginBottom: 12, zIndex: 5 }}>
          <SearchBar value={q} onChange={setQ} placeholder="작품·작가·장르 검색" />
          {focused && q && suggestions.length > 0 && (
            <ul
              role="listbox"
              aria-label="검색 추천"
              style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, margin: 0, padding: 6,
                listStyle: 'none', background: theme.surface, border: `1px solid ${theme.border}`,
                borderRadius: 14, boxShadow: '0 12px 32px rgba(0,0,0,0.45)', maxHeight: '52vh', overflowY: 'auto',
              }}
            >
              {suggestions.map((t) => (
                <li key={t.id} role="option" aria-selected={false}>
                  {/* onMouseDown: blur 로 드롭다운이 닫히기 전에 네비게이션을 잡는다 */}
                  <button
                    type="button"
                    className="pressable"
                    onMouseDown={(e) => { e.preventDefault(); open(t); }}
                    style={{
                      display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left',
                      padding: 8, border: 'none', background: 'transparent', color: theme.text,
                      borderRadius: 10, cursor: 'pointer',
                    }}
                  >
                    <div style={{ width: 36, flexShrink: 0 }}>
                      <Cover gradient={t.cover} src={coverUrl(t)} alt="" height={48} radius={8} />
                    </div>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 700, lineHeight: 1.3,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                      <span style={{ display: 'block', fontSize: 12, color: theme.textMuted, marginTop: 2,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {[t.genres?.[0], t.author].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* 포커스 추적: input 의 focus/blur 를 캡처(자식 input 이라 컨테이너에서 위임) */}
          <span
            onFocusCapture={() => setFocused(true)}
            onBlurCapture={() => setFocused(false)}
            aria-hidden
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          />
        </div>

        {/* 장르 + 무료 토글 칩 */}
        {genres.length > 2 && (
          <div className="rise" style={{ animationDelay: '60ms', marginBottom: 10 }}>
            <Chips items={genres} active={activeChip} onPick={onPickChip} />
          </div>
        )}

        {/* 정렬 칩 */}
        <div className="rise" style={{ animationDelay: '90ms', marginBottom: 16 }}>
          <Chips items={SORT_LABELS} active={sortLabel} onPick={setSortLabel} />
        </div>

        {loading && (
          <p role="status" aria-live="polite" style={{ textAlign: 'center', color: theme.textMuted, padding: '40px 0' }}>
            색인 불러오는 중…
          </p>
        )}
        {error && <p role="alert" style={{ textAlign: 'center', color: theme.danger, padding: '24px 0' }}>{error}</p>}

        {!loading && !error && (
          <>
            <div role="status" aria-live="polite" style={{ fontSize: 13, color: theme.textMuted, marginBottom: 12 }}>
              {hasFilter
                ? <>‘{query || (freeOnly ? FREE : genre)}’ <strong style={{ color: theme.text }}>{results.length}</strong>편 ≈추정 포함</>
                : <>전체 <strong style={{ color: theme.text }}>{items.length}</strong>편 색인 · 검색어를 입력해 보세요</>}
            </div>

            {results.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {results.map((t, i) => {
                  const est = statsAreEstimated(t);
                  const names = platformNames(t);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => open(t)}
                      className="pressable rise"
                      aria-label={`${t.title}${est ? ' (추정 데이터)' : ''}`}
                      style={{
                        animationDelay: `${Math.min(i, 12) * 25}ms`, textAlign: 'left', background: theme.surface,
                        border: `1px solid ${theme.border}`, borderRadius: theme.radius, overflow: 'hidden',
                        padding: 0, color: theme.text, cursor: 'pointer',
                      }}
                    >
                      <Cover gradient={t.cover} src={coverUrl(t)} alt={t.title} height={140} radius={0} />
                      <div style={{ padding: '10px 12px 12px' }}>
                        <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.35, display: '-webkit-box',
                          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.7em' }}>
                          {t.title}
                        </div>
                        {names.length > 0 && (
                          <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 4, whiteSpace: 'nowrap',
                            overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {names.join(' · ')}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                          {t.genres?.slice(0, 1).map((g) => <Badge key={g} accent>{g}</Badge>)}
                          {t.stats?.ratingAvg != null && (
                            <Badge>{est ? '≈' : '★'} {t.stats.ratingAvg.toFixed(1)}</Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: theme.textMuted, padding: '48px 0' }}>
                {hasFilter ? <>‘{query || (freeOnly ? FREE : genre)}’ 결과가 없어요.</> : '검색어를 입력하거나 칩으로 좁혀 보세요.'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
