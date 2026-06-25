// 추천 (/recommend) — 웹 src/domains/catalog/RecommendPage.tsx + components/recommend-view.tsx 의
// 토스 미러. 랭킹/추천/유사도 로직은 전부 @toonspectrum/core(buildTasteProfile·recommendForTaste·
// similarTitles)에서 가져오고, 이 파일은 TDS/토스 UI 렌더만 담당한다(중복 로직 0).
//
// 토스는 아직 zustand ratings/reads 영속 스토어가 없어 경량 localStorage 스토어로 취향 신호를
// 채운다(없으면 장르 시드 추천으로 day-one 동작). 하단 탭이 아니라 홈 섹션/오버플로로 진입.
import { useEffect, useMemo, useState } from 'react';

import {
  GENRES,
  buildTasteProfile,
  recommendForTaste,
  similarTitles,
  platform,
  type ReadState,
  type TasteProfile,
} from '@toonspectrum/core';

import { Carousel } from '../components/Carousel';
import { GameCover } from '../games/GameCover';
import { toGameTitles } from '../games/types';
import { fetchTitles, type Title } from '../lib/api';
import { navigate } from '../router';
import { Top } from '../tds-shim';
import { theme, pageShell } from '../theme';
import { Badge, Chips } from '../ui';

// ── 경량 취향 스토어 ─────────────────────────────────────────────
// zustand 영속 스토어가 토스에 도입되기 전까지 localStorage로 ratings/reads를 보관한다.
// 웹의 useApp(s => s.ratings/reads)와 동일한 형태(Record)라 core 함수에 그대로 넘긴다.
const RATINGS_KEY = 'toon:ratings';
const READS_KEY = 'toon:reads';

function readJson<T extends Record<string, unknown>>(key: string): T {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 비공개 모드 등 — 조용히 무시.
  }
}

// 장르 시드: 선택한 칩으로 합성 TasteProfile을 만든다(평가 이력이 없어도 day-one 추천).
// 가중치만 부여하는 데이터 변환일 뿐, 랭킹 로직은 core(recommendForTaste)가 전담한다.
function seededProfile(picked: string[]): TasteProfile {
  return {
    topGenres: picked.map((name, i) => ({ name, weight: picked.length - i })),
    topTags: [],
    ratedCount: 0,
    avgRating: 0,
    affinityType: undefined,
  };
}

// 평가/관심 이력 프로필을 장르 시드와 병합(둘 다 있으면 가중치 합산, 상위 6개 유지).
function mergeProfiles(base: TasteProfile, picked: string[]): TasteProfile {
  if (picked.length === 0) return base;
  const w = new Map(base.topGenres.map((g) => [g.name, g.weight]));
  picked.forEach((name, i) => w.set(name, (w.get(name) ?? 0) + (picked.length - i)));
  return {
    ...base,
    topGenres: Array.from(w.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, weight]) => ({ name, weight })),
  };
}

const ONBOARDING_GENRES = GENRES.slice(0, 10) as readonly string[];

// 표지 정책 준수: GameCover는 그라디언트 타이포 커버(off면 이미지 차단)로 안전하게 폴백한다.
// Title → GameTitle 변환은 toGameTitles 단일 소스를 재사용.
function cover(t: Title): React.ReactNode {
  const [g] = toGameTitles([t]);
  return <GameCover t={g} radius={12} />;
}

function open(t: Title) {
  navigate(`/title/${encodeURIComponent(t.id)}`);
}

// 가용 플랫폼 라벨(원시 id 아닌 platform().name — 정직성 규약).
function platformLabel(t: Title): string | null {
  const first = t.availability?.[0]?.platformId;
  return first ? platform(first).name : null;
}

function PosterButton({
  t,
  reason,
  selected,
  delay,
  onClick,
}: {
  t: Title;
  reason?: string;
  selected?: boolean;
  delay?: number;
  onClick: () => void;
}) {
  const label = platformLabel(t);
  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable rise"
      style={{
        animationDelay: delay ? `${delay}ms` : undefined,
        textAlign: 'left',
        background: theme.surface,
        border: selected ? `2px solid ${theme.accent}` : `1px solid ${theme.border}`,
        borderRadius: theme.radius,
        overflow: 'hidden',
        padding: 0,
        color: theme.text,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {cover(t)}
      <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {t.genres?.slice(0, 1).map((gn) => (
            <Badge key={gn} accent>
              {gn}
            </Badge>
          ))}
          {t.stats?.ratingAvg != null && <Badge>★ ≈{t.stats.ratingAvg.toFixed(1)}</Badge>}
          {label && <Badge>{label}</Badge>}
        </div>
        {reason && (
          <p style={{ fontSize: 12, lineHeight: 1.4, color: theme.accent, margin: 0 }}>{reason}</p>
        )}
      </div>
    </button>
  );
}

function SectionHead({ icon, title, desc }: { icon: string; title: string; desc?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden style={{ fontSize: 18 }}>
          {icon}
        </span>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{title}</h2>
      </div>
      {desc && <p style={{ fontSize: 13, color: theme.textMuted, margin: '6px 0 0' }}>{desc}</p>}
    </div>
  );
}

export function RecommendPage() {
  const [items, setItems] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [picked, setPicked] = useState<string[]>([]);
  const [seedId, setSeedId] = useState<string | null>(null);

  // 취향 신호(localStorage). 마운트 시 1회 로드해 core 함수 입력으로 사용.
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [reads, setReads] = useState<Record<string, ReadState>>({});

  useEffect(() => {
    setRatings(readJson<Record<string, number>>(RATINGS_KEY));
    setReads(readJson<Record<string, ReadState>>(READS_KEY));
    fetchTitles()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : '불러오기 실패'))
      .finally(() => setLoading(false));
  }, []);

  // ── 추천 파생(전부 core 함수) ──────────────────────────────────
  const baseProfile = useMemo(
    () => buildTasteProfile(items, ratings, reads),
    [items, ratings, reads]
  );
  const hasTaste = baseProfile.ratedCount + Object.keys(reads).length > 0;

  // 1) 취향 픽 — 선택 장르를 합성 프로필로 시드해 core recommendForTaste로 랭킹.
  const pickedProfile = useMemo(() => seededProfile(picked), [picked]);
  const pickedRecs = useMemo(() => {
    if (picked.length === 0) return [];
    return recommendForTaste(items, pickedProfile, new Set(), 12);
  }, [items, pickedProfile, picked.length]);

  // 2) FOR YOU — 평가/관심 이력(+장르 시드 병합) 기반.
  const tasteRecs = useMemo(() => {
    const seen = new Set([...Object.keys(ratings), ...Object.keys(reads)]);
    const profile = mergeProfiles(baseProfile, picked);
    return recommendForTaste(items, profile, seen, 12);
  }, [items, baseProfile, ratings, reads, picked]);

  // 3) 비슷한 작품 — 시드 포스터 레일(인기 상위) → similarTitles.
  const popular = useMemo(
    () => [...items].sort((a, b) => (b.stats?.views ?? 0) - (a.stats?.views ?? 0)).slice(0, 16),
    [items]
  );
  const seed = useMemo(() => items.find((t) => t.id === seedId) ?? null, [items, seedId]);
  const similar = useMemo(
    () => (seed ? similarTitles(items, seed, 10) : []),
    [items, seed]
  );

  // 평가 토글(★5 = 인생작) — 로컬 스토어 갱신. 추천이 즉시 닮아간다.
  const toggleLove = (t: Title) => {
    setRatings((prev) => {
      const next = { ...prev };
      const nextReads = { ...reads };
      if (next[t.id] === 5) {
        delete next[t.id];
        delete nextReads[t.id];
      } else {
        next[t.id] = 5;
        nextReads[t.id] = 'done';
      }
      writeJson(RATINGS_KEY, next);
      writeJson(READS_KEY, nextReads);
      setReads(nextReads);
      return next;
    });
  };

  return (
    <div style={{ minHeight: '100dvh', background: theme.bg }}>
      <Top
        title={<Top.TitleParagraph size={22}>✨ 추천</Top.TitleParagraph>}
        subtitleBottom={
          <Top.SubtitleParagraph size={15}>취향을 고르면 그 자리에서 추천이 만들어져요</Top.SubtitleParagraph>
        }
      />
      <div style={pageShell}>
        {loading && (
          <p style={{ textAlign: 'center', color: theme.textMuted, padding: '40px 0' }}>
            추천을 준비하고 있어요…
          </p>
        )}
        {error && (
          <p style={{ textAlign: 'center', color: theme.danger, padding: '24px 0' }}>
            추천을 불러오지 못했어요. ({error})
          </p>
        )}

        {!loading && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {/* ── 취향 픽(콜드스타트) ─────────────────────────── */}
            <section>
              <SectionHead
                icon="🪄"
                title="어떤 결이 끌리나요?"
                desc="끌리는 장르를 고르면 즉시 추천이 갱신돼요. 평가 이력이 있으면 함께 반영됩니다."
              />
              <div className="chips" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
                {(GENRES as readonly string[]).map((g) => {
                  const on = picked.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() =>
                        setPicked((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g]))
                      }
                      className="pressable"
                      aria-pressed={on}
                      style={{
                        flexShrink: 0,
                        height: 34,
                        padding: '0 14px',
                        borderRadius: 999,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: on ? 'none' : '1px solid rgba(255,255,255,0.1)',
                        background: on ? theme.accent : 'transparent',
                        color: on ? theme.accentInk : theme.textMuted,
                      }}
                    >
                      {g}
                    </button>
                  );
                })}
                {picked.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPicked([])}
                    className="pressable"
                    style={{
                      flexShrink: 0,
                      height: 34,
                      padding: '0 14px',
                      borderRadius: 999,
                      fontSize: 14,
                      cursor: 'pointer',
                      border: `1px solid ${theme.border}`,
                      background: 'transparent',
                      color: theme.textMuted,
                    }}
                  >
                    초기화
                  </button>
                )}
              </div>

              {picked.length > 0 && (
                <p style={{ fontSize: 13, color: theme.textMuted, margin: '4px 0 14px' }}>
                  <span style={{ color: theme.accent }}>{picked.join(' · ')}</span> 취향으로 고른{' '}
                  <span style={{ color: theme.text }}>{pickedRecs.length}</span>편
                </p>
              )}

              {picked.length === 0 ? (
                <p
                  style={{
                    textAlign: 'center',
                    color: theme.textMuted,
                    padding: '28px 0',
                    fontSize: 14,
                  }}
                >
                  위에서 장르를 골라보세요. 추천이 바로 만들어져요.
                </p>
              ) : pickedRecs.length === 0 ? (
                <p
                  style={{
                    textAlign: 'center',
                    color: theme.textMuted,
                    padding: '28px 0',
                    fontSize: 14,
                  }}
                >
                  ‘{picked.join(' · ')}’에 맞는 작품을 찾지 못했어요.
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {pickedRecs.map(({ title, reason }, i) => (
                    <PosterButton
                      key={title.id}
                      t={title}
                      reason={reason}
                      delay={i * 25}
                      onClick={() => open(title)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* ── FOR YOU(평가 기반) — 콜드스타트면 간단 시작 카드 ─ */}
            <section>
              <SectionHead
                icon="💛"
                title="당신의 평가가 가리키는 다음 작품"
                desc={
                  hasTaste
                    ? `평가 ${baseProfile.ratedCount}편을 분석했어요 (추정 취향)`
                    : '인생작 몇 편에 ♥를 남기면 추천이 점점 더 닮아가요'
                }
              />
              {hasTaste && tasteRecs.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {tasteRecs.map(({ title, reason }, i) => (
                    <PosterButton
                      key={title.id}
                      t={title}
                      reason={reason}
                      delay={i * 25}
                      onClick={() => open(title)}
                    />
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    border: `1px solid ${theme.border}`,
                    borderRadius: theme.radius,
                    background: theme.surface,
                    padding: '20px 16px',
                  }}
                >
                  <p style={{ fontSize: 14, color: theme.text, margin: '0 0 4px', fontWeight: 700 }}>
                    나를 위한 개인화 추천 받기
                  </p>
                  <p style={{ fontSize: 13, color: theme.textMuted, margin: '0 0 14px', lineHeight: 1.5 }}>
                    인생작에 ♥를 눌러보세요. 누른 작품과 닮은 결의 작품이 가중 추천됩니다.
                  </p>
                  <Carousel itemWidth={96} gap={10} ariaLabel="인생작 고르기">
                    {popular.slice(0, 8).map((t) => {
                      const loved = ratings[t.id] === 5;
                      return (
                        <div key={t.id}>
                          <button
                            type="button"
                            onClick={() => toggleLove(t)}
                            className="pressable"
                            aria-pressed={loved}
                            aria-label={`${t.title} ${loved ? '인생작 해제' : '인생작으로 표시'}`}
                            style={{
                              width: '100%',
                              padding: 0,
                              border: loved ? `2px solid ${theme.accent}` : 'none',
                              borderRadius: 12,
                              overflow: 'hidden',
                              background: 'transparent',
                              cursor: 'pointer',
                              position: 'relative',
                            }}
                          >
                            {cover(t)}
                            <span
                              aria-hidden
                              style={{
                                position: 'absolute',
                                top: 6,
                                right: 6,
                                fontSize: 16,
                                filter: loved ? 'none' : 'grayscale(1) opacity(0.7)',
                                textShadow: '0 1px 4px rgba(0,0,0,0.5)',
                              }}
                            >
                              {loved ? '❤️' : '🤍'}
                            </span>
                          </button>
                          <div
                            style={{
                              fontSize: 11.5,
                              color: theme.textMuted,
                              marginTop: 5,
                              textAlign: 'center',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {t.title}
                          </div>
                        </div>
                      );
                    })}
                  </Carousel>
                  {ONBOARDING_GENRES.length > 0 && picked.length === 0 && (
                    <div style={{ marginTop: 16 }}>
                      <p style={{ fontSize: 12, color: theme.textMuted, margin: '0 0 8px' }}>
                        또는 좋아하는 장르부터 골라보세요
                      </p>
                      <Chips
                        items={[...ONBOARDING_GENRES]}
                        active=""
                        onPick={(g) => setPicked((p) => (p.includes(g) ? p : [...p, g]))}
                      />
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* ── 비슷한 작품 찾기 ─────────────────────────────── */}
            <section>
              <SectionHead
                icon="🔀"
                title="이 작품과 비슷한"
                desc="기준 작품을 고르면 장르·태그·어댑테이션으로 닮은 작품을 찾아줘요."
              />
              <Carousel itemWidth={64} gap={8} ariaLabel="비슷한 작품의 기준 고르기">
                {popular.map((t) => {
                  const on = seed?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSeedId(on ? null : t.id)}
                      className="pressable"
                      aria-pressed={on}
                      aria-label={`${t.title} 기준으로 비슷한 작품 보기`}
                      title={t.title}
                      style={{
                        width: '100%',
                        padding: 0,
                        border: on ? `2px solid ${theme.accent}` : 'none',
                        borderRadius: 10,
                        overflow: 'hidden',
                        background: 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      {cover(t)}
                    </button>
                  );
                })}
              </Carousel>

              {seed && (
                <div style={{ marginTop: 16 }}>
                  <p style={{ fontSize: 13, color: theme.textMuted, margin: '0 0 12px' }}>
                    <span style={{ color: theme.text, fontWeight: 700 }}>{seed.title}</span>와 비슷한 작품
                  </p>
                  {similar.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {similar.map((t, i) => (
                        <PosterButton key={t.id} t={t} delay={i * 25} onClick={() => open(t)} />
                      ))}
                    </div>
                  ) : (
                    <p style={{ textAlign: 'center', color: theme.textMuted, padding: '20px 0', fontSize: 14 }}>
                      닮은 작품을 찾지 못했어요.
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
