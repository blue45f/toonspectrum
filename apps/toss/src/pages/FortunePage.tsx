// 운세 — 오늘·사주·궁합·타로·처방·별자리 6탭.
//
// 모든 계산 로직은 @toonspectrum/core/fortune(순수, async)을 그대로 공유한다(명리·타로·별자리·
// 오늘의 운세·독서 처방 + 웹툰 콘티 parsePanels). 이 파일은 토스 렌더 레이어일 뿐 — 엔진을
// 재구현하지 않는다(no-dup 원칙). 프로필/스트릭/보관함 영속은 lib/fortune.ts(localStorage).
//
// partial 인 이유 2가지:
//  (1) 프로덕션 vercel.json 은 /api 에 Allow-Methods: GET,OPTIONS 만 허용 → 웹의 POST
//      /api/fortune/* 는 토스 WebView 교차출처에서 CORS 차단. 그래서 서버 호출 대신 코어 엔진을
//      클라이언트에서 직접 가동한다(LLM generateText 콜백 미주입 → 결정적 폴백 콘티 사용).
//  (2) 모션코믹 TTS 낭독(유나 보이스)은 Web Speech 종속이라 제외. 컷(WebtoonStrip)·말풍선·결과
//      카드는 정적으로 그대로 렌더한다.

import { useEffect, useState } from 'react';

import { BannerAd } from '../components/BannerAd';
import { Badge } from '../ui';
import { theme, pageShell } from '../theme';
import { Top, Button } from '../tds-shim';
import { coverUrl, fetchTitles, type Title } from '../lib/api';
import { shareMessage } from '../lib/toss';
import {
  CHARACTERS,
  drawCompatibility,
  drawPrescription,
  drawSaju,
  drawTarot,
  drawTodayFortune,
  drawZodiac,
  type FortuneCharacter,
  type FortunePanel,
  type FortunePanelLine,
} from '@toonspectrum/core';
import {
  addHistory,
  clearHistory,
  getProfile,
  recordVisit,
  removeHistory,
  setProfile,
  useHistory,
  useProfile,
  useStreak,
  type FortuneGender,
} from '../lib/fortune';

const SHARE_URL = 'https://toonspectrum.vercel.app';

type TabId = 'today' | 'saju' | 'compat' | 'tarot' | 'prescription' | 'zodiac';
const TABS: { id: TabId; label: string; emoji: string }[] = [
  { id: 'today', label: '오늘', emoji: '🔮' },
  { id: 'saju', label: '사주', emoji: '📜' },
  { id: 'compat', label: '궁합', emoji: '💞' },
  { id: 'tarot', label: '타로', emoji: '🃏' },
  { id: 'prescription', label: '처방', emoji: '💊' },
  { id: 'zodiac', label: '별자리', emoji: '✨' },
];

const TAB_TITLE_KO: Record<TabId, string> = {
  today: '오늘의 운세',
  saju: '사주팔자',
  compat: '인연 궁합',
  tarot: '타로 리딩',
  prescription: '독서 처방',
  zodiac: '별자리 운세',
};

// 코어 draw* 의 반환은 탭마다 다르므로(공통 키 character/panels/recommendations 외), 결과 타입은
// 6개 반환 타입의 유니온으로 두고 렌더는 각 분기에서 in/속성 가드로 좁힌다. 캐릭터 아바타는
// 코어가 상대경로(/images/...)라 API_BASE 로 절대화한다.
type TodayResult = Awaited<ReturnType<typeof drawTodayFortune<Title>>>;
type SajuDraw = Awaited<ReturnType<typeof drawSaju<Title>>>;
type CompatResult = Awaited<ReturnType<typeof drawCompatibility<Title>>>;
type TarotResult = Awaited<ReturnType<typeof drawTarot<Title>>>;
type ZodiacResult = Awaited<ReturnType<typeof drawZodiac<Title>>>;
type PrescriptionResult = Awaited<ReturnType<typeof drawPrescription<Title>>>;
type DrawResult = TodayResult | SajuDraw | CompatResult | TarotResult | ZodiacResult | PrescriptionResult;

// 사주 8자/오행 표시용 내부 사주 계산 타입(draw* 의 saju 필드).
type SajuChart = SajuDraw['saju'];

const ELEMENT_KO: Record<string, string> = {
  wood: '목(木)',
  fire: '화(火)',
  earth: '토(土)',
  metal: '금(金)',
  water: '수(水)',
};
const ELEMENT_DOT: Record<string, string> = {
  목: '#34d399',
  화: '#f87171',
  토: '#d97706',
  금: '#cbd5e1',
  수: '#38bdf8',
};

/* ── 공용 작은 UI ─────────────────────────────────────────────────────────── */

function avatarSrc(url: string): string {
  if (!url) return '';
  if (/^https?:/i.test(url)) return url;
  const base = (import.meta.env.VITE_API_BASE_URL || SHARE_URL).replace(/\/+$/, '');
  return `${base}${url}`;
}

function Avatar({ char, size = 44 }: { char: FortuneCharacter; size?: number }) {
  const [broke, setBroke] = useState(false);
  const src = avatarSrc(char.avatarUrl);
  if (!src || broke) {
    return (
      <div
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          background: theme.accentSoft,
          color: theme.accent,
          fontWeight: 900,
          fontSize: size * 0.42,
        }}
      >
        {char.name.replace(/^\S+\s/, '')[0] ?? char.name[0]}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBroke(true)}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
    />
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        color: theme.accent,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function DateField({
  id,
  label,
  type,
  value,
  onChange,
}: {
  id: string;
  label: string;
  type: 'date' | 'time';
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label htmlFor={id} style={{ display: 'block', fontSize: 12, color: theme.textMuted }}>
      {label}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // .field 는 검색용 좌측 패딩(40px)이 있어 날짜/시간엔 부적합 → 직접 스타일.
        style={{
          width: '100%',
          height: 44,
          marginTop: 4,
          padding: '0 12px',
          borderRadius: 12,
          border: `1px solid ${theme.border}`,
          background: theme.surfaceAlt,
          color: theme.text,
          fontSize: 15,
        }}
      />
    </label>
  );
}

function GenderPicker({ value, onChange }: { value: FortuneGender; onChange: (g: FortuneGender) => void }) {
  return (
    <div role="group" aria-label="성별" style={{ display: 'flex', gap: 8 }}>
      {(['none', 'female', 'male'] as const).map((g) => {
        const on = value === g;
        return (
          <button
            key={g}
            type="button"
            className="pressable"
            onClick={() => onChange(g)}
            aria-pressed={on}
            style={{
              flex: 1,
              height: 38,
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              border: on ? 'none' : `1px solid ${theme.border}`,
              background: on ? theme.accent : 'transparent',
              color: on ? theme.accentInk : theme.textMuted,
            }}
          >
            {g === 'none' ? '비공개' : g === 'female' ? '여성' : '남성'}
          </button>
        );
      })}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="pressable"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        height: 50,
        marginTop: 14,
        borderRadius: 14,
        border: 'none',
        background: disabled ? theme.surfaceAlt : theme.accent,
        color: disabled ? theme.textMuted : theme.accentInk,
        fontSize: 15,
        fontWeight: 800,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function ScoreRing({ score }: { score: number }) {
  return (
    <div style={{ textAlign: 'center', padding: '6px 0' }}>
      <div style={{ fontSize: 12, color: theme.textMuted, letterSpacing: 1 }}>FORTUNE SCORE</div>
      <div style={{ fontSize: 52, fontWeight: 900, color: theme.accent, lineHeight: 1.1 }}>{score}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>
        {score >= 90 ? '★ 최고의 하루 ★' : score >= 80 ? '☆ 맑음 & 평온 ☆' : '무난하고 조심스러운 하루'}
      </div>
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: theme.text, fontWeight: 600 }}>{label}</span>
        <span style={{ color: theme.textMuted, fontWeight: 700 }}>{value}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: theme.surfaceAlt, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, value)}%`, background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
}

/* ── 정적 웹툰 컷(말풍선) — Web Speech 재생/낭독 제외, 컷·대사·효과음만 렌더 ──────── */

function resolveSpeaker(line: FortunePanelLine, fallback: FortuneCharacter): FortuneCharacter {
  if (line.characterId) {
    const byId = CHARACTERS.find((c) => c.id === line.characterId);
    if (byId) return byId;
  }
  const spk = line.speaker.trim();
  if (spk) {
    const short = (c: FortuneCharacter) => c.name.split(' ').pop() ?? c.name;
    const hit = CHARACTERS.find((c) => spk.includes(short(c)));
    if (hit) return hit;
  }
  return fallback;
}

function WebtoonCut({ panel, index, speaker }: { panel: FortunePanel; index: number; speaker: FortuneCharacter }) {
  const sfxList = panel.lines.filter((l) => l.sfx).map((l) => l.sfx!);
  let dialogueSide = 0;
  return (
    <article
      style={{
        position: 'relative',
        borderRadius: 18,
        border: `2px solid ${theme.border}`,
        background: 'linear-gradient(155deg, #2a2018 0%, #1d160f 100%)',
        padding: 14,
        overflow: 'hidden',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          right: 10,
          top: 10,
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: 1.5,
          padding: '2px 6px',
          borderRadius: 6,
          background: 'rgba(0,0,0,0.45)',
          color: theme.accent,
        }}
      >
        CUT {index + 1}
      </span>

      {sfxList.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: panel.scene || panel.lines.some((l) => l.text) ? 8 : 0 }}>
          {sfxList.map((sfx, i) => (
            <span
              key={i}
              aria-hidden
              style={{
                fontSize: 18,
                fontWeight: 900,
                fontStyle: 'italic',
                color: theme.accent,
                textShadow: '1px 1px 0 rgba(0,0,0,0.5)',
              }}
            >
              {sfx}
            </span>
          ))}
        </div>
      )}

      {panel.scene && (
        <div
          style={{
            display: 'inline-block',
            maxWidth: '100%',
            marginBottom: 10,
            padding: '6px 10px',
            borderRadius: 8,
            background: 'rgba(245,237,227,0.92)',
            color: '#2a2018',
            fontSize: 12.5,
            fontStyle: 'italic',
            fontWeight: 600,
            lineHeight: 1.4,
          }}
        >
          {panel.scene}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {panel.lines.map((line, i) => {
          if (!line.text) return null;
          if (!line.speaker) {
            return (
              <div
                key={i}
                style={{
                  margin: '0 auto',
                  maxWidth: '94%',
                  padding: '8px 14px',
                  borderRadius: 10,
                  textAlign: 'center',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px dashed rgba(255,255,255,0.18)',
                  color: theme.text,
                  fontSize: 13.5,
                  lineHeight: 1.5,
                }}
              >
                {line.text}
              </div>
            );
          }
          const who = resolveSpeaker(line, speaker);
          const onLeft = dialogueSide++ % 2 === 0;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-end',
                flexDirection: onLeft ? 'row' : 'row-reverse',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                <Avatar char={who} size={48} />
                <span
                  style={{
                    maxWidth: 64,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 10,
                    fontWeight: 800,
                    color: theme.accent,
                  }}
                >
                  {line.speaker}
                </span>
              </div>
              <div
                style={{
                  maxWidth: '78%',
                  padding: '10px 14px',
                  borderRadius: 16,
                  background: '#f1ece2',
                  color: '#2a2018',
                  fontSize: 14.5,
                  fontWeight: 600,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {line.text}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function WebtoonStrip({ panels, speaker }: { panels: FortunePanel[]; speaker: FortuneCharacter }) {
  if (!panels.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionLabel>{speaker.name}의 운세 웹툰</SectionLabel>
      {panels.map((p, i) => (
        <WebtoonCut key={i} panel={p} index={i} speaker={speaker} />
      ))}
    </div>
  );
}

/* ── 추천 작품(행운의 타이틀) — 표지 정책 준수(없으면 그라디언트 폴백) ──────────── */

function RecRow({ titles }: { titles: Title[] }) {
  if (!titles.length) return null;
  return (
    <div>
      <SectionLabel>행운의 타이틀</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {titles.slice(0, 3).map((t) => {
          const src = coverUrl(t);
          return (
            <div
              key={t.id}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                padding: 10,
                borderRadius: 12,
                background: theme.surfaceAlt,
                border: `1px solid ${theme.border}`,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 56,
                  borderRadius: 8,
                  flexShrink: 0,
                  overflow: 'hidden',
                  background: 'linear-gradient(140deg, #3a2c1e, #221a13)',
                }}
              >
                {src ? (
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : null}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: theme.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.title}
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>✍️ {t.author}</div>
                <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                  {(t.genres ?? []).slice(0, 3).map((g) => (
                    <Badge key={g}>{g}</Badge>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── 결과 상단 헤더 + 공유 ────────────────────────────────────────────────── */

function ResultHeader({
  tab,
  char,
  shareText,
  onReset,
}: {
  tab: TabId;
  char: FortuneCharacter;
  shareText: string;
  onReset: () => void;
}) {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const x = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(x);
  }, [toast]);
  const onShare = async () => {
    const r = await shareMessage(`${shareText}\n${SHARE_URL}`);
    if (r === 'clipboard') setToast('클립보드에 복사했어요.');
  };
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        paddingBottom: 12,
        borderBottom: `1px solid ${theme.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Avatar char={char} size={36} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: theme.text }}>{TAB_TITLE_KO[tab]}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>by {char.name}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          className="pressable"
          onClick={onShare}
          style={{
            height: 34,
            padding: '0 12px',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            border: 'none',
            background: theme.accentSoft,
            color: theme.accent,
          }}
        >
          공유
        </button>
        <button
          type="button"
          className="pressable"
          onClick={onReset}
          style={{
            height: 34,
            padding: '0 12px',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            border: `1px solid ${theme.border}`,
            background: 'transparent',
            color: theme.textMuted,
          }}
        >
          다시
        </button>
      </div>
      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 'calc(28px + env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.82)',
            color: theme.text,
            padding: '10px 18px',
            borderRadius: 999,
            fontSize: 14,
            zIndex: 70,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

/* ── 탭별 결과 본문 ──────────────────────────────────────────────────────── */

function pillarGrid(saju: SajuChart) {
  const cols = [
    { h: '시주', p: saju.hourPillar },
    { h: '일주', p: saju.dayPillar },
    { h: '월주', p: saju.monthPillar },
    { h: '년주', p: saju.yearPillar },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
      {cols.map((c) => (
        <div key={c.h} style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textAlign: 'center' }}>
          {c.h}
        </div>
      ))}
      {cols.map((c) => (
        <div
          key={`k-${c.h}`}
          style={{
            borderRadius: 8,
            padding: 6,
            textAlign: 'center',
            border: `1px solid ${theme.border}`,
            background: theme.surfaceAlt,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800, color: theme.text }}>{c.p.kan}</div>
          <div style={{ fontSize: 10, color: theme.textMuted }}>
            {c.p.kanKorean} ({c.p.elementKan})
          </div>
        </div>
      ))}
      {cols.map((c) => (
        <div
          key={`j-${c.h}`}
          style={{
            borderRadius: 8,
            padding: 6,
            textAlign: 'center',
            border: `1px solid ${theme.border}`,
            background: theme.surfaceAlt,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800, color: theme.text }}>{c.p.ji}</div>
          <div style={{ fontSize: 10, color: theme.textMuted }}>
            {c.p.jiKorean} ({c.p.elementJi})
          </div>
        </div>
      ))}
    </div>
  );
}

function elementBars(ratio: SajuChart['elementsRatio']) {
  const rows = [
    { ko: '목', label: '목 (Wood)', v: ratio.wood },
    { ko: '화', label: '화 (Fire)', v: ratio.fire },
    { ko: '토', label: '토 (Earth)', v: ratio.earth },
    { ko: '금', label: '금 (Metal)', v: ratio.metal },
    { ko: '수', label: '수 (Water)', v: ratio.water },
  ];
  return (
    <div>
      {rows.map((r) => (
        <Bar key={r.ko} label={r.label} value={r.v} color={ELEMENT_DOT[r.ko]} />
      ))}
    </div>
  );
}

function ResultBody({ tab, result }: { tab: TabId; result: DrawResult }) {
  // tab 이 어떤 draw* 가 결과를 만들었는지 보장하므로 멤버 타입으로 좁힌다(런타임 가드도 유지).
  if (tab === 'today') return <TodayBody result={result as TodayResult} />;
  if (tab === 'saju') return <SajuBody result={result as SajuDraw} />;
  if (tab === 'compat') return <CompatBody result={result as CompatResult} />;
  if (tab === 'tarot') return <TarotBody result={result as TarotResult} />;
  if (tab === 'zodiac') return <ZodiacBody result={result as ZodiacResult} />;
  if (tab === 'prescription') return <PrescriptionBody result={result as PrescriptionResult} />;
  return null;
}

function TodayBody({ result }: { result: TodayResult }) {
  const char = result.character;
  if (result.today) {
    const t = result.today;
    const stats = [
      { label: '행운 색', value: t.color },
      { label: '행운 방향', value: t.direction },
      { label: '행운 시간', value: t.time },
      { label: '행운 숫자', value: String(t.luckyNumber) },
    ];
    const cats = result.categories;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card>
          <ScoreRing score={t.score} />
        </Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {stats.map((s) => (
            <Card key={s.label} style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 12, color: theme.textMuted }}>{s.label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: theme.text, marginTop: 2 }}>{s.value}</div>
            </Card>
          ))}
        </div>
        {result.luckyElement && (
          <Card style={{ background: theme.accentSoft, border: `1px solid ${theme.accent}33` }}>
            <div style={{ fontSize: 12.5, color: theme.text, lineHeight: 1.6 }}>
              <strong style={{ color: theme.accent }}>내 사주 연동</strong> · 오늘 보완하면 좋은 기운{' '}
              <strong>{ELEMENT_KO[result.luckyElement] ?? result.luckyElement}</strong> → 행운 색·방향이 이 기운에 맞춰졌어요.
            </div>
          </Card>
        )}
        {cats && (
          <Card>
            <SectionLabel>세부 운세</SectionLabel>
            <Bar label="💕 애정운" value={cats.love} color="#f472b6" />
            <Bar label="💰 금전운" value={cats.money} color="#a3e635" />
            <Bar label="💼 직장운" value={cats.work} color="#818cf8" />
            <Bar label="🌿 건강운" value={cats.health} color="#34d399" />
          </Card>
        )}
        <WebtoonStrip panels={result.panels} speaker={char} />
        <RecRow titles={result.recommendations} />
      </div>
    );
  }
  return null;
}

function SajuBody({ result }: { result: SajuDraw }) {
  const char = result.character;
  if (result.saju) {
    const a = result.analysis;
    const yl = result.yearLuck;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card>
          <SectionLabel>사주 원판 (四柱八字)</SectionLabel>
          {pillarGrid(result.saju)}
        </Card>
        <Card>
          <SectionLabel>음양오행 강약</SectionLabel>
          {elementBars(result.saju.elementsRatio)}
        </Card>
        {a && (
          <Card>
            <div style={{ fontSize: 13.5, color: theme.text, lineHeight: 1.7 }}>
              일간 <strong style={{ color: theme.accent }}>{a.dayMasterKan}</strong>(
              {a.dayMasterElement}·{a.yinYang}) · {a.strength} · 용신 <strong>{a.usefulElement}</strong>
              <br />
              {a.personality}
            </div>
          </Card>
        )}
        {yl && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { tag: '올해 세운', y: yl.thisYear },
              { tag: '내년 미리보기', y: yl.nextYear },
            ].map(({ tag, y }) => (
              <Card key={tag} style={{ background: theme.accentSoft, border: `1px solid ${theme.accent}33` }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: theme.accent }}>{tag}</div>
                <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
                  {y.year} {y.kanji}年
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: theme.text, marginTop: 6 }}>{y.score}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>{y.themeName}</div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4, lineHeight: 1.5 }}>{y.themeFocus}</div>
              </Card>
            ))}
          </div>
        )}
        <WebtoonStrip panels={result.panels} speaker={char} />
        <RecRow titles={result.recommendations} />
      </div>
    );
  }
  return null;
}

function CompatBody({ result }: { result: CompatResult }) {
  const char = result.character;
  if (result.mySaju && result.partnerSaju && typeof result.score === 'number') {
    const c = result.compat;
    const score = result.score;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: theme.textMuted, letterSpacing: 1 }}>궁합 지수</div>
          <div style={{ fontSize: 48, fontWeight: 900, color: theme.accent, lineHeight: 1.1 }}>{score}%</div>
          {c && <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{c.grade}</div>}
        </Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Card style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent }}>나의 일주</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: theme.text, marginTop: 4 }}>
              {result.mySaju.dayPillar.kanKorean}
              {result.mySaju.dayPillar.jiKorean}
            </div>
          </Card>
          <Card style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent }}>상대 일주</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: theme.text, marginTop: 4 }}>
              {result.partnerSaju.dayPillar.kanKorean}
              {result.partnerSaju.dayPillar.jiKorean}
            </div>
          </Card>
        </div>
        {c && (
          <Card>
            {typeof c.elementComplement === 'number' && (
              <div style={{ marginBottom: c.positives.length || c.cautions.length ? 12 : 0 }}>
                <Bar label="오행 보완도" value={c.elementComplement} color={theme.accent} />
              </div>
            )}
            {c.positives.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: c.cautions.length ? 8 : 0 }}>
                {c.positives.map((p, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: 'rgba(52,211,153,0.12)',
                      color: '#34d399',
                    }}
                  >
                    ✓ {p}
                  </span>
                ))}
              </div>
            )}
            {c.cautions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {c.cautions.map((p, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: 'rgba(240,168,104,0.14)',
                      color: theme.accent,
                    }}
                  >
                    ⚠ {p}
                  </span>
                ))}
              </div>
            )}
          </Card>
        )}
        <WebtoonStrip panels={result.panels} speaker={char} />
        <RecRow titles={result.recommendations} />
      </div>
    );
  }
  return null;
}

function TarotBody({ result }: { result: TarotResult }) {
  const char = result.character;
  if (result.cards) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {result.cards.map((card, i) => (
            <Card key={i} style={{ flex: '1 1 30%', minWidth: 96, textAlign: 'center' }}>
              {'position' in card && card.position && (
                <div style={{ fontSize: 11, fontWeight: 800, color: theme.accent, marginBottom: 4 }}>{card.position}</div>
              )}
              <div style={{ fontSize: 36 }}>🃏</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: theme.text, marginTop: 4 }}>{card.name}</div>
              <div style={{ fontSize: 11, color: theme.textMuted }}>
                {card.type === 'upright' ? '정방향' : '역방향'}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
                {card.keywords.slice(0, 3).map((k) => (
                  <Badge key={k}>{k}</Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
        <WebtoonStrip panels={result.panels} speaker={char} />
        <RecRow titles={result.recommendations} />
      </div>
    );
  }
  return null;
}

function ZodiacBody({ result }: { result: ZodiacResult }) {
  const char = result.character;
  if (result.zodiac) {
    const z = result.zodiac;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 56, lineHeight: 1.1 }}>{z.glyph}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: theme.text }}>{z.ko}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>
            {z.en} · {z.dateRange} · {z.element}의 별자리 · {z.ruling}
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, color: theme.accent, marginTop: 8 }}>{z.score}</div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            {z.traits.map((tr) => (
              <Badge key={tr}>#{tr}</Badge>
            ))}
          </div>
        </Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Card style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent }}>행운 컬러</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: theme.text, marginTop: 4 }}>{z.luckyColor}</div>
          </Card>
          <Card style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent }}>행운 숫자</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: theme.text, marginTop: 4 }}>{z.luckyNumber}</div>
          </Card>
        </div>
        <WebtoonStrip panels={result.panels} speaker={char} />
        <RecRow titles={result.recommendations} />
      </div>
    );
  }
  return null;
}

function PrescriptionBody({ result }: { result: PrescriptionResult }) {
  const char = result.character;
  if (result.query) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card style={{ background: theme.accentSoft, border: `1px solid ${theme.accent}33` }}>
          <SectionLabel>독서 처방전</SectionLabel>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>진단된 고민: "{String(result.query)}"</div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 8, lineHeight: 1.6, fontStyle: 'italic' }}>
            아래 추천 작품을 하루 1회, 3화 이상 읽으며 마음에 평온을 채워보세요.
          </div>
        </Card>
        <WebtoonStrip panels={result.panels} speaker={char} />
        <RecRow titles={result.recommendations} />
      </div>
    );
  }

  return null;
}

/* ── 한 줄 요약(보관함·공유 텍스트) ─────────────────────────────────────────── */

function summarize(tab: TabId, r: DrawResult): string {
  if (tab === 'today') {
    const t = (r as TodayResult).today;
    return `오늘의 운세 ${t.score}점`;
  }
  if (tab === 'saju') {
    const s = (r as SajuDraw).saju;
    return `사주 ${s.dayPillar.kanKorean}${s.dayPillar.jiKorean}일주`;
  }
  if (tab === 'compat') return `궁합 ${(r as CompatResult).score}%`;
  if (tab === 'tarot') return `타로 ${(r as TarotResult).card.name}`;
  if (tab === 'zodiac') {
    const z = (r as ZodiacResult).zodiac;
    return `${z.ko} ${z.score}점`;
  }
  if (tab === 'prescription') return '독서 처방';
  return '운세 결과';
}

/* ── 페이지 ──────────────────────────────────────────────────────────────── */

export function FortunePage() {
  const profile = useProfile();
  const streak = useStreak();
  const history = useHistory();

  const [catalog, setCatalog] = useState<Title[]>([]);
  const [tab, setTab] = useState<TabId>('today');
  const [charId, setCharId] = useState<string>(getProfile().characterId || 'ara');
  const [prescriptionQuery, setPrescriptionQuery] = useState('');
  const [tarotSpread, setTarotSpread] = useState<'one' | 'three'>('one');

  // 탭별 결과 캐시 — 탭 전환 시 이전 결과 유지(결정적이라 같은 입력=같은 결과).
  const [resultByTab, setResultByTab] = useState<Partial<Record<TabId, DrawResult>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = resultByTab[tab] ?? null;
  const selectedChar = CHARACTERS.find((c) => c.id === charId) ?? CHARACTERS[0];

  useEffect(() => {
    recordVisit();
  }, []);

  useEffect(() => {
    let active = true;
    fetchTitles().then((ts) => {
      if (active) setCatalog(ts);
    });
    return () => {
      active = false;
    };
  }, []);

  // 탭/캐릭터 바뀌면 결과를 비워 입력 화면으로(캐릭터별 결과라 캐시 무효).
  function pickTab(next: TabId) {
    setTab(next);
    setError(null);
  }
  function pickChar(id: string) {
    setCharId(id);
    setProfile({ characterId: id });
    setResultByTab({});
    setError(null);
  }

  async function run(tabId: TabId, draw: () => Promise<DrawResult>): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      const r = await draw();
      setResultByTab((prev) => ({ ...prev, [tabId]: r }));
      addHistory({ tab: tabId, characterId: charId, summary: summarize(tabId, r) });
    } catch (e) {
      console.error('운세 계산 실패:', e);
      setError('운세를 계산하지 못했어요. 입력을 확인하고 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }

  const catalogReady = catalog.length > 0;

  // 각 탭 실행 — 모든 계산은 @toonspectrum/core(클라이언트). generateText 미주입 → 결정적 폴백.
  function runToday() {
    void run('today', () =>
      drawTodayFortune(catalog, charId, profile.birthDate || undefined, profile.birthTime || undefined, profile.gender),
    );
  }
  function runSaju() {
    if (!profile.birthDate) return;
    void run('saju', () => drawSaju(catalog, profile.birthDate, profile.birthTime || undefined, profile.gender, charId));
  }
  function runCompat() {
    if (!profile.birthDate || !profile.partnerBirthDate) return;
    void run('compat', () =>
      drawCompatibility(
        catalog,
        profile.birthDate,
        profile.birthTime || undefined,
        profile.partnerBirthDate,
        profile.partnerBirthTime || undefined,
        charId,
      ),
    );
  }
  function runTarot(cardIdx: number) {
    void run('tarot', () => drawTarot(catalog, charId, cardIdx, tarotSpread));
  }
  function runPrescription() {
    if (!prescriptionQuery.trim()) return;
    void run('prescription', () => drawPrescription(catalog, prescriptionQuery.trim(), charId));
  }
  function runZodiac() {
    if (!profile.birthDate) return;
    const [, m, d] = profile.birthDate.split('-').map(Number);
    void run('zodiac', () => drawZodiac(catalog, charId, m, d));
  }

  function resetResult() {
    setResultByTab((prev) => ({ ...prev, [tab]: undefined }));
    setError(null);
  }

  return (
    <div style={pageShell}>
      <Top
        title={<Top.TitleParagraph>🔮 웹툰 운세</Top.TitleParagraph>}
        subtitleBottom={
          <Top.SubtitleParagraph>
            오늘의 기록을 펼쳐봐요 · 🔥 {streak.count}일 연속 ({streak.total}회 방문)
          </Top.SubtitleParagraph>
        }
      />

      {/* 화자 캐릭터 선택 */}
      <div style={{ marginBottom: 14 }}>
        <SectionLabel>운세를 풀어줄 캐릭터</SectionLabel>
        <div className="chips">
          {CHARACTERS.map((c) => {
            const on = c.id === charId;
            return (
              <button
                key={c.id}
                type="button"
                className="pressable"
                onClick={() => pickChar(c.id)}
                aria-pressed={on}
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 44,
                  padding: '0 12px 0 6px',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: on ? 'none' : `1px solid ${theme.border}`,
                  background: on ? theme.accentSoft : 'transparent',
                  color: on ? theme.accent : theme.textMuted,
                }}
              >
                <Avatar char={c} size={32} />
                {c.name}
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: 12, color: theme.textMuted, marginTop: 8, lineHeight: 1.5 }}>
          “{selectedChar.greeting}”
        </p>
      </div>

      {/* 운세 탭 */}
      <div role="tablist" aria-label="운세 종류" className="chips" style={{ marginBottom: 16 }}>
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              className="pressable"
              onClick={() => pickTab(t.id)}
              style={{
                flexShrink: 0,
                height: 36,
                padding: '0 14px',
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                border: on ? 'none' : `1px solid ${theme.border}`,
                background: on ? theme.accent : 'transparent',
                color: on ? theme.accentInk : theme.textMuted,
              }}
            >
              {t.emoji} {t.label}
            </button>
          );
        })}
      </div>

      <div aria-live="polite" aria-busy={loading}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: theme.textMuted }}>운세를 펼치는 중…</div>
        ) : error ? (
          <Card style={{ textAlign: 'center' }}>
            <div role="alert" style={{ color: theme.danger, fontSize: 14, marginBottom: 12 }}>
              {error}
            </div>
            <Button variant="weak" onClick={resetResult}>
              다시 입력
            </Button>
          </Card>
        ) : result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ResultHeader
              tab={tab}
              char={selectedChar}
              shareText={`${selectedChar.name}의 ${TAB_TITLE_KO[tab]} — ${summarize(tab, result)}`}
              onReset={resetResult}
            />
            <ResultBody tab={tab} result={result} />
          </div>
        ) : !catalogReady ? (
          <div style={{ textAlign: 'center', padding: 48, color: theme.textMuted }}>작품 정보를 불러오는 중…</div>
        ) : (
          <TabForm
            tab={tab}
            profile={profile}
            char={selectedChar}
            prescriptionQuery={prescriptionQuery}
            setPrescriptionQuery={setPrescriptionQuery}
            tarotSpread={tarotSpread}
            setTarotSpread={setTarotSpread}
            onToday={runToday}
            onSaju={runSaju}
            onCompat={runCompat}
            onTarot={runTarot}
            onPrescription={runPrescription}
            onZodiac={runZodiac}
          />
        )}
      </div>

      {/* 보관함(최근 본 운세) */}
      {history.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <SectionLabel>최근 본 운세</SectionLabel>
            <button
              type="button"
              className="pressable"
              onClick={clearHistory}
              style={{ background: 'none', border: 'none', color: theme.textMuted, fontSize: 12, cursor: 'pointer' }}
            >
              전체 지우기
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((h) => {
              const hc = CHARACTERS.find((c) => c.id === h.characterId) ?? CHARACTERS[0];
              return (
                <div
                  key={h.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: 10,
                    borderRadius: 12,
                    background: theme.surface,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <Avatar char={hc} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: theme.text }}>{h.summary}</div>
                    <div style={{ fontSize: 11, color: theme.textMuted }}>
                      {TAB_TITLE_KO[(h.tab as TabId) in TAB_TITLE_KO ? (h.tab as TabId) : 'today']} · {h.dateLabel}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="pressable"
                    onClick={() => removeHistory(h.id)}
                    aria-label="이 기록 삭제"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: theme.textMuted,
                      fontSize: 16,
                      cursor: 'pointer',
                      padding: 4,
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 광고 — 콘텐츠가 끝나는 자연스러운 지점(below the fold) */}
      <BannerAd />

      <p style={{ fontSize: 11, lineHeight: 1.6, color: theme.textMuted, marginTop: 22 }}>
        운세는 재미를 위한 콘텐츠예요. 결과는 입력값으로 결정되는 명리/난수 기반(≈추정)이며 실제 길흉을 보장하지 않아요.
        등장 캐릭터(사서 아라·도깨비 단우·점술가 레오나·검객 가온)는 ToonSpectrum 고유 창작이며 실존 인물·타사 저작물과 무관합니다.
      </p>
    </div>
  );
}

/* ── 탭별 입력 폼 ────────────────────────────────────────────────────────── */

function TabForm({
  tab,
  profile,
  char,
  prescriptionQuery,
  setPrescriptionQuery,
  tarotSpread,
  setTarotSpread,
  onToday,
  onSaju,
  onCompat,
  onTarot,
  onPrescription,
  onZodiac,
}: {
  tab: TabId;
  profile: ReturnType<typeof useProfile>;
  char: FortuneCharacter;
  prescriptionQuery: string;
  setPrescriptionQuery: (v: string) => void;
  tarotSpread: 'one' | 'three';
  setTarotSpread: (v: 'one' | 'three') => void;
  onToday: () => void;
  onSaju: () => void;
  onCompat: () => void;
  onTarot: (cardIdx: number) => void;
  onPrescription: () => void;
  onZodiac: () => void;
}) {
  if (tab === 'today') {
    return (
      <Card>
        <div style={{ fontSize: 15, fontWeight: 800, color: theme.text, marginBottom: 4 }}>오늘 하루는 어떨까요?</div>
        <p style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
          생년월일을 넣으면 {char.name}가 사주 오행으로 개인화해 풀어줘요(선택). 같은 날엔 결과가 바뀌지 않아요.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <DateField
            id="today-birth"
            label="생년월일 (양력·선택)"
            type="date"
            value={profile.birthDate}
            onChange={(v) => setProfile({ birthDate: v })}
          />
          <DateField
            id="today-time"
            label="태어난 시간 (선택)"
            type="time"
            value={profile.birthTime}
            onChange={(v) => setProfile({ birthTime: v })}
          />
          <GenderPicker value={profile.gender} onChange={(g) => setProfile({ gender: g })} />
        </div>
        <PrimaryButton onClick={onToday}>
          {profile.birthDate ? '내 사주로 오늘의 운세 보기' : '오늘의 운세 확인하기'}
        </PrimaryButton>
      </Card>
    );
  }

  if (tab === 'saju') {
    return (
      <Card>
        <div style={{ fontSize: 15, fontWeight: 800, color: theme.text, marginBottom: 4 }}>사주팔자 분석</div>
        <p style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
          정확한 연산을 위해 생년월일시를 입력하세요.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <DateField
            id="saju-birth"
            label="생년월일 (양력) *"
            type="date"
            value={profile.birthDate}
            onChange={(v) => setProfile({ birthDate: v })}
          />
          <DateField
            id="saju-time"
            label="태어난 시간 (선택)"
            type="time"
            value={profile.birthTime}
            onChange={(v) => setProfile({ birthTime: v })}
          />
          <GenderPicker value={profile.gender} onChange={(g) => setProfile({ gender: g })} />
        </div>
        <PrimaryButton onClick={onSaju} disabled={!profile.birthDate}>
          {char.name}에게 사주 풀이받기
        </PrimaryButton>
      </Card>
    );
  }

  if (tab === 'compat') {
    return (
      <Card>
        <div style={{ fontSize: 15, fontWeight: 800, color: theme.text, marginBottom: 4 }}>두 사람의 궁합</div>
        <p style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
          나와 상대의 생년월일시로 명리 궁합을 풀어줘요.
        </p>
        <SectionLabel>나의 생년월일시</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          <DateField
            id="compat-my-birth"
            label="생년월일 *"
            type="date"
            value={profile.birthDate}
            onChange={(v) => setProfile({ birthDate: v })}
          />
          <DateField
            id="compat-my-time"
            label="태어난 시간 (선택)"
            type="time"
            value={profile.birthTime}
            onChange={(v) => setProfile({ birthTime: v })}
          />
        </div>
        <SectionLabel>상대의 생년월일시</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <DateField
            id="compat-partner-birth"
            label="생년월일 *"
            type="date"
            value={profile.partnerBirthDate}
            onChange={(v) => setProfile({ partnerBirthDate: v })}
          />
          <DateField
            id="compat-partner-time"
            label="태어난 시간 (선택)"
            type="time"
            value={profile.partnerBirthTime}
            onChange={(v) => setProfile({ partnerBirthTime: v })}
          />
        </div>
        <PrimaryButton onClick={onCompat} disabled={!profile.birthDate || !profile.partnerBirthDate}>
          {char.name}에게 궁합 풀이받기
        </PrimaryButton>
      </Card>
    );
  }

  if (tab === 'zodiac') {
    return (
      <Card>
        <div style={{ fontSize: 15, fontWeight: 800, color: theme.text, marginBottom: 4 }}>생일로 보는 별자리 운세</div>
        <p style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
          생년월일만 넣으면 {char.name}가 별자리와 오늘의 별빛 흐름을 풀어줘요. (월·일만 사용)
        </p>
        <DateField
          id="zodiac-birth"
          label="생년월일 *"
          type="date"
          value={profile.birthDate}
          onChange={(v) => setProfile({ birthDate: v })}
        />
        <PrimaryButton onClick={onZodiac} disabled={!profile.birthDate}>
          {char.name}에게 별자리 운세 보기
        </PrimaryButton>
      </Card>
    );
  }

  if (tab === 'prescription') {
    return (
      <Card>
        <div style={{ fontSize: 15, fontWeight: 800, color: theme.text, marginBottom: 4 }}>AI 독서 처방전</div>
        <p style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
          오늘 당신의 지친 마음이나 보고 싶은 분위기를 적어보세요.
        </p>
        <label htmlFor="prescription-query" style={{ display: 'block', fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>
          어떤 이야기가 필요한가요?
        </label>
        <textarea
          id="prescription-query"
          rows={4}
          value={prescriptionQuery}
          onChange={(e) => setPrescriptionQuery(e.target.value)}
          placeholder="예: 오늘 너무 힘들어서 시원하고 통쾌한 사이다 웹툰으로 스트레스 날리고 싶어!"
          style={{
            width: '100%',
            padding: 12,
            borderRadius: 12,
            border: `1px solid ${theme.border}`,
            background: theme.surfaceAlt,
            color: theme.text,
            fontSize: 14,
            lineHeight: 1.5,
            resize: 'none',
            fontFamily: 'inherit',
          }}
        />
        <PrimaryButton onClick={onPrescription} disabled={!prescriptionQuery.trim()}>
          {char.name}에게 도서 처방받기
        </PrimaryButton>
      </Card>
    );
  }

  // tarot
  return (
    <Card style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: theme.text, marginBottom: 4 }}>오늘의 타로 리딩</div>
      <p style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.6, marginBottom: 14 }}>
        마음을 집중하고, 오늘의 조언을 줄 카드를 직접 뽑아보세요.
      </p>
      <div className="chips" style={{ justifyContent: 'center', marginBottom: 16 }}>
        {(
          [
            { key: 'one', label: '1장 뽑기' },
            { key: 'three', label: '3장 (과거·현재·미래)' },
          ] as const
        ).map((s) => {
          const on = tarotSpread === s.key;
          return (
            <button
              key={s.key}
              type="button"
              className="pressable"
              onClick={() => setTarotSpread(s.key)}
              aria-pressed={on}
              style={{
                flexShrink: 0,
                height: 34,
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
      <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 10 }}>카드를 한 장 터치하세요</div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        {[0, 1, 2].map((idx) => (
          <button
            key={idx}
            type="button"
            className="pressable"
            onClick={() => onTarot(idx)}
            aria-label={`${idx + 1}번째 카드 뽑기`}
            style={{
              width: 72,
              height: 108,
              borderRadius: 12,
              cursor: 'pointer',
              border: `2px solid ${theme.accent}66`,
              background: 'linear-gradient(160deg, #3a2c1e, #1d160f)',
              color: theme.accent,
              fontSize: 30,
            }}
          >
            🃏
          </button>
        ))}
      </div>
    </Card>
  );
}

export default FortunePage;
