import { navigate } from '../router';
import { theme, pageShell } from '../theme';
import { Top } from '../tds-shim';

const GAMES = [
  { id: 'duel', emoji: '📈', label: '웹툰 인기 대결', tag: '둘 중 더 인기 있는 웹툰 맞히기', hue: '#ff8a5b' },
  { id: 'quiz', emoji: '❓', label: '웹툰 퀴즈', tag: '작가·장르 힌트로 제목 맞히기', hue: '#5bb0ff' },
  { id: 'roulette', emoji: '🎰', label: '웹툰 룰렛', tag: '돌려서 오늘의 추천 받기', hue: '#e07bff' },
  { id: 'memory', emoji: '🃏', label: '웹툰 짝맞추기', tag: '같은 표지 6쌍을 기억해서 맞히기', hue: '#6be4a6' },
  { id: 'rps', emoji: '✊', label: '웹툰 가위바위보', tag: '웹툰봇과 가위바위보·묵찌빠', hue: '#6be4a6' },
];

export function PlayHubPage() {
  return (
    <div style={pageShell}>
      <Top
        title={<Top.TitleParagraph>🎮 놀이터</Top.TitleParagraph>}
        subtitleBottom={<Top.SubtitleParagraph>웹툰으로 즐기는 미니게임</Top.SubtitleParagraph>}
      />

      {/* 오늘의 운세 배너 — 운세 페이지(/fortune) 진입점 */}
      <button
        type="button"
        className="pressable"
        onClick={() => navigate('/fortune')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          width: '100%',
          padding: 16,
          marginTop: 8,
          borderRadius: 18,
          border: `1px solid ${theme.border}`,
          background: 'linear-gradient(135deg, rgba(240,168,104,0.22), rgba(224,123,255,0.18))',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 30 }}>🔮</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontSize: 16, fontWeight: 800, color: theme.text }}>오늘의 운세</span>
          <span style={{ display: 'block', fontSize: 13, color: theme.textMuted, marginTop: 3 }}>
            오늘·사주·궁합·타로·별자리 운세 보기
          </span>
        </span>
        <span style={{ color: theme.accent, fontSize: 18 }}>›</span>
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            className="pressable"
            onClick={() => navigate(`/play/${g.id}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: 16,
              borderRadius: 18,
              border: `1px solid ${theme.border}`,
              background: theme.surface,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 48,
                height: 48,
                borderRadius: 14,
                fontSize: 24,
                background: `linear-gradient(140deg, ${g.hue}, ${theme.surfaceAlt})`,
              }}
            >
              {g.emoji}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 16, fontWeight: 800, color: theme.text }}>{g.label}</span>
              <span style={{ display: 'block', fontSize: 13, color: theme.textMuted, marginTop: 3 }}>{g.tag}</span>
            </span>
          </button>
        ))}
      </div>
      <p style={{ fontSize: 11, lineHeight: 1.6, color: theme.textMuted, marginTop: 22 }}>
        게임은 공개 카탈로그 메타데이터(제목·작가·지표)만 사용하며, 카드는 표지 저작물이 아니라 작품별 색상으로 표현됩니다.
        일부 지표는 추정값(≈)입니다.
      </p>
    </div>
  );
}
