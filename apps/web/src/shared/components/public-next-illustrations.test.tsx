// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useI18n } from '@/shared/lib/i18n';
import { PublicSiteNextSteps } from './public-site-next-steps';
import { workflowVisualForPath } from './site-experience/workflow-route-art';

const previousLanguage = useI18n.getState().lang;
afterEach(() => { cleanup(); useI18n.setState({ lang: previousLanguage }); });

describe('다음 작업 이미지와 실제 목적지의 일치', () => {
  it.each(['/learn', '/learn/lessons/color-layers'])('%s의 후속 작업에 서로 다른 소재·기획·갤러리 이미지를 연결한다', async (pathname) => {
    useI18n.setState({ lang: 'ko' });
    await act(async () => { render(<MemoryRouter><PublicSiteNextSteps pathname={pathname} /></MemoryRouter>); });
    const cards = [...document.querySelectorAll('.public-site-next__card')];
    expect(cards.map((card) => card.getAttribute('href'))).toEqual(['/market/browse', '/story-lab', '/showcase']);
    expect(cards.map((card) => card.querySelector('[data-visual-purpose]')?.getAttribute('data-visual-purpose'))).toEqual(['assets', 'plan', 'community']);
    for (const card of cards) {
      const image = card.querySelector('img');
      expect(image?.getAttribute('alt')).toBe('');
      expect(image?.getAttribute('loading')).toBe('lazy');
      expect(image?.getAttribute('srcset')).toContain('320w');
      expect(card.querySelector('h3')?.textContent).toBeTruthy();
      expect(card.querySelectorAll('a, button')).toHaveLength(0);
    }
  });
  it('갤러리와 홍보 영상 제작의 하위 경로를 구별한다', () => {
    expect(workflowVisualForPath('/showcase')).toBe('community');
    expect(workflowVisualForPath('/showcase/works/demo')).toBe('community');
    expect(workflowVisualForPath('/showcase/promo')).toBe('publish');
  });
  it('그림이 실패해도 제목과 다음 목적지를 바꾸지 않는다', async () => {
    await act(async () => { render(<MemoryRouter><PublicSiteNextSteps pathname="/learn" /></MemoryRouter>); });
    const card = document.querySelector('.public-site-next__card');
    const image = card?.querySelector('img');
    if (!card || !image) throw new Error('다음 작업 이미지가 없습니다.');
    const title = card.textContent;
    fireEvent.error(image);
    expect(image.getAttribute('src')).toBe('/brand/illustrated-20260928/materials-320.webp');
    expect(image.getAttribute('srcset')).toBeNull();
    expect(card.getAttribute('href')).toBe('/market/browse');
    expect(card.textContent).toBe(title);
    fireEvent.error(image);
    expect(image.getAttribute('src')).toBe('/brand/illustrated-20260928/materials-320.webp');
  });
  it.each(['/studio/canvas', '/settings', '/privacy', '/admin'])('%s의 집중·보호 표면에 홍보 이미지를 삽입하지 않는다', (pathname) => {
    const { container } = render(<MemoryRouter><PublicSiteNextSteps pathname={pathname} /></MemoryRouter>);
    expect(container.children).toHaveLength(0);
  });
});
