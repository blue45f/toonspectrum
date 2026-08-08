/**
 * §15.3 Help 그룹 항목.
 *
 * 감사(§2.8/§4)는 Help 8행 중 7행이 없다고 판정했다. Wave D 가 통합 검색과 용어
 * 별칭을 출하했지만 **메뉴에 문이 나지 않아** 도움말 그룹은 여전히 두 줄이었다.
 * 이 모듈이 나머지 문을 낸다.
 *
 * 왜 `studio-main-menu-items-workspace.ts` 안이 아닌 별도 모듈인가: Window 와 Help 는
 * 같은 파일에 있었지만 서로 아무 관계가 없고, Help 만 여섯 줄이 늘면서 그 파일이
 * 두 관심사를 반씩 담게 된다. 기존 두 줄은 그대로 재사용한다 — 복제하지 않는다.
 *
 * 항목의 `onSelect` 는 `studio-help-center-channel.ts` 로 요청만 보낸다. 이 여섯 개
 * 표면은 StudioPage 상태를 하나도 읽지 않고 런타임 프로브·모듈 스토어에서 값을 직접
 * 재기 때문에, ui 액션으로 끌고 내려갈 상태가 존재하지 않는다.
 *
 * 라벨은 로케일 팩이 아니라 이 파일이 들고 있다. 75개 팩은 키 개수가 서로 같아야
 * 한다는 계약(`studio-i18n-loader.test.ts`)이 있어서, 두 팩에만 키를 넣을 수 없다.
 * Help 그룹이 이미 쓰던 로케일 프로브(`helpGroupLabel`)를 그대로 재사용해 한국어/영어
 * 두 벌을 고르고, 팩이 이 키들을 싣는 날 `localizeStudioMainMenuGroups` 가 자동으로
 * 그쪽을 이긴다.
 */

import { Bug, Command, HelpCircle, LifeBuoy, Scale, Search, Stethoscope } from "lucide-react";

import {
  openStudioHelpCenter,
  requestStudioCommandSearch,
} from "./studio-help-center-channel";
import { buildStudioHelpMenuItems } from "./studio-main-menu-items-workspace";

import type { StudioHelpMenuItemsInput } from "./studio-main-menu-items-workspace";
import type { StudioMainMenuItem } from "./studio-main-menu-model";

/**
 * 기존 Help 두 줄(사용법·단축키) 앞뒤로 나머지 §15.3 행을 붙인다.
 *
 * 배치 의도: 찾기(검색·용어) → 지금 쓰는 것(현재 도구) → 배우기(튜토리얼·단축키) →
 * 문제 해결(진단·복구) → 고지·신고(라이선스·버그 리포트).
 */
const LABELS = {
  ko: {
    "command-search": "명령 · 속성 통합 검색",
    "terminology-search": "CSP · Photoshop 용어 찾기",
    "current-tool": "현재 도구 도움말",
    diagnostics: "기기 · 브라우저 진단…",
    recovery: "복구 가이드…",
    licenses: "라이선스 · 서드파티 고지…",
    "bug-report": "버그 리포트 패키지…",
  },
  en: {
    "command-search": "Command search",
    "terminology-search": "CSP · Photoshop terminology",
    "current-tool": "Current tool help",
    diagnostics: "Device and browser diagnosis…",
    recovery: "Recovery guide…",
    licenses: "Licenses and third-party notices…",
    "bug-report": "Bug report package…",
  },
} as const;

export function buildStudioHelpGroupItems(
  input: StudioHelpMenuItemsInput,
): StudioMainMenuItem[] {
  const learning = buildStudioHelpMenuItems(input);
  const activeToolCommandId = input.state.activeToolCommandId;
  const label = LABELS[input.helpGroupLabel === "도움말" ? "ko" : "en"];

  const finding: StudioMainMenuItem[] = [
    {
      id: "command-search",
      commandId: "help.command-search",
      label: label["command-search"],
      icon: Search,
      shortcut: "F1",
      onSelect: () => {
        requestStudioCommandSearch();
      },
    },
    {
      id: "terminology-search",
      commandId: "help.terminology-search",
      label: label["terminology-search"],
      icon: Command,
      onSelect: () => {
        openStudioHelpCenter({ section: "terminology" });
      },
    },
    {
      id: "current-tool",
      commandId: "help.current-tool",
      label: label["current-tool"],
      icon: HelpCircle,
      separatorAfter: true,
      onSelect: () => {
        openStudioHelpCenter({
          section: "current-tool",
          ...(activeToolCommandId === null
            ? {}
            : { toolCommandId: activeToolCommandId }),
        });
      },
    },
  ];

  const troubleshooting: StudioMainMenuItem[] = [
    {
      id: "diagnostics",
      commandId: "help.diagnostics",
      label: label["diagnostics"],
      icon: Stethoscope,
      onSelect: () => {
        openStudioHelpCenter({ section: "diagnostics" });
      },
    },
    {
      id: "recovery",
      commandId: "help.recovery",
      label: label["recovery"],
      icon: LifeBuoy,
      separatorAfter: true,
      onSelect: () => {
        openStudioHelpCenter({ section: "recovery" });
      },
    },
    {
      id: "licenses",
      commandId: "help.licenses",
      label: label["licenses"],
      icon: Scale,
      onSelect: () => {
        openStudioHelpCenter({ section: "license" });
      },
    },
    {
      id: "bug-report",
      commandId: "help.bug-report",
      label: label["bug-report"],
      icon: Bug,
      onSelect: () => {
        openStudioHelpCenter({ section: "bug-report" });
      },
    },
  ];

  // 배우기 묶음의 마지막 줄 뒤에 구분선을 넣어 문제 해결 묶음과 갈라 준다.
  const learningWithSeparator = learning.map((item, index) =>
    index === learning.length - 1 ? { ...item, separatorAfter: true } : item,
  );

  return [...finding, ...learningWithSeparator, ...troubleshooting];
}
