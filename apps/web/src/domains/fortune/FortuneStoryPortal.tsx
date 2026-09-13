import { useState } from "react";
import { ArrowRight, BookOpen, ShieldCheck, Sparkles } from "lucide-react";
import { FORTUNE_EXPERIENCES, fortuneKstDate } from "@toonspectrum/core/fortune";
import { FortuneSceneArt } from "./FortuneSceneArt";
import { FORTUNE_INTENTS } from "./fortune-cinematic-model";

export function FortuneStoryPortal({ onNavigate, compact = false }: { onNavigate: (id: string) => void; compact?: boolean }) {
  const [intent, setIntent] = useState<(typeof FORTUNE_INTENTS)[number]>(FORTUNE_INTENTS[0]);
  return <header className="fo-cinema-hero" data-theme={intent.theme} data-compact={compact}>
    <div className="fo-cinema-heading">
      <p className="fo-eyebrow"><span /> TOONSTUDIO ORIGINAL · FORTUNE</p>
      <p className="fo-issue-label">오늘의 나를 위한 짧은 에피소드 <span>{fortuneKstDate().slice(5).replace("-", ".")}</span></p>
      <h1>나의 다음 장면,<br /><em>운세 관측소</em></h1>
      <p className="fo-cinema-lead">운명을 정하는 대신, 이야기를 펼쳐요.<br />사주부터 타로까지, 나를 발견하는 웹툰 같은 시간.</p>
      <div className="fo-hero-actions">
        <button type="button" className="fo-button fo-primary" onClick={() => onNavigate("saju")}>내 사주 펼치기 <ArrowRight size={17} /></button>
        <button type="button" className="fo-button" onClick={() => onNavigate("tarot-three")}><Sparkles size={16} />카드로 시작하기</button>
      </div>
      <p className="fo-privacy"><ShieldCheck size={15} />로그인 없이 무료 · 관측소 입력은 내 브라우저에서만 계산</p>
    </div>
    <div className="fo-comic-cover" aria-label="달빛 작업실의 오리지널 웹툰 일러스트">
      <div className="fo-comic-caption"><span>EP. 01</span><span>달빛 아래, 나의 첫 장</span><BookOpen size={15} /></div>
      <div className="fo-cover-art"><FortuneSceneArt theme={intent.theme} /><span className="fo-comic-sfx" aria-hidden="true">반짝!</span><div className="fo-cover-dialogue" aria-live="polite"><strong>{intent.title}</strong><p>{intent.line}</p></div></div>
      <div className="fo-comic-ending"><span>TO BE CONTINUED</span><span>결말은, 당신의 손끝에서. ↗</span></div>
    </div>
    <section className="fo-intent-picker" aria-labelledby="fo-intent-title">
      <div className="fo-intent-title"><h2 id="fo-intent-title">어떤 장면이 필요한가요?</h2><span>지금의 마음으로 골라요</span></div>
      <div className="fo-intent-buttons">{FORTUNE_INTENTS.map((item, i) => <button type="button" key={item.id} aria-pressed={intent.id === item.id} onClick={() => setIntent(item)}><span aria-hidden="true">0{i + 1}</span>{item.label}</button>)}</div>
      <div className="fo-intent-recommendations" aria-label={`${intent.label} 추천 콘텐츠`}>
        {intent.content.map((id) => { const item = FORTUNE_EXPERIENCES.find((entry) => entry.id === id); return item ? <button type="button" key={id} onClick={() => onNavigate(id)}><span className="fo-intent-glyph" aria-hidden="true">{item.glyph}</span><span><strong>{item.title}</strong><small>{item.input === "none" ? "개인정보 없이 바로 시작" : item.subtitle}</small></span><ArrowRight size={17} /></button> : null; })}
      </div>
    </section>
    <div className="fo-cinema-footer"><span>{FORTUNE_EXPERIENCES.length}개의 발견</span><span>웹툰 모드 · 상세 리포트</span><span>정해진 결말 없는, 나의 이야기</span></div>
  </header>;
}

export function FortuneJourney({ hasReading, running }: { hasReading: boolean; running: boolean }) {
  const active = hasReading ? 2 : 1;
  return <ol className="fo-journey" aria-label="운세 읽기 진행 단계">{["이야기 선택", "나의 단서", "해석 펼치기"].map((title, i) => <li key={title} aria-current={active === i ? "step" : undefined} data-done={i < active}><span>{i < active ? "✓" : `0${i + 1}`}</span>{i === 2 && running ? "해석 준비 중" : title}</li>)}</ol>;
}
