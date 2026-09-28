// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useI18n } from '@/shared/lib/i18n';
import { WorkflowIllustration } from './WorkflowIllustration';
import { WORKFLOW_VISUALS, WORKFLOW_VISUAL_COPY, workflowIllustrationSource } from './workflow-illustration';
import { SiteArtwork } from './SiteArtwork';

const originalLanguage = useI18n.getState().lang;
beforeEach(() => useI18n.setState({ lang: 'ko' }));
afterEach(() => { cleanup(); useI18n.setState({ lang: originalLanguage }); });

describe('역할별 설명 일러스트', () => {
  it.each(WORKFLOW_VISUALS)('%s의 설명·예약 크기·반응형·지연 로딩을 제공한다', (kind) => {
    render(<WorkflowIllustration kind={kind} />);
    const image = screen.getByRole('img', { name: WORKFLOW_VISUAL_COPY[kind].ko });
    expect(image.getAttribute('src')).toBe(workflowIllustrationSource(kind));
    expect(image.getAttribute('srcset')).toContain(`${kind}-320.webp 320w`);
    expect(image.getAttribute('srcset')).toContain(`${kind}-960.webp 960w`);
    expect(image.getAttribute('width')).toBe('960');
    expect(image.getAttribute('height')).toBe('600');
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.closest('[data-visual-purpose]')?.getAttribute('data-visual-purpose')).toBe(kind);
  });
  it('언어 변경을 즉시 반영하고 장식 이미지의 빈 대체텍스트는 유지한다', () => {
    const view = render(<WorkflowIllustration kind="review" />);
    act(() => useI18n.setState({ lang: 'en' }));
    expect(screen.getByRole('img').getAttribute('alt')).toBe(WORKFLOW_VISUAL_COPY.review.en);
    view.rerender(<WorkflowIllustration kind="review" decorative />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(view.container.querySelector('img')?.getAttribute('alt')).toBe('');
  });
  it('이미지 오류는 정해진 기존 아트로 한 번 복구하고 호출 루프를 만들지 않는다', () => {
    const view = render(<WorkflowIllustration kind="review" />);
    const image = screen.getByRole('img');
    fireEvent.error(image);
    expect(image.getAttribute('src')).toBe('/brand/illustrated-20260928/canvas-noir-320.webp');
    expect(image.hasAttribute('srcset')).toBe(false);
    fireEvent.error(image);
    expect(image.getAttribute('src')).toBe('/brand/illustrated-20260928/canvas-noir-320.webp');
    view.rerender(<WorkflowIllustration kind="plan" />);
    expect(image.getAttribute('src')).toBe(workflowIllustrationSource('plan'));
  });
  it('기존 이미지 관찰 모드도 역할 아트를 표시하고 실패 후 다시 순환하지 않는다', () => {
    const view = render(<SiteArtwork image="world" purpose="learn" alt="학습" view="composition" />);
    const image = screen.getByRole('img');
    expect(image.getAttribute('src')).toBe(workflowIllustrationSource('learn'));
    expect(view.container.querySelector('[data-artwork-view="composition"]')).not.toBeNull();
    fireEvent.error(image);
    expect(image.getAttribute('src')).not.toBe(workflowIllustrationSource('learn'));
    fireEvent.error(image);
    expect(image.getAttribute('src')).not.toBe(workflowIllustrationSource('learn'));
  });
});
