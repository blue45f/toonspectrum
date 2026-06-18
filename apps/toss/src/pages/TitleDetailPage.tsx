import { useEffect, useState } from 'react';
import { navigate } from '../router';
import { Button } from '@toss/tds-mobile';
import { fetchTitles, getCached, coverUrl, type Title } from '../lib/api';
import { shareMessage } from '../lib/toss';
import { Badge, Cover, StatStrip } from '../ui';
import { theme } from '../theme';

export function TitleDetailPage({ id = '' }: { id?: string }) {
  const [t, setT] = useState<Title | undefined>(() => getCached(id));
  const [loading, setLoading] = useState(!t);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!t) fetchTitles().then(() => setT(getCached(id))).finally(() => setLoading(false));
  }, [id, t]);

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

  const share = async () => {
    const r = await shareMessage(`[툰스펙트럼] ${t.title}\n${t.synopsis || ''}`.trim());
    if (r === 'clipboard') setToast('클립보드에 복사했어요.');
  };
  const stats = [
    t.stats?.ratingAvg != null ? { label: '평점', value: t.stats.ratingAvg.toFixed(1) } : null,
    t.status ? { label: '상태', value: t.status === 'completed' ? '완결' : '연재' } : null,
    t.releaseYear ? { label: '연도', value: String(t.releaseYear) } : null,
  ].filter(Boolean) as { label: string; value: string }[];

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
            </div>
          </div>
        </div>

        {stats.length ? <StatStrip stats={stats} /> : null}

        {t.synopsis && <p style={{ fontSize: 15, lineHeight: 1.75, color: theme.text, margin: '20px 0 0', maxWidth: '72ch' }}>{t.synopsis}</p>}

        {t.availability?.length ? <div style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>보러 가기</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {t.availability.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="pressable"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px',
                  borderRadius: theme.radius, background: theme.surface, border: `1px solid ${theme.border}`, textTransform: 'capitalize' }}>
                <span style={{ fontWeight: 600 }}>{a.platformId}</span>
                <span style={{ color: theme.accent, fontSize: 13, fontWeight: 600 }}>{a.pricing || '바로가기'} ›</span>
              </a>
            ))}
          </div>
        </div> : null}

        <div style={{ marginTop: 22 }}>
          <Button style={{ width: '100%' }} onClick={share}>공유하기</Button>
        </div>
      </div>

      {toast && <div role="status" style={{ position: 'fixed', bottom: 'calc(28px + env(safe-area-inset-bottom))', left: '50%',
        transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.82)', color: theme.text, padding: '10px 18px', borderRadius: 999, fontSize: 14 }}>{toast}</div>}
    </div>
  );
}
