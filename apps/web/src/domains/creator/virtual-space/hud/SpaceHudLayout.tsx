import type { ReactNode } from "react";

export interface SpaceHudSlots {
  readonly topLeft?: ReactNode;
  readonly topCenter?: ReactNode;
  readonly topRight?: ReactNode;
  readonly rightPanel?: ReactNode;
  readonly bottomCenter?: ReactNode;
  readonly bottomStart?: ReactNode;
  readonly bottomEnd?: ReactNode;
}

/**
 * 월드 위 HUD 슬롯. 컨테이너와 슬롯은 포인터를 통과시키고(pointer-events:none),
 * 슬롯의 직계 자식만 입력을 받는다. 안전 영역(safe-area)은 CSS가 적용한다.
 */
export function SpaceHudLayout({ topLeft, topCenter, topRight, rightPanel, bottomCenter, bottomStart, bottomEnd }: SpaceHudSlots) {
  return <div className="space-hud__overlay" data-space-hud-overlay="true">
    <div className="space-hud__slot space-hud__slot--top-left">{topLeft}</div>
    <div className="space-hud__slot space-hud__slot--top-center">{topCenter}</div>
    <div className="space-hud__slot space-hud__slot--top-right">{topRight}</div>
    <div className="space-hud__slot space-hud__slot--bottom-start">{bottomStart}</div>
    <div className="space-hud__slot space-hud__slot--bottom-center">{bottomCenter}</div>
    <div className="space-hud__slot space-hud__slot--bottom-end">{bottomEnd}</div>
    {rightPanel}
  </div>;
}
