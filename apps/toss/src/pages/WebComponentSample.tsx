/**
 * 검증용 샘플 — 웹(루트)의 실제 Tailwind 기반 컴포넌트가 토스 미니앱 빌드에서 그대로
 * 렌더되는지 확인한다. 페이지 에이전트가 /studio·/create 를 붙일 때 쓰는 메커니즘의 최소 예시:
 *   1) "@/…" cross-app import 로 웹 컴포넌트를 그대로 가져온다.
 *   2) react-router 의존이 있으면 WebRouterHost(MemoryRouter)로 감싼다.
 *   3) Tailwind 유틸리티 클래스는 web-theme.css(@import "tailwindcss" + @source)로 생성된다.
 */
import { Section, Rail } from '@/components/section';
import { buttonClass } from '@/components/ui/button-utils';
import { cn } from '@/lib/utils';

import { WebRouterHost } from '../web-router-host';

export function WebComponentSample() {
  return (
    <WebRouterHost initialPath="/sample" basePaths={['/sample']}>
      <div className="min-h-dvh bg-canvas px-4 py-6 text-fg">
        <Section
          eyebrow="Web Component"
          title="툰스펙트럼 디자인 시스템"
          desc="레포 루트의 Tailwind 컴포넌트가 토스 미니앱에서 그대로 렌더됩니다."
          tick
        >
          <Rail itemClassName="w-[160px]">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  'surface-hl rounded-2xl border border-line bg-card p-4',
                  'transition-colors hover:border-accent/60',
                )}
              >
                <p className="eyebrow text-accent">Card {i}</p>
                <p className="numeral mt-1 text-2xl text-fg">{(i * 1234).toLocaleString()}</p>
                <p className="mt-1 text-sm text-fg-2">tnum·numeral·eyebrow 커스텀 유틸리티 동작</p>
              </div>
            ))}
          </Rail>
          <button type="button" className={buttonClass({ className: 'mt-4' })}>
            buttonClass 솔리드 버튼
          </button>
        </Section>
      </div>
    </WebRouterHost>
  );
}

export default WebComponentSample;
