// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useI18n } from '@/shared/lib/i18n';
import { WorkflowIllustration } from './WorkflowIllustration';
import { WORKFLOW_VISUAL_COPY, workflowIllustrationSource } from './workflow-illustration';

const originalLanguage = useI18n.getState().lang;
beforeEach(() => useI18n.setState({ lang: 'ko' }));
afterEach(() => { cleanup(); useI18n.setState({ lang: originalLanguage }); });

function failBoth(image: HTMLElement) {
  fireEvent.error(image);
  fireEvent.error(image);
}

describe('설명 이미지의 최종 실패 상태', () => {
  it('대체 아트까지 실패하면 깨진 이미지를 숨기고 의미와 작업 링크를 보존한다', () => {
    render(<a href="/story-lab" aria-label="기획 시작"><WorkflowIllustration kind="plan" /></a>);
    const image = screen.getByRole<HTMLImageElement>('img');
    failBoth(image);
    expect(image?.hidden).toBe(true);
    expect(image?.getAttribute('src')).toBe('/brand/illustrated-20260928/storyboard-320.webp');
    expect(screen.getByRole('img', { name: WORKFLOW_VISUAL_COPY.plan.ko }).tagName).toBe('SPAN');
    expect(screen.getByText('이미지 없음')).toBeTruthy();
    const action = screen.getByRole('link', { name: '기획 시작' });
    expect(action.getAttribute('href')).toBe('/story-lab');
    action.focus();
    expect(document.activeElement).toBe(action);
  });
  it('이미지 종류를 바꾸고 돌아와도 이미 실패한 주소를 반복 요청하지 않는다', () => {
    const view = render(<WorkflowIllustration kind="review" />);
    const image = screen.getByRole<HTMLImageElement>('img');
    failBoth(image);
    view.rerender(<WorkflowIllustration kind="plan" />);
    expect(image.hidden).toBe(false);
    expect(image.getAttribute('src')).toBe(workflowIllustrationSource('plan'));
    failBoth(image);
    view.rerender(<WorkflowIllustration kind="review" />);
    expect(image.hidden).toBe(true);
    expect(image.getAttribute('src')).toBe('/brand/illustrated-20260928/canvas-noir-320.webp');
    expect(image.hasAttribute('srcset')).toBe(false);
  });
  it('최종 실패 안내는 언어 변경을 반영하고 장식 이미지의 접근성 이름을 추가하지 않는다', () => {
    const view = render(<WorkflowIllustration kind="assets" />);
    failBoth(screen.getByRole('img'));
    act(() => useI18n.setState({ lang: 'en' }));
    expect(screen.getByRole('img', { name: WORKFLOW_VISUAL_COPY.assets.en })).toBeTruthy();
    expect(screen.getByText('Image unavailable')).toBeTruthy();
    view.rerender(<WorkflowIllustration kind="assets" decorative />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(view.container.querySelector('.workflow-illustration__unavailable')?.getAttribute('aria-hidden')).toBe('true');
  });
});
