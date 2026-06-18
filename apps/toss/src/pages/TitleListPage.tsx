import { useEffect, useMemo, useState } from 'react';
import { navigate } from '../router';
import { Top } from '@toss/tds-mobile';
import { fetchTitles, coverUrl, type Title } from '../lib/api';
import { SearchBar, Chips, Badge, Cover } from '../ui';
import { theme, pageShell } from '../theme';

const ALL = '전체';

export function TitleListPage() {
  const [items, setItems] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState(ALL);

  useEffect(() => {
    fetchTitles().then(setItems).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const genres = useMemo(() => {
    const c = new Map<string, number>();
    for (const t of items) for (const g of t.genres || []) c.set(g, (c.get(g) || 0) + 1);
    return [ALL, ...[...c.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([g]) => g).slice(0, 7)];
  }, [items]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter((t) => {
      const okG = genre === ALL || (t.genres || []).includes(genre);
      const okQ = !query || [t.title, t.author, t.artist, t.synopsis, ...(t.genres || [])].filter(Boolean).join(' ').toLowerCase().includes(query);
      return okG && okQ;
    });
  }, [items, q, genre]);

  const featured = !q && genre === ALL ? filtered[0] : undefined;
  const rest = featured ? filtered.slice(1) : filtered;
  const open = (t: Title) => navigate(`/title/${encodeURIComponent(t.id)}`);

  return (
    <div style={{ minHeight: '100dvh', background: theme.bg }}>
      <Top title={<Top.TitleParagraph size={22}>📚 툰스펙트럼</Top.TitleParagraph>}
        subtitleBottom={<Top.SubtitleParagraph size={15}>흩어진 이야기를, 한 권의 색인으로</Top.SubtitleParagraph>} />
      <div style={pageShell}>
        <div className="rise" style={{ marginBottom: 12 }}><SearchBar value={q} onChange={setQ} placeholder="작품·작가·장르 검색" /></div>
        {genres.length > 1 && <div className="rise" style={{ animationDelay: '60ms', marginBottom: 18 }}><Chips items={genres} active={genre} onPick={setGenre} /></div>}

        {loading && <p style={{ textAlign: 'center', color: theme.textMuted, padding: '40px 0' }}>불러오는 중…</p>}
        {error && <p style={{ textAlign: 'center', color: theme.danger, padding: '24px 0' }}>{error}</p>}

        {featured && (
          <button type="button" onClick={() => open(featured)} className="pressable rise"
            style={{ animationDelay: '90ms', width: '100%', textAlign: 'left', marginBottom: 18, padding: 0, border: 'none',
              borderRadius: theme.radius + 2, overflow: 'hidden', background: theme.surface, color: theme.text, cursor: 'pointer' }}>
            <Cover gradient={featured.cover} src={coverUrl(featured)} alt={featured.title} height={188} radius={0} />
            <div style={{ padding: '14px 16px 16px' }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                <Badge accent>추천</Badge>{featured.genres?.slice(0, 2).map((g) => <Badge key={g}>{g}</Badge>)}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.35 }}>{featured.title}</div>
              {(featured.author || featured.artist) && <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 4 }}>
                {[featured.author, featured.artist].filter(Boolean).join(' · ')}</div>}
            </div>
          </button>
        )}

        {rest.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {rest.map((t, i) => (
              <button key={t.id} type="button" onClick={() => open(t)} className="pressable rise"
                style={{ animationDelay: `${110 + i * 25}ms`, textAlign: 'left', background: theme.surface,
                  border: `1px solid ${theme.border}`, borderRadius: theme.radius, overflow: 'hidden', padding: 0, color: theme.text, cursor: 'pointer' }}>
                <Cover gradient={t.cover} src={coverUrl(t)} alt={t.title} height={140} radius={0} />
                <div style={{ padding: '10px 12px 12px' }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.7em' }}>{t.title}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {t.genres?.slice(0, 1).map((g) => <Badge key={g} accent>{g}</Badge>)}
                    {t.stats?.ratingAvg != null && <Badge>★ {t.stats.ratingAvg.toFixed(1)}</Badge>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (!loading && !error && <p style={{ textAlign: 'center', color: theme.textMuted, padding: '40px 0' }}>‘{q || genre}’ 결과가 없어요.</p>)}
      </div>
    </div>
  );
}
