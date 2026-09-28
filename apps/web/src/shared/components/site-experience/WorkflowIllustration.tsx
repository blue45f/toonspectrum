import { useState } from 'react';
import { ImageOff } from 'lucide-react';
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
type ImageFailure = 'fallback' | 'unavailable';

/** 이미지와 대체 아트가 모두 실패해도 작업 제목·버튼과 원고 상태는 유지한다. */
export function WorkflowIllustration({ kind, className = '', decorative = false, priority = false, sizes = '(max-width: 767px) calc(100vw - 48px), 30vw' }: Props) {
  const korean = useI18n((state) => state.lang.startsWith('ko'));
  const [failures, setFailures] = useState<Partial<Record<WorkflowVisual, ImageFailure>>>({});
  const failure = failures[kind];
  const fallback = failure !== undefined;
  const unavailable = failure === 'unavailable';
  const copy = WORKFLOW_VISUAL_COPY[kind];
  const description = korean ? copy.ko : copy.en;
  const markFailure = () => setFailures((current) => ({ ...current, [kind]: fallback ? 'unavailable' : 'fallback' }));
  return <span className={`workflow-illustration ${className}`} data-visual-purpose={kind} data-artwork-concept="true" data-artwork-fallback={fallback || undefined} data-artwork-unavailable={unavailable || undefined}>
    <img src={fallback ? `/brand/illustrated-20260928/${copy.fallback}-320.webp` : workflowIllustrationSource(kind)}
      srcSet={fallback ? undefined : workflowIllustrationSources(kind)} sizes={sizes} width={960} height={600}
      loading={priority ? 'eager' : 'lazy'} decoding="async" fetchPriority={priority ? 'high' : 'auto'} draggable={false}
      hidden={unavailable} aria-hidden={unavailable || undefined}
      alt={decorative ? '' : fallback ? (korean ? '작업을 설명하는 브랜드 콘셉트 아트' : 'Brand concept art illustrating the task') : description}
      onError={unavailable ? undefined : markFailure} />
    {unavailable ? <span className="workflow-illustration__unavailable" role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : description} aria-hidden={decorative || undefined}>
      <ImageOff size={20} aria-hidden="true" />
      <span>{korean ? '이미지 없음' : 'Image unavailable'}</span>
    </span> : null}
  </span>;
}
