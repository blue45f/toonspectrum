import { useEffect, useState } from 'react';
import { navigate } from '../router';
import { Button } from '@toss/tds-mobile';
import { fetchTitles, getCached, coverUrl, platform, type Title } from '../lib/api';
import { similarTitles, statsAreEstimated, formatCount } from '@toonspectrum/core';
import { shareMessage } from '../lib/toss';
import { Badge, Cover, StatStrip } from '../ui';
import { BannerAd } from '../components/BannerAd';
import { theme } from '../theme';

export function TitleDetailPage({ id = '' }: { id?: string }) {
  // 전체 카탈로그(이미 캐시됨)와 현재 작품을 함께 보관 — similarTitles 는 풀 리스트가 필요하다.
  const [all, setAll] = useState<Title[]>([]);
  const [t, setT] = useState<Title | undefined>(() => getCached(id));
  const [loading, setLoading] = useState(!t);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchTitles()
      .then((list) => {
        if (!alive) return;
        setAll(list);
        setT(getCached(id));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!toast) return;
    const x = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(x);
  }, [toast]);

  const Header = (
    <header style={{ display: 'flex', alignItems: 'center', height: 56, padding: '0 8px',
      paddingTop: 'env(safe-area-inset-top)', position: 'sticky', top: 0, zIndex: 5,
      background: `color-mix(in oklab, ${theme.bg} 84%, transparent)`, backdropFilter: 'blur(12px)' }}>
      <button type="button" aria-label="뒤로" onClick={() => navigate('/')} className="pressable"
        style={{ width: 44, height: 44, background: 'none', border: 'none', color: theme.text, fontSize: 24, cursor: 'pointer' }}>←</button>
    </header>
  );

  if (loading) return <div style={{ background: theme.bg, minHeight: '100dvh' }}>{Header}<p style={{ textAlign: 'center', color: theme.textMuted, paddingTop: 40 }}>불러오는 중…</p></div>;
  if (!t) return <div style={{ background: theme.bg, minHeight: '100dvh' }}>{Header}<p style={{ textAlign: 'center', color: theme.textMuted, paddingTop: 40 }}>작품을 찾을 수 없어요.</p></div>;

  // 정직성 정책: 핵심 지표(별점·평가수·조회)가 추정/합성값이면 ≈·'추정'으로 표기한다.
  const estimated = statsAreEstimated(t);
  const fmtStat = (n: number) => (estimated ? `≈${formatCount(n)}` : formatCount(n));
  const similar = similarTitles(all, t, 8);

  const share = async () => {
    const r = await shareMessage(`[툰스펙트럼] ${t.title}\n${t.synopsis || ''}`.trim());
    if (r === 'clipboard') setToast('클립보드에 복사했어요.');
  };

  const ratingValue =
    t.stats?.ratingAvg != null ? (estimated ? `≈${t.stats.ratingAvg.toFixed(1)}` : t.stats.ratingAvg.toFixed(1)) : null;
  const stats = [
    ratingValue != null ? { label: '평점', value: ratingValue } : null,
    t.stats?.views != null ? { label: '조회', value: fmtStat(t.stats.views) } : null,
    t.status ? { label: '상태', value: t.status === 'completed' ? '완결' : '연재' } : null,
    t.releaseYear ? { label: '연도', value: String(t.releaseYear) } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const openTitle = (target: Title) => navigate(`/title/${encodeURIComponent(target.id)}`);

  return (
    <div style={{ minHeight: '100dvh', background: theme.bg }}>
      {Header}
      <div className="rise" style={{ padding: '0 20px 40px' }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
          <div style={{ width: 124, flexShrink: 0 }}><Cover gradient={t.cover} src={coverUrl(t)} alt={t.title} height={172} /></div>
          <div>
            <h1 style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.3, margin: '2px 0 8px' }}>{t.title}</h1>
            {(t.author || t.artist) && <p style={{ margin: 0, color: theme.textMuted, fontSize: 13 }}>
              {[t.author && `글 ${t.author}`, t.artist && `그림 ${t.artist}`].filter(Boolean).join(' · ')}</p>}
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {t.genres?.slice(0, 3).map((g) => <Badge key={g} accent>{g}</Badge>)}
              {estimated && <Badge>추정</Badge>}
            </div>
          </div>
        </div>

        {stats.length ? <StatStrip stats={stats} /> : null}
        {estimated && stats.length ? (
          <p style={{ margin: '8px 0 0', fontSize: 11.5, color: theme.textMuted, textAlign: 'center' }}>
            ≈ 표시는 공개 데이터를 바탕으로 한 추정치예요.
          </p>
        ) : null}

        {t.synopsis && <p style={{ fontSize: 15, lineHeight: 1.75, color: theme.text, margin: '20px 0 0', maxWidth: '72ch' }}>{t.synopsis}</p>}

        {/* 보러 가기 / 외부 리뷰 — availability[].url 은 플랫폼 딥링크(읽기·평가 진입점). 커뮤니티 리뷰는 웹 전용. */}
        {t.availability?.length ? <div style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>보러 가기 · 외부 리뷰</h2>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: theme.textMuted }}>플랫폼에서 바로 읽고 별점·리뷰를 남길 수 있어요.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {t.availability.map((a, i) => (
              <a key={`${a.platformId}-${i}`} href={a.url} target="_blank" rel="noopener noreferrer" className="pressable"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px',
                  borderRadius: theme.radius, background: theme.surface, border: `1px solid ${theme.border}`, color: theme.text }}>
                <span style={{ fontWeight: 600 }}>{platform(a.platformId).name}</span>
                <span style={{ color: theme.accent, fontSize: 13, fontWeight: 600 }}>{a.pricing || '바로가기'} ›</span>
              </a>
            ))}
          </div>
        </div> : null}

        {/* 비슷한 작품 — recommend.ts 의 similarTitles(장르·태그·어댑테이션 유사도) 결과를 가로 스트립으로. */}
        {similar.length ? <div style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>비슷한 작품</h2>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            {similar.map((s) => (
              <button key={s.id} type="button" onClick={() => openTitle(s)} className="pressable"
                aria-label={`${s.title} 상세 보기`}
                style={{ flexShrink: 0, width: 116, textAlign: 'left', padding: 0, border: 'none',
                  background: 'transparent', color: theme.text, cursor: 'pointer' }}>
                <Cover gradient={s.cover} src={coverUrl(s)} alt={s.title} height={158} radius={12} />
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, marginTop: 8,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.6em' }}>{s.title}</div>
                {s.genres?.[0] && <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 3 }}>{s.genres[0]}</div>}
              </button>
            ))}
          </div>
        </div> : null}

        <div style={{ marginTop: 24 }}>
          <Button style={{ width: '100%' }} onClick={share}>공유하기</Button>
        </div>

        {/* 상세 본문·추천이 끝나는 지점(below-fold)에 광고 — 핵심 액션(공유) 아래 · SSP 정책 준수 */}
        <BannerAd />
      </div>

      {toast && <div role="status" style={{ position: 'fixed', bottom: 'calc(28px + env(safe-area-inset-bottom))', left: '50%',
        transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.82)', color: theme.text, padding: '10px 18px', borderRadius: 999, fontSize: 14 }}>{toast}</div>}
    </div>
  );
}
