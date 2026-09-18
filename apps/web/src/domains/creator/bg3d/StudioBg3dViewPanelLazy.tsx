import { lazy, Suspense, useState } from "react";

import type { StudioBg3dViewPanelProps } from "./StudioBg3dViewPanelContent";

const ViewPanel = lazy(() =>
  import("./StudioBg3dViewPanel").then(({ StudioBg3dViewPanel }) => ({
    default: StudioBg3dViewPanel,
  })),
);

/** Load on first use, then retain the mounted panel across tab switches. */
export function StudioBg3dViewPanel(props: StudioBg3dViewPanelProps) {
  const [activated, setActivated] = useState(!props.hidden);
  // A guarded update of this component records the first visible render without an effect or
  // a mutable ref. Later hidden renders must preserve the panel's in-progress UI state.
  if (!props.hidden && !activated) setActivated(true);
  if (props.hidden && !activated) return null;

  return (
    <Suspense
      fallback={
        <p hidden={props.hidden} role="status" className="py-3 text-xs text-fg-3">
          보기 도구를 불러오는 중입니다.
        </p>
      }
    >
      <ViewPanel {...props} />
    </Suspense>
  );
}
