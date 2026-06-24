// 운세 웹툰 패널(컷) — 백엔드 fortune.service의 FortunePanel과 동일 형태.
// 백엔드가 [N컷 - 묘사] + 이름: "대사" 콘티를 파싱해 내려준다.

export interface FortunePanelLine {
  speaker: string; // 화자 이름. 나레이션이면 빈 문자열
  characterId: string | null; // 매칭된 캐릭터 id (ara/danwoo/leona/gaon)
  text: string;
  sfx?: string; // 효과음(있으면 컷에 스티커로 표시)
}

export interface FortunePanel {
  scene: string | null; // 컷의 장면 묘사
  lines: FortunePanelLine[];
}

export interface FortuneCharacterInfo {
  id: string;
  name: string;
  origin: string;
  greeting: string;
  avatarUrl: string;
}

// 재생 타임라인의 한 스텝 — 패널의 각 대사/나레이션(라인 인덱스 포함).
// 오케스트레이터가 이 순서대로 음성+애니메이션을 진행한다.
export interface PlaybackStep {
  panel: number; // 패널(컷) 인덱스
  line: number; // 패널 내 line 인덱스 (panel.lines 기준)
  text: string;
  characterId: string | null;
}

// 패널 배열 → 스텝 시퀀스. 빈 텍스트·효과음 전용 줄은 건너뛴다.
export function buildSteps(panels: FortunePanel[]): PlaybackStep[] {
  const steps: PlaybackStep[] = [];
  panels.forEach((panel, panelIndex) => {
    panel.lines.forEach((line, lineIndex) => {
      const text = line.text?.trim();
      if (!text) return;
      steps.push({ panel: panelIndex, line: lineIndex, text, characterId: line.characterId });
    });
  });
  return steps;
}
