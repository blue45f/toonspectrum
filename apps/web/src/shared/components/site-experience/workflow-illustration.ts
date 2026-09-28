export const WORKFLOW_VISUALS = ['plan', 'storyboard', 'create', 'collaborate', 'review', 'publish', 'assets', 'learn', 'ai', 'recovery', 'rights', 'community'] as const;
export type WorkflowVisual = (typeof WORKFLOW_VISUALS)[number];
export const WORKFLOW_ART_ROOT = '/brand/workflow-20260928';

/** 실제 작업 결과가 아니라 각 도구가 무엇을 하는지 설명하는 브랜드 이미지다. */
export const WORKFLOW_VISUAL_COPY: Readonly<Record<WorkflowVisual, { ko: string; en: string; fallback: string }>> = {
  plan: { ko: '대본과 인물 관계도로 이야기의 기준을 세우는 모습', en: 'A script and character map establish the story', fallback: 'storyboard' },
  storyboard: { ko: '대본을 순서가 있는 장면과 컷으로 나누는 모습', en: 'A script becomes ordered scenes and storyboard panels', fallback: 'storyboard' },
  create: { ko: '선화를 채색하고 3D 포즈를 참고해 원고를 완성하는 모습', en: 'Line art becomes color artwork with a 3D pose reference', fallback: 'hero' },
  collaborate: { ko: '담당자별 작업 카드를 다음 제작 단계로 인계하는 모습', en: 'Teammates hand task cards to the next production stage', fallback: 'materials' },
  review: { ko: '원고의 수정 위치에 의견을 남기고 수정본을 검토하는 모습', en: 'Annotations identify changes before a revised panel is reviewed', fallback: 'canvas-noir' },
  publish: { ko: '완성 원고를 휴대전화에서 미리 보고 내보내는 모습', en: 'Finished panels are previewed on a phone before export', fallback: 'project-romance' },
  assets: { ko: '브러시·캐릭터·배경 소재를 골라 원고에 추가하는 모습', en: 'Brushes, characters and backgrounds are selected for a manuscript', fallback: 'materials' },
  learn: { ko: '단계별 예제와 완성 원고를 비교하며 제작 방법을 익히는 모습', en: 'Step-by-step examples are compared with finished artwork', fallback: 'background-classroom' },
  ai: { ko: '창작 도우미가 제안한 여러 후보 중 사용자가 하나를 선택하는 모습', en: 'The creator chooses one of several assistant suggestions', fallback: 'luna' },
  recovery: { ko: '시간순으로 남은 이전 원고 버전에서 작업을 복구하는 모습', en: 'A previous manuscript version is selected for recovery', fallback: 'canvas-noir' },
  rights: { ko: '원고와 사용 권리 확인서를 함께 점검하는 모습', en: 'A manuscript and its usage-rights checklist are inspected together', fallback: 'materials' },
  community: { ko: '여러 창작자의 작품을 모아 보고 의견을 나누는 모습', en: 'Creators browse a gallery and exchange feedback', fallback: 'project-romance' },
};

export function workflowIllustrationSource(kind: WorkflowVisual, width: 320 | 640 | 960 = 640): string {
  return `${WORKFLOW_ART_ROOT}/${kind}-${width}.webp`;
}

export function workflowIllustrationSources(kind: WorkflowVisual): string {
  return ([320, 640, 960] as const).map((width) => `${workflowIllustrationSource(kind, width)} ${width}w`).join(', ');
}
