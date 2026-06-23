import { 
  Sparkles, 
  User, 
  Calendar, 
  Clock, 
  ArrowRight, 
  RotateCcw
} from "lucide-react";
import { motion } from "motion/react";
import { useState, useEffect, useRef } from "react";

import type { Title } from "@/lib/types";

import { TitleCard } from "@/components/title-card";
import { cn } from "@/lib/utils";

interface Character {
  id: string;
  name: string;
  origin: string;
  greeting: string;
  avatarUrl: string;
}

interface SajuPillar {
  kan: string;
  ji: string;
  kanKorean: string;
  jiKorean: string;
  elementKan: string;
  elementJi: string;
}

interface SajuData {
  yearPillar: SajuPillar;
  monthPillar: SajuPillar;
  dayPillar: SajuPillar;
  hourPillar: SajuPillar;
  elementsRatio: {
    wood: number;
    fire: number;
    earth: number;
    metal: number;
    water: number;
  };
}

interface TarotCardData {
  id: number;
  name: string;
  nameEn: string;
  type: "upright" | "reversed";
  keywords: string[];
  description: string;
}

// 오행 색상 매핑 (ToonSpectrum 디자인 토큰을 활용한 프리미엄 컬러 세트)
const ELEMENT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  "목": { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-500" },
  "화": { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-500" },
  "토": { bg: "bg-amber-600/10", text: "text-amber-500", dot: "bg-amber-600" },
  "금": { bg: "bg-slate-300/10", text: "text-slate-200", dot: "bg-slate-300" },
  "수": { bg: "bg-sky-500/10", text: "text-sky-400", dot: "bg-sky-500" },
};

export function FortunePage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  const [activeTab, setActiveTab] = useState<"saju" | "tarot">("saju");
  
  // 사주 입력 상태
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [gender, setGender] = useState("none");
  
  // 타로 상태
  const [tarotStep, setTarotStep] = useState<"idle" | "shuffling" | "spread" | "revealed">("idle");
  
  // 결과 상태
  const [isLoading, setIsLoading] = useState(false);
  const [fortuneResult, setFortuneResult] = useState<{
    interpretation: string;
    saju?: SajuData;
    card?: TarotCardData;
    recommendations: Title[];
  } | null>(null);

  // 캐릭터 말풍선 타이핑 효과 상태
  const [typedInterpretation, setTypedInterpretation] = useState("");
  const interpretationRef = useRef<HTMLDivElement>(null);

  // 1. 캐릭터 리스트 가져오기
  useEffect(() => {
    fetch("/api/fortune/characters")
      .then((res) => res.json())
      .then((data) => setCharacters(data))
      .catch((err) => console.error("캐릭터 정보 로드 실패:", err));
  }, []);

  // 2. 캐릭터 말풍선 타이핑 애니메이션 효과
  useEffect(() => {
    if (!fortuneResult?.interpretation) {
      setTypedInterpretation("");
      return;
    }
    
    let isCancelled = false;
    let currentIdx = 0;
    const fullText = fortuneResult.interpretation;
    
    // 빠른 타이핑 속도 (글자당 25ms)
    const interval = setInterval(() => {
      if (isCancelled) return;
      
      currentIdx += 2; // 한 번에 2글자씩 타이핑하여 속도 조절
      if (currentIdx >= fullText.length) {
        setTypedInterpretation(fullText);
        clearInterval(interval);
      } else {
        setTypedInterpretation(fullText.slice(0, currentIdx));
      }
      
      // 자동 스크롤
      if (interpretationRef.current) {
        interpretationRef.current.scrollTop = interpretationRef.current.scrollHeight;
      }
    }, 25);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [fortuneResult]);

  // 사주 분석 API 호출
  const handleAnalyzeSaju = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!birthDate || !selectedChar) return;

    setIsLoading(true);
    setFortuneResult(null);

    try {
      const response = await fetch("/api/fortune/saju", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthDate,
          birthTime: birthTime || undefined,
          gender,
          characterId: selectedChar.id,
        }),
      });

      if (!response.ok) throw new Error("사주 호출 오류");
      const data = await response.json();
      setFortuneResult(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // 타로 셔플 시작
  const startTarotShuffle = () => {
    setTarotStep("shuffling");
    setTimeout(() => {
      setTarotStep("spread");
    }, 1800);
  };

  // 타로 카드 선택 및 해석 요청
  const handleSelectTarotCard = async (_cardIdx: number) => {
    if (!selectedChar || tarotStep !== "spread") return;
    
    setIsLoading(true);
    setFortuneResult(null);

    try {
      const response = await fetch("/api/fortune/tarot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: selectedChar.id,
        }),
      });

      if (!response.ok) throw new Error("타로 호출 오류");
      const data = await response.json();
      setFortuneResult(data);
      setTarotStep("revealed");
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // 상태 초기화
  const handleReset = () => {
    setFortuneResult(null);
    setTarotStep("idle");
    setBirthDate("");
    setBirthTime("");
    setGender("none");
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-[1180px] px-4 py-8 sm:px-6">
      {/* 타이틀 헤더 */}
      <header className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft px-3.5 py-1 text-xs font-semibold text-accent mb-3">
          <Sparkles className="h-3 w-3" />
          <span>페르소나 캐릭터 운세 레이어</span>
        </div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
          CHARACTER FORTUNE
        </h1>
        <p className="mt-2 text-sm text-fg-3">
          최애 웹툰 캐릭터가 제안하는 사주팔자와 타로 큐레이션
        </p>
      </header>

      {/* 1단계: 캐릭터 에이전트 선택 */}
      {!selectedChar ? (
        <section className="mt-8">
          <h2 className="mb-6 text-center text-lg font-bold text-fg-2">
            당신의 운세를 해석해줄 캐릭터 에이전트를 고르세요.
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {characters.map((char) => (
              <button
                key={char.id}
                type="button"
                onClick={() => setSelectedChar(char)}
                className="group relative text-left w-full block cursor-pointer overflow-hidden rounded-2xl border border-line bg-card/65 p-4 transition-all duration-200 hover:-translate-y-1 hover:border-line-strong hover:bg-raised"
              >
                {/* 캐릭터 아바타 이미지 (없을 경우 텍스트 fallback) */}
                <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-gradient-to-br from-accent-soft to-panel/80 flex items-center justify-center border border-line/40">
                  {char.avatarUrl ? (
                    <img 
                      src={char.avatarUrl} 
                      alt={char.name} 
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <span className="font-display text-4xl font-extrabold text-accent/60 group-hover:scale-105 transition-transform duration-300">
                      {char.name[0]}
                    </span>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />
                  <div className="absolute bottom-3 left-3 text-left z-10">
                    <span className="text-[10px] uppercase tracking-wider text-accent font-semibold block">
                      {char.origin}
                    </span>
                    <span className="text-base font-bold text-fg">
                      {char.name}
                    </span>
                  </div>
                </div>
                
                <p className="mt-3 text-xs leading-relaxed text-fg-3 line-clamp-2">
                  "{char.greeting}"
                </p>
                <div className="mt-3 flex items-center justify-end text-[10px] font-bold text-accent group-hover:translate-x-1 transition-transform">
                  선택하기 <ArrowRight className="ml-1 h-3 w-3" />
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : (
        /* 캐릭터가 선택되었을 때의 본문 인터페이스 */
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          
          {/* 왼쪽: 에이전트 정보 및 말풍선 (3/12 cols) */}
          <aside className="lg:col-span-4 flex flex-col gap-4">
            <div className="rounded-2xl border border-line bg-panel/35 p-5 flex flex-col items-center text-center">
              <div className="relative aspect-square w-24 overflow-hidden rounded-full bg-gradient-to-br from-accent/20 to-panel border-2 border-accent flex items-center justify-center shadow-lg">
                {selectedChar.avatarUrl ? (
                  <img 
                    src={selectedChar.avatarUrl} 
                    alt={selectedChar.name} 
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <span className="font-display text-3xl font-extrabold text-accent">{selectedChar.name[0]}</span>
                )}
              </div>
              <h2 className="mt-3 text-lg font-bold text-fg">{selectedChar.name}</h2>
              <span className="text-xs text-fg-3">《{selectedChar.origin}》</span>
              
              <button
                onClick={() => {
                  setSelectedChar(null);
                  handleReset();
                }}
                className="mt-4 flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-fg-2 hover:bg-card transition-colors"
              >
                <RotateCcw className="h-3 w-3" /> 다른 캐릭터 선택
              </button>
            </div>

            {/* 에이전트 조언 말풍선 (세리프 서체 적용) */}
            <div className="flex-1 rounded-2xl border border-line bg-card/40 p-5 min-h-[180px] max-h-[350px] overflow-y-auto flex flex-col" ref={interpretationRef}>
              <span className="text-[10px] tracking-wider text-accent uppercase font-bold mb-2">AGENTS'S READING</span>
              <div className="font-serif text-sm leading-relaxed text-fg-2 whitespace-pre-wrap">
                {isLoading ? (
                  <div className="flex flex-col gap-2">
                    <span className="skeleton h-3 w-full" />
                    <span className="skeleton h-3 w-5/6" />
                    <span className="skeleton h-3 w-4/5" />
                    <span className="skeleton h-3 w-2/3" />
                  </div>
                ) : typedInterpretation ? (
                  typedInterpretation
                ) : (
                  `"${selectedChar.greeting}"`
                )}
              </div>
            </div>
          </aside>

          {/* 오른쪽: 메인 입력 및 결과창 (8/12 cols) */}
          <main className="lg:col-span-8 flex flex-col gap-6">
            
            {/* 탭 네비게이션 (결과 출력 전일 때만 노출) */}
            {!fortuneResult && !isLoading && (
              <div className="flex rounded-xl border border-line bg-panel/30 p-1">
                <button
                  onClick={() => setActiveTab("saju")}
                  className={cn(
                    "flex-1 rounded-lg py-2.5 text-xs font-semibold transition-all",
                    activeTab === "saju"
                      ? "bg-accent text-on-accent shadow"
                      : "text-fg-3 hover:text-fg"
                  )}
                >
                  사주팔자 / 만세력 성향
                </button>
                <button
                  onClick={() => setActiveTab("tarot")}
                  className={cn(
                    "flex-1 rounded-lg py-2.5 text-xs font-semibold transition-all",
                    activeTab === "tarot"
                      ? "bg-accent text-on-accent shadow"
                      : "text-fg-3 hover:text-fg"
                  )}
                >
                  오늘의 타로 리딩
                </button>
              </div>
            )}

            {/* 컨텐츠 카드 영역 */}
            <div className="rounded-2xl border border-line bg-panel/20 p-6 min-h-[400px] flex flex-col justify-center">
              
              {/* 로딩 표시 */}
              {isLoading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="relative flex h-10 w-10">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-10 w-10 bg-accent/80"></span>
                  </div>
                  <p className="mt-4 font-serif text-sm text-fg-3 animate-pulse">
                    {selectedChar.name}가 당신의 사주와 기운을 읽는 중...
                  </p>
                </div>
              )}

              {/* 결과 출력창 */}
              {!isLoading && fortuneResult && (
                <div className="space-y-8 animate-reveal">
                  
                  {/* 결과 상단 공통 헤더 */}
                  <div className="border-b border-line/60 pb-4 flex justify-between items-center">
                    <div>
                      <h3 className="text-xl font-extrabold text-fg font-display uppercase tracking-tight">
                        {activeTab === "saju" ? "SAJU MANSE" : "TAROT READING"}
                      </h3>
                      <p className="text-xs text-fg-3 mt-0.5">
                        {activeTab === "saju" ? "생년월일 오행 밸런스 결과" : "선택한 카드의 오늘 기운"}
                      </p>
                    </div>
                    <button
                      onClick={handleReset}
                      className="text-xs text-accent hover:underline flex items-center gap-1"
                    >
                      <RotateCcw className="h-3 w-3" /> 다시 보기
                    </button>
                  </div>

                  {/* 사주 전용 결과 디스플레이 */}
                  {activeTab === "saju" && fortuneResult.saju && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* 사주 8자 격자 표 */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-fg-3 uppercase tracking-wider">사주 원판 (四柱八字)</h4>
                        <div className="grid grid-cols-4 gap-2 text-center">
                          {/* 열 헤더: 시, 일, 월, 년 */}
                          {["시주", "일주", "월주", "년주"].map((h, i) => (
                            <div key={i} className="text-[10px] font-bold text-fg-3 border-b border-line pb-1">
                              {h}
                            </div>
                          ))}
                          
                          {/* 천간행 */}
                          {[
                            fortuneResult.saju.hourPillar,
                            fortuneResult.saju.dayPillar,
                            fortuneResult.saju.monthPillar,
                            fortuneResult.saju.yearPillar
                          ].map((p, i) => {
                            const col = ELEMENT_COLORS[p.elementKan];
                            return (
                              <div key={i} className={cn("rounded-lg p-2 flex flex-col items-center justify-center border border-line/40", col.bg)}>
                                <span className={cn("text-2xl font-bold font-display", col.text)}>{p.kan}</span>
                                <span className="text-[10px] text-fg-3 mt-0.5">{p.kanKorean} ({p.elementKan})</span>
                              </div>
                            );
                          })}

                          {/* 지지행 */}
                          {[
                            fortuneResult.saju.hourPillar,
                            fortuneResult.saju.dayPillar,
                            fortuneResult.saju.monthPillar,
                            fortuneResult.saju.yearPillar
                          ].map((p, i) => {
                            const col = ELEMENT_COLORS[p.elementJi];
                            return (
                              <div key={i} className={cn("rounded-lg p-2 flex flex-col items-center justify-center border border-line/40", col.bg)}>
                                <span className={cn("text-2xl font-bold font-display", col.text)}>{p.ji}</span>
                                <span className="text-[10px] text-fg-3 mt-0.5">{p.jiKorean} ({p.elementJi})</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* 오행 비율 스펙트럼 바 */}
                      <div className="space-y-4">
                        <h4 className="text-xs font-bold text-fg-3 uppercase tracking-wider">음양오행 강약 비율</h4>
                        <div className="space-y-2.5">
                          {([
                            { key: "wood", label: "목 (Wood)", ratio: fortuneResult.saju.elementsRatio.wood, col: ELEMENT_COLORS["목"] },
                            { key: "fire", label: "화 (Fire)", ratio: fortuneResult.saju.elementsRatio.fire, col: ELEMENT_COLORS["화"] },
                            { key: "earth", label: "토 (Earth)", ratio: fortuneResult.saju.elementsRatio.earth, col: ELEMENT_COLORS["토"] },
                            { key: "metal", label: "금 (Metal)", ratio: fortuneResult.saju.elementsRatio.metal, col: ELEMENT_COLORS["금"] },
                            { key: "water", label: "수 (Water)", ratio: fortuneResult.saju.elementsRatio.water, col: ELEMENT_COLORS["수"] },
                          ]).map((el) => (
                            <div key={el.key} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="font-semibold text-fg-2">{el.label}</span>
                                <span className={cn("font-bold font-display", el.col.text)}>{el.ratio}%</span>
                              </div>
                              {/* 오행 게이지 바 */}
                              <div className="h-2 w-full rounded-full bg-card overflow-hidden">
                                <div 
                                  className={cn("h-full rounded-full transition-all duration-500", el.col.dot)} 
                                  style={{ width: `${el.ratio}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 타로 전용 결과 디스플레이 */}
                  {activeTab === "tarot" && fortuneResult.card && (
                    <div className="flex flex-col md:flex-row gap-6 items-center">
                      
                      {/* 타로 카드 앞면 타이포그래픽 포스터 */}
                      <div className="w-52 shrink-0 aspect-[2/3.5] rounded-2xl border-2 border-accent/40 bg-gradient-to-b from-panel to-card p-4 flex flex-col justify-between text-center relative overflow-hidden shadow-[0_12px_24px_-10px_rgba(230,85,35,0.15)]">
                        {/* 신비로운 배경 광선 효과 */}
                        <div className="absolute -top-10 -left-10 w-24 h-24 rounded-full bg-accent/10 blur-xl pointer-events-none" />
                        <div className="absolute -bottom-10 -right-10 w-24 h-24 rounded-full bg-accent/10 blur-xl pointer-events-none" />
                        
                        <div className="border-b border-line pb-2">
                          <span className="font-display text-xs font-bold text-accent tracking-widest uppercase">
                            NO. {fortuneResult.card.id}
                          </span>
                        </div>
                        
                        <div className="py-8 flex flex-col justify-center flex-1">
                          <span className="font-display text-lg font-bold text-fg-2 uppercase tracking-wide">
                            {fortuneResult.card.nameEn}
                          </span>
                          <span className="font-serif text-2xl font-bold text-fg mt-1">
                            {fortuneResult.card.name}
                          </span>
                          <span className="text-[10px] text-accent mt-2 font-bold uppercase tracking-wider">
                            {fortuneResult.card.type === "upright" ? "정방향 (Upright)" : "역방향 (Reversed)"}
                          </span>
                        </div>

                        <div className="border-t border-line pt-2 flex flex-wrap justify-center gap-1">
                          {fortuneResult.card.keywords.slice(0, 3).map((kw, i) => (
                            <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-card text-fg-3 border border-line/40">
                              #{kw.replace("(장해/과잉)", "")}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* 타로 카드 풀이 */}
                      <div className="flex-1 space-y-4 text-left">
                        <div className="space-y-1">
                          <span className="text-[10px] tracking-wider text-accent uppercase font-bold">CARD OVERVIEW</span>
                          <h4 className="text-lg font-bold text-fg">
                            {fortuneResult.card.name} 카드의 수호 메시지
                          </h4>
                        </div>
                        <p className="text-sm leading-relaxed text-fg-3">
                          오늘 당신이 드로우한 <strong>{fortuneResult.card.name}</strong> 카드는 {fortuneResult.card.type === "upright" ? "순리적인 출발과 원활한 조화" : "통제하기 어려운 과잉 혹은 억압 상태"}를 상징합니다. 
                          이 기운에 매핑되는 캐릭터 조언을 곱씹으며 오늘 하루 조심스러운 균형을 잡아보시길 바랍니다.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 행운의 웹툰/웹소설 추천 영역 */}
                  <div className="border-t border-line/80 pt-6">
                    <h4 className="text-xs font-bold text-fg-3 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-accent" />
                      <span>{selectedChar.name}가 당신에게 제안하는 행운의 타이틀</span>
                    </h4>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      {fortuneResult.recommendations.map((title) => (
                        <TitleCard key={title.id} title={title} size="sm" />
                      ))}
                    </div>
                  </div>

                </div>
              )}

              {/* 입력 폼: 사주 */}
              {!isLoading && !fortuneResult && activeTab === "saju" && (
                <form onSubmit={handleAnalyzeSaju} className="space-y-5 max-w-md mx-auto w-full text-left">
                  <div className="text-center mb-6">
                    <h3 className="text-lg font-bold text-fg">사주팔자 분석 정보 입력</h3>
                    <p className="text-xs text-fg-3 mt-1">정확한 연산을 위해 생년월일시를 입력하세요.</p>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label htmlFor="birth-date" className="text-xs font-semibold text-fg-2 flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-fg-3" /> 생년월일 (양력 기준)
                    </label>
                    <input
                      id="birth-date"
                      type="date"
                      required
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="birth-time" className="text-xs font-semibold text-fg-2 flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-fg-3" /> 태어난 시간 (선택사항)
                    </label>
                    <input
                      id="birth-time"
                      type="time"
                      value={birthTime}
                      onChange={(e) => setBirthTime(e.target.value)}
                      className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-fg-2 flex items-center gap-1">
                      <User className="h-3.5 w-3.5 text-fg-3" /> 성별 (선택사항)
                    </div>
                    <div className="flex gap-2">
                      {["none", "male", "female"].map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setGender(g)}
                          className={cn(
                            "flex-1 rounded-lg border py-2 text-xs font-semibold transition-all",
                            gender === g
                              ? "border-accent bg-accent-soft text-accent"
                              : "border-line bg-card text-fg-3 hover:text-fg"
                          )}
                        >
                          {g === "none" ? "선택 안 함" : g === "male" ? "남성" : "여성"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full mt-6 rounded-lg bg-accent py-3 text-xs font-bold text-on-accent hover:bg-accent-2 transition-colors flex items-center justify-center gap-2"
                  >
                    <span>{selectedChar.name}에게 사주 풀이받기</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </form>
              )}

              {/* 인터랙션: 타로 */}
              {!isLoading && !fortuneResult && activeTab === "tarot" && (
                <div className="space-y-6 text-center max-w-lg mx-auto w-full">
                  {tarotStep === "idle" && (
                    <div className="py-12 space-y-4">
                      <h3 className="text-lg font-bold text-fg">오늘의 타로 리딩</h3>
                      <p className="text-xs text-fg-3 max-w-sm mx-auto leading-relaxed">
                        차분하게 정신을 집중하고, 마우스를 통해 카드를 섞은 뒤 오늘의 조언을 줄 한 장의 카드를 직접 뽑아보세요.
                      </p>
                      <button
                        onClick={startTarotShuffle}
                        className="rounded-lg bg-accent px-6 py-2.5 text-xs font-bold text-on-accent hover:bg-accent-2 transition-colors"
                      >
                        타로 카드 섞기 시작
                      </button>
                    </div>
                  )}

                  {/* 셔플링 애니메이션 */}
                  {tarotStep === "shuffling" && (
                    <div className="py-16 space-y-6">
                      <div className="flex justify-center items-center gap-3">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            animate={{
                              x: [0, (i - 1) * 60, 0],
                              y: [0, -10, 0],
                              scale: [1, 1.05, 1],
                              rotate: [0, (i - 1) * 15, 0]
                            }}
                            transition={{
                              duration: 1.2,
                              repeat: Infinity,
                              ease: "easeInOut"
                            }}
                            className="w-24 aspect-[2/3.5] rounded-xl border border-accent/30 bg-gradient-to-b from-panel to-card"
                          />
                        ))}
                      </div>
                      <p className="text-xs text-fg-3 animate-pulse">카드를 엄숙히 섞고 있습니다...</p>
                    </div>
                  )}

                  {/* 카드 드로우 선택 단계 */}
                  {tarotStep === "spread" && (
                    <div className="py-8 space-y-6">
                      <h3 className="text-sm font-bold text-fg-2">오늘의 대답을 전해줄 카드를 한 장 터치하세요.</h3>
                      <div className="flex justify-center gap-4">
                        {[0, 1, 2].map((idx) => (
                          <motion.button
                            key={idx}
                            type="button"
                            whileHover={{ y: -10, scale: 1.03 }}
                            onClick={() => handleSelectTarotCard(idx)}
                            className="w-28 cursor-pointer aspect-[2/3.5] rounded-xl border border-line bg-gradient-to-br from-panel/90 to-card flex items-center justify-center relative overflow-hidden transition-colors hover:border-accent focus:outline-none"
                          >
                            {/* 카드 뒷면 무늬 장식 */}
                            <div className="absolute inset-2 border border-line-strong/50 rounded-lg flex items-center justify-center">
                              <Sparkles className="h-6 w-6 text-accent-soft" />
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          </main>

        </div>
      )}
    </div>
  );
}
