import { useState } from 'react';
import { useI18n } from '@/shared/lib/i18n';
import { WORKFLOW_VISUAL_COPY, workflowIllustrationSource, workflowIllustrationSources, type WorkflowVisual } from './workflow-illustration';
import './workflow-illustration.css';

type Props = {
  readonly kind: WorkflowVisual;
  readonly className?: string;
  readonly decorative?: boolean;
  readonly priority?: boolean;
  readonly sizes?: string;
};

/** 이미지만 실패해도 작업 제목·버튼과 원고 상태는 그대로 남는다. */
export function WorkflowIllustration({ kind, className = '', decorative = false, priority = false, sizes = '(max-width: 767px) calc(100vw - 48px), 30vw' }: Props) {
  const korean = useI18n((state) => state.lang.startsWith('ko'));
  const [failedKind, setFailedKind] = useState<WorkflowVisual | null>(null);
  const fallback = failedKind === kind;
  const copy = WORKFLOW_VISUAL_COPY[kind];
  const description = korean ? copy.ko : copy.en;
  return <span className={`workflow-illustration ${className}`} data-visual-purpose={kind} data-artwork-concept="true" data-artwork-fallback={fallback || undefined}>
    <img src={fallback ? `/brand/illustrated-20260928/${copy.fallback}-320.webp` : workflowIllustrationSource(kind)}
      srcSet={fallback ? undefined : workflowIllustrationSources(kind)} sizes={sizes} width={960} height={600}
      loading={priority ? 'eager' : 'lazy'} decoding="async" fetchPriority={priority ? 'high' : 'auto'} draggable={false}
      alt={decorative ? '' : fallback ? (korean ? '작업을 설명하는 브랜드 콘셉트 아트' : 'Brand concept art illustrating the task') : description}
      onError={fallback ? undefined : () => setFailedKind(kind)} />
  </span>;
}
