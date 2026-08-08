/**
 * 도움말 센터 호스트 — 메뉴 요청을 받아 다이얼로그를 띄운다.
 *
 * StudioPage 루트에 한 번 마운트된다. 다이얼로그 본체는 lazy 라서, 도움말을 한 번도
 * 열지 않은 세션은 진단·라이선스·용어 사전 코드를 지불하지 않는다.
 *
 * 마운트 시 세션 오류 저널을 설치한다 — 버그 리포트가 "이 세션에서 무슨 일이
 * 있었나"에 답하려면 사용자가 도움말을 열기 **전에** 기록이 시작돼야 한다.
 */

import { Suspense, lazy, useCallback, useEffect, useState } from "react";

import { installStudioErrorJournal } from "./studio-error-journal";
import { subscribeStudioHelpCenter } from "./studio-help-center-channel";

import type { StudioHelpCenterSection } from "./studio-help-center-channel";

const StudioHelpCenterDialog = lazy(() =>
  import("./StudioHelpCenterDialog").then((module) => ({
    default: module.StudioHelpCenterDialog,
  })),
);

interface HelpCenterState {
  readonly open: boolean;
  readonly section: StudioHelpCenterSection;
  readonly toolCommandId: string | null;
}

const CLOSED: HelpCenterState = {
  open: false,
  section: "diagnostics",
  toolCommandId: null,
};

export function StudioHelpCenterHost() {
  const [state, setState] = useState<HelpCenterState>(CLOSED);

  useEffect(() => installStudioErrorJournal(), []);

  useEffect(
    () =>
      subscribeStudioHelpCenter((request) => {
        setState({
          open: true,
          section: request.section,
          toolCommandId: request.toolCommandId ?? null,
        });
      }),
    [],
  );

  const close = useCallback(() => setState(CLOSED), []);
  const changeSection = useCallback(
    (section: StudioHelpCenterSection) =>
      setState((current) => ({ ...current, section })),
    [],
  );

  if (!state.open) return null;

  return (
    <Suspense fallback={null}>
      <StudioHelpCenterDialog
        open
        section={state.section}
        toolCommandId={state.toolCommandId}
        onSectionChange={changeSection}
        onClose={close}
      />
    </Suspense>
  );
}
