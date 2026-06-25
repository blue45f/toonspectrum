// 홈(/) — 웹 src/domains/catalog/HomePage.tsx 의 섹션 로직(스포트라이트 + 랭킹 스트립)을
// 토스 TDS 렌더로 미러링한다. GUIDING PRINCIPLE: 검색·정렬·랭킹·장르 유도는 전부
// @toonspectrum/core 에서 가져오고(searchTitles/rankBy/GENRES/statsAreEstimated), 이 파일에는
// 중복 로직을 두지 않는다. 데이터 정직성: 추정 지표는 '≈/추정' 표식, 플랫폼은 platform(id).name.
import { useEffect, useMemo, useState } from 'react';
import { Top } from '@toss/tds-mobile';
import {
  searchTitles,
  rankBy,
  GENRES,
  statsAreEstimated,
  formatCount,
  platform,
} from '@toonspectrum/core';
import { navigate } from '../router';
import { fetchTitles, coverUrl, type Title } from '../lib/api';
import { SearchBar, Chips, Badge, Cover } from '../ui';
import { theme, pageShell } from '../theme';

const ALL = '전체';
const TOP_STRIP = 8; // 인기 스트립 상위 N (스포트라이트 1 + 그리드)

const open = (t: Title) => navigate(`/title/${encodeURIComponent(t.id)}`);

// 작가/그림 라인 — 글·그림이 같으면 한 번만.
function byline(t: Title): string {
  return [t.author, t.artist].filter((v, i, a) => v && a.indexOf(v) === i).join(' · ');
}

// 평점 표식 — 추정 지표면 '≈'로 정직하게(estimate.ts statsAreEstimated 단일 출처).
function ratingLabel(t: Title): string | null {
  if (!(t.stats?.ratingAvg > 0)) return null;
  return `${statsAreEstimated(t) ? '≈' : '★'} ${t.stats.ratingAvg.toFixed(1)}`;
}

// 대표 플랫폼명 — 원본 id가 아니라 platform(id).name(한글 정식 명칭)으로.
function primaryPlatform(t: Title): string | null {
  const id = t.availability?.[0]?.platformId;
  return id ? platform(id).name : null;
}

export function TitleListPage() {
  const [items, setItems] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState(ALL);

  useEffect(() => {
    fetchTitles()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : '불러오기에 실패했어요.'))
      .finally(() => setLoading(false));
  }, []);

  // 장르 칩 — 임시 Map 카운트가 아니라 core GENRES(통합 택소노미) ∩ 카탈로그 실제 보유 장르.
  const genres = useMemo(() => {
    const present = new Set<string>();
    for (const t of items) for (const g of t.genres ?? []) present.add(g);
    return [ALL, ...GENRES.filter((g) => present.has(g))];
  }, [items]);

  const searching = q.trim().length > 0;
  const genreFiltered = genre !== ALL;

  // 검색/장르 모드 — core searchTitles 로 필터+점수정렬(인라인 lowercase substring 제거).
  const results = useMemo(
    () =>
      searchTitles(
        items,
        { q: q.trim() || undefined, genres: genreFiltered ? [genre] : undefined },
        'relevance'
      ),
    [items, q, genre, genreFiltered]
  );

  // 홈 기본 뷰 — core rankBy('popular') 가 스포트라이트(#1) + 인기 스트립을 구동(filtered[0] 대체).
  const popular = useMemo(() => rankBy(items, 'popular', { limit: TOP_STRIP }), [items]);
  const browsing = !searching && !genreFiltered; // 검색·장르 없을 때만 스포트라이트 노출
  const spotlight = browsing ? popular[0]?.title : undefined;
  const strip = browsing ? popular.slice(1).map((r) => r.title) : results;
  const total = items.length;

  return (
    <div style={{ minHeight: '100dvh', background: theme.bg }}>
      <Top
        title={<Top.TitleParagraph size={22}>📚 툰스펙트럼</Top.TitleParagraph>}
        subtitleBottom={
          <Top.SubtitleParagraph size={15}>흩어진 이야기를, 한 권의 색인으로</Top.SubtitleParagraph>
        }
      />
      <div style={pageShell}>
        <div className="rise" style={{ marginBottom: 12 }}>
          <SearchBar value={q} onChange={setQ} placeholder="작품·작가·장르 검색" />
        </div>
        {genres.length > 1 && (
          <div className="rise" style={{ animationDelay: '60ms', marginBottom: 18 }}>
            <Chips items={genres} active={genre} onPick={setGenre} />
          </div>
        )}

        {loading && (
          <p style={{ textAlign: 'center', color: theme.textMuted, padding: '40px 0' }} role="status">
            불러오는 중…
          </p>
        )}
        {error && (
          <p style={{ textAlign: 'center', color: theme.danger, padding: '24px 0' }} role="alert">
            {error}
          </p>
        )}

        {!loading && !error && total > 0 && (
          <p
            style={{ fontSize: 12.5, color: theme.textMuted, margin: '0 0 14px', textAlign: 'right' }}
          >
            {browsing
              ? `${formatCount(total)}편 색인 · 실시간 인기순`
              : `검색 결과 ${formatCount(strip.length)}편`}
          </p>
        )}

        {/* 스포트라이트 — rankBy('popular') #1. featured 대신 '왜 #1인가'가 산식으로 설명되는 작품. */}
        {spotlight && (
          <button
            type="button"
            onClick={() => open(spotlight)}
            className="pressable rise"
            aria-label={`추천 ${spotlight.title} 자세히 보기`}
            style={{
              animationDelay: '90ms',
              width: '100%',
              textAlign: 'left',
              marginBottom: 18,
              padding: 0,
              border: 'none',
              borderRadius: theme.radius + 2,
              overflow: 'hidden',
              background: theme.surface,
              color: theme.text,
              cursor: 'pointer',
            }}
          >
            <Cover
              gradient={spotlight.cover}
              src={coverUrl(spotlight)}
              alt={spotlight.title}
              height={188}
              radius={0}
            />
            <div style={{ padding: '14px 16px 16px' }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                <Badge accent>실시간 인기 1위</Badge>
                {spotlight.genres?.slice(0, 2).map((g) => <Badge key={g}>{g}</Badge>)}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.35 }}>{spotlight.title}</div>
              {byline(spotlight) && (
                <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 4 }}>
                  {byline(spotlight)}
                </div>
              )}
              <div
                style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', fontSize: 12.5, color: theme.textMuted }}
              >
                {primaryPlatform(spotlight) && <span>{primaryPlatform(spotlight)}</span>}
                {ratingLabel(spotlight) && <span>{ratingLabel(spotlight)}</span>}
              </div>
            </div>
          </button>
        )}

        {strip.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {strip.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => open(t)}
                className="pressable rise"
                aria-label={`${t.title} 자세히 보기`}
                style={{
                  animationDelay: `${110 + i * 25}ms`,
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
                    {ratingLabel(t) && <Badge>{ratingLabel(t)}</Badge>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          !loading &&
          !error &&
          total > 0 && (
            <p style={{ textAlign: 'center', color: theme.textMuted, padding: '40px 0' }}>
              ‘{q.trim() || genre}’ 결과가 없어요.
            </p>
          )
        )}
      </div>
    </div>
  );
}
