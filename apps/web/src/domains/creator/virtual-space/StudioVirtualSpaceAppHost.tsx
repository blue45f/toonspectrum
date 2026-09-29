import { useEffect, useState } from "react";
import { ArrowLeft, Check, Grid3X3, Play, RotateCcw, Timer, X } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  drawPosePrompt,
  findStoreApp,
  gradeQuiz,
  launchAppSession,
  listConteTemplates,
  listPosePrompts,
  listQuizQuestions,
  type StudioVirtualSpaceAppSession,
  type StudioVirtualSpacePosePrompt,
} from "./studio-virtual-space-app-store";

interface StudioVirtualSpaceAppHostProps {
  readonly installedAppIds: readonly string[];
  readonly onOpenStore?: () => void;
}

type Bilingual = readonly [ko: string, en: string];

/* ---------------- 콘티 템플릿 팩 ---------------- */

function ConteTemplatePackBody({ bt }: { readonly bt: (ko: string, en: string) => string }) {
  const templates = listConteTemplates();
  return (
    <div>
      <p>{bt("컷을 나누기 전에 템플릿을 고르세요.", "Pick a template before splitting your cuts.")}</p>
      <ul>
        {templates.map((template) => (
          <li key={template.id}>
            <strong>{bt(...template.name)}</strong>
            <span>{bt(...template.description)}</span>
            <small>{bt(`${template.panelCount}컷`, `${template.panelCount} panels`)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- 작화 퀴즈 ---------------- */

function DrawingQuizBody({ bt }: { readonly bt: (ko: string, en: string) => string }) {
  const questions = listQuizQuestions();
  const [answers, setAnswers] = useState<readonly (number | null)[]>(() => questions.map(() => null));
  const [submitted, setSubmitted] = useState(false);
  const grade = submitted ? gradeQuiz(answers.map((answer) => answer ?? -1)) : null;

  const choose = (questionIndex: number, choiceIndex: number) => {
    if (submitted) return;
    setAnswers((prev) => prev.map((answer, index) => (index === questionIndex ? choiceIndex : answer)));
  };

  const reset = () => {
    setAnswers(questions.map(() => null));
    setSubmitted(false);
  };

  return (
    <div>
      <p>{bt("작화 기초 객관식 퀴즈입니다. 답을 고르고 채점하세요.", "A drawing-fundamentals quiz. Choose answers, then grade.")}</p>
      {grade ? (
        <p role="status">
          {bt(`채점 결과: ${grade.total}문제 중 ${grade.score}문제 정답`, `Score: ${grade.score} of ${grade.total} correct`)}
        </p>
      ) : null}
      <ol>
        {questions.map((question, questionIndex) => (
          <li key={question.id}>
            <fieldset disabled={submitted}>
              <legend>{bt(...question.prompt)}</legend>
              {question.choices.map((choice: Bilingual, choiceIndex: number) => {
                const isAnswer = choiceIndex === question.answerIndex;
                const isPicked = answers[questionIndex] === choiceIndex;
                return (
                  <label key={choiceIndex}>
                    <input
                      type="radio"
                      name={`quiz-${question.id}`}
                      checked={isPicked}
                      onChange={() => choose(questionIndex, choiceIndex)}
                    />
                    {bt(...choice)}
                    {submitted && isAnswer ? <Check size={14} aria-label={bt("정답", "Correct answer")} /> : null}
                    {submitted && isPicked && !isAnswer ? <X size={14} aria-label={bt("오답", "Wrong answer")} /> : null}
                  </label>
                );
              })}
            </fieldset>
          </li>
        ))}
      </ol>
      <div>
        {submitted
          ? <button type="button" onClick={reset}><RotateCcw size={16} aria-hidden />{bt("다시 풀기", "Try again")}</button>
          : <button type="button" onClick={() => setSubmitted(true)} disabled={answers.some((answer) => answer === null)}>
              {bt("채점하기", "Grade")}
            </button>}
      </div>
    </div>
  );
}

/* ---------------- 포즈 챌린지 ---------------- */

function PoseChallengeBody({ bt }: { readonly bt: (ko: string, en: string) => string }) {
  const [seed, setSeed] = useState(() => Date.now());
  const [prompt, setPrompt] = useState<StudioVirtualSpacePosePrompt>(() => drawPosePrompt(seed));
  const [remainingSec, setRemainingSec] = useState(prompt.durationSec);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    if (remainingSec <= 0) {
      setRunning(false);
      return;
    }
    const timer = window.setInterval(() => {
      setRemainingSec((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, remainingSec]);

  const redraw = () => {
    const nextSeed = Date.now();
    setSeed(nextSeed);
    const next = drawPosePrompt(nextSeed);
    setPrompt(next);
    setRemainingSec(next.durationSec);
    setRunning(false);
  };

  const start = () => {
    setRemainingSec(prompt.durationSec);
    setRunning(true);
  };

  return (
    <div>
      <p>{bt("주제를 뽑고 타이머가 끝나기 전에 포즈를 그리세요.", "Draw the pose prompt before the timer runs out.")}</p>
      <div>
        <strong>{bt(...prompt.prompt)}</strong>
        <small>{bt(`제한 시간 ${prompt.durationSec}초`, `${prompt.durationSec}-second limit`)}</small>
      </div>
      <p role="timer" aria-live="polite">
        <Timer size={16} aria-hidden />
        {remainingSec <= 0
          ? bt("시간 종료!", "Time's up!")
          : bt(`남은 시간 ${remainingSec}초`, `${remainingSec}s left`)}
      </p>
      <div>
        {!running && remainingSec > 0
          ? <button type="button" onClick={start}><Play size={16} aria-hidden />{bt("시작", "Start")}</button>
          : null}
        <button type="button" onClick={redraw}><RotateCcw size={16} aria-hidden />{bt("주제 다시 뽑기", "Draw again")}</button>
      </div>
      <p><small>{bt(`주제 ${listPosePrompts().length}종 중 무작위 출제`, `Random pick from ${listPosePrompts().length} prompts`)}</small></p>
    </div>
  );
}

/* ---------------- 호스트 ---------------- */

/**
 * 가상공간 앱 호스트(D-5). 설치된 앱을 실행하는 패널로, 앱별 렌더를 분기한다.
 * 실제 iframe 샌드박스 임베드는 후속 티켓(E-4) 범위이며, 1차는 로컬 렌더만 제공한다.
 */
export function StudioVirtualSpaceAppHost({ installedAppIds, onOpenStore }: StudioVirtualSpaceAppHostProps) {
  const bt = useBilingual("StudioVirtualSpaceAppHost");
  const [activeAppId, setActiveAppId] = useState<string | null>(null);
  const [session, setSession] = useState<StudioVirtualSpaceAppSession | null>(null);

  const installedApps = installedAppIds
    .map((id) => findStoreApp(id))
    .filter((app): app is NonNullable<typeof app> => app !== null);

  const openApp = (appId: string) => {
    const result = launchAppSession(installedAppIds, appId);
    if (result.ok) {
      setSession(result.session);
      setActiveAppId(appId);
    }
  };

  const closeApp = () => {
    setActiveAppId(null);
    setSession(null);
  };

  const activeApp = activeAppId ? findStoreApp(activeAppId) : null;

  return (
    <section className="studio-vspace-app-host" aria-label={bt("설치된 앱 실행", "Launch installed apps")}>
      <header>
        {activeApp ? (
          <button type="button" onClick={closeApp}>
            <ArrowLeft size={16} aria-hidden />{bt("앱 목록으로", "Back to apps")}
          </button>
        ) : null}
        <h2><Grid3X3 size={18} aria-hidden />{bt("내 앱", "My Apps")}</h2>
      </header>

      {!activeApp ? (
        installedApps.length ? (
          <ul>
            {installedApps.map((app) => (
              <li key={app.id}>
                <button type="button" onClick={() => openApp(app.id)}>
                  <strong>{bt(...app.name)}</strong>
                  <small>{bt(...app.description)}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div>
            <p>{bt("설치된 앱이 없어요. 스토어에서 미니 앱을 설치하세요.", "No apps installed yet. Install mini apps from the store.")}</p>
            {onOpenStore ? <button type="button" onClick={onOpenStore}>{bt("스토어 열기", "Open store")}</button> : null}
          </div>
        )
      ) : (
        <div>
          <header>
            <h3>{bt(...activeApp.name)}</h3>
            {session ? <small>{bt(`세션 시작 ${new Date(session.startedAt).toLocaleTimeString()}`, `Session started ${new Date(session.startedAt).toLocaleTimeString()}`)}</small> : null}
          </header>
          {activeApp.id === "conte-template-pack" ? <ConteTemplatePackBody bt={bt} />
            : activeApp.id === "drawing-quiz" ? <DrawingQuizBody bt={bt} />
            : <PoseChallengeBody bt={bt} />}
        </div>
      )}
    </section>
  );
}
