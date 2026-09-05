import type { StudioWorkspaceRouteErrorCode } from "../studio-workspace-route";
import type { StudioPlaceholderRouteId } from "./studio-route-manifest";

import Link from "@/src/compat/router-link";

const ROUTE_ERROR_DETAILS: Readonly<Record<StudioWorkspaceRouteErrorCode, string>> = {
  "identity-conflict": "작품과 리믹스 원본 ID가 한 주소에 함께 들어 있어 문서를 열지 않았습니다.",
  "invalid-mode": "지원하지 않거나 중복된 Studio 모드가 지정되어 있습니다.",
  "invalid-path": "지원하지 않는 Studio 작업 주소입니다.",
  "invalid-remix-id": "리믹스 원본 ID를 안전하게 읽을 수 없습니다.",
  "invalid-work-id": "작품 ID를 안전하게 읽을 수 없습니다.",
  "work-id-conflict": "주소의 작품 ID가 서로 달라 다른 문서를 여는 대신 작업을 중단했습니다.",
};

const PRIMARY_EXIT_CLASS =
  "min-h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent transition-colors " +
  "hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-accent";
const SECONDARY_EXIT_CLASS =
  "inline-flex min-h-11 items-center rounded-lg border border-line px-5 text-sm font-semibold " +
  "text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * 막다른 화면에서 나가는 문.
 *
 * 카카오톡·인스타그램 같은 인앱 브라우저에는 주소창도 뒤로 가기 크롬도 없다. 공유 링크를 타고
 * 이런 화면에 도착한 사용자에게 화면 안의 컨트롤이 유일한 출구라, 두 방향을 모두 준다 —
 * 편집기로 들어가거나, Studio 밖 창작 게시판으로 나가거나. `data-studio-route-exit` 는
 * `verify:studio-inapp-browser` 가 "모든 라우트에 출구가 있다"를 검사하는 표식이다.
 */
function StudioRouteExits({
  onOpenStudio,
  openLabel,
}: {
  readonly onOpenStudio: () => void;
  readonly openLabel: string;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        data-studio-route-exit="editor"
        onClick={onOpenStudio}
        className={PRIMARY_EXIT_CLASS}
      >
        {openLabel}
      </button>
      <Link href="/create" data-studio-route-exit="site" className={SECONDARY_EXIT_CLASS}>
        창작 게시판으로
      </Link>
    </div>
  );
}

export function StudioRouteFailure({
  errorCode,
  onOpenStudio,
}: {
  readonly errorCode: StudioWorkspaceRouteErrorCode;
  readonly onOpenStudio: () => void;
}) {
  return (
    <section
      aria-labelledby="studio-route-error-title"
      className="grid min-h-dvh place-items-center bg-bg px-5 py-12 text-fg"
    >
      <div className="max-w-xl text-center">
        <h1
          id="studio-route-error-title"
          className="text-balance text-2xl font-bold tracking-tight sm:text-3xl"
        >
          Studio 작업 주소를 확인해 주세요
        </h1>
        <p className="mx-auto mt-3 max-w-[62ch] text-sm leading-relaxed text-fg-2">
          {ROUTE_ERROR_DETAILS[errorCode]}
        </p>
        <StudioRouteExits onOpenStudio={onOpenStudio} openLabel="새 Studio 작업 열기" />
      </div>
    </section>
  );
}

interface StudioPlaceholderGuide {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly steps: readonly string[];
  readonly openLabel: string;
  readonly collaboration: boolean;
}

const PLACEHOLDER_GUIDES: Readonly<Record<StudioPlaceholderRouteId, StudioPlaceholderGuide>> = {
  assets: {
    eyebrow: "에셋 진입 안내",
    title: "에셋은 편집기 안에서 원고 맥락과 함께 사용합니다",
    description:
      "독립 주소에서 문서를 다시 만들지 않고, 기본 Studio에서 현재 페이지·선택 레이어·사용 권한을 유지한 채 에셋을 삽입합니다.",
    steps: ["Studio 편집기 열기", "에셋 패널에서 검색·미리보기", "현재 원고에 비파괴 삽입"],
    openLabel: "에셋을 사용할 Studio 열기",
    collaboration: false,
  },
  review: {
    eyebrow: "통합 검수 경로",
    title: "리뷰는 원고·댓글·담당 작업을 한 화면에서 이어갑니다",
    description:
      "별도 문서 복사본 대신 서버 앵커 댓글, 읽지 않은 의견, 해결 상태와 검수 작업을 기본 Studio의 같은 작품 권한 안에서 관리합니다.",
    steps: ["원고의 댓글 핀으로 정확한 위치 확인", "답글·담당·해결 상태로 검수 정리", "필요하면 분리형 리뷰 창으로 확장"],
    openLabel: "리뷰가 연결된 Studio 열기",
    collaboration: true,
  },
  join: {
    eyebrow: "안전한 참여 경로",
    title: "공동 작업 참여는 로그인과 작품 권한 확인 뒤 시작합니다",
    description:
      "공유 주소만으로 편집 권한을 우회하지 않습니다. 초대받은 계정으로 로그인하면 역할에 맞는 편집·댓글·열람 기능만 노출됩니다.",
    steps: ["초대받은 계정으로 로그인", "작품과 역할 권한 확인", "팀 패널에서 실시간 세션 시작"],
    openLabel: "공동 작업 Studio 열기",
    collaboration: true,
  },
  present: {
    eyebrow: "실시간 발표 경로",
    title: "프레젠테이션은 따라가기·주의 요청·화면 공유로 진행합니다",
    description:
      "원고를 별도 발표 파일로 내보내지 않고, 참여자가 현재 작업 위치를 선택적으로 따라가거나 승인된 화면 공유를 시청합니다.",
    steps: ["발표자 작업 위치 따라가기", "현재 위치로 참여자 주의 요청", "승인 기반 화면 공유와 시청 종료"],
    openLabel: "발표 세션 Studio 열기",
    collaboration: true,
  },
  versions: {
    eyebrow: "안전한 버전 경로",
    title: "버전 확인은 현재 원고의 복구·비교 경계 안에서 수행합니다",
    description:
      "체크포인트, 서버 리비전, 로컬 복구 데이터를 서로 다른 안전 등급으로 구분해 낙관적 화면을 권위 원고로 오인하지 않도록 합니다.",
    steps: ["서버 승인과 대기 변경 확인", "체크포인트·리비전 비교", "복구 파일 보존 뒤 권위 원고 재열기"],
    openLabel: "버전을 확인할 Studio 열기",
    collaboration: true,
  },
  projects: {
    eyebrow: "팀 작업 진입 안내",
    title: "프로젝트와 초대받은 작품은 팀 패널에서 함께 찾습니다",
    description:
      "현재 계정의 팀 초대, 공유 작품, 역할과 최근 팀 활동을 기본 Studio에서 확인하고 필요한 작품으로 이동합니다.",
    steps: ["받은 초대 확인·응답", "공유 작품과 팀 역할 확인", "선택한 작품의 실시간 세션 진입"],
    openLabel: "팀 프로젝트 Studio 열기",
    collaboration: true,
  },
  share: {
    eyebrow: "권한 중심 공유 경로",
    title: "공유는 링크보다 역할과 작품 권한을 먼저 설정합니다",
    description:
      "소유자·관리자·편집자·검토자·열람자 역할을 구분하고, 링크를 받은 사용자가 로그인해도 서버 권한 범위를 넘지 않도록 유지합니다.",
    steps: ["팀원 초대와 역할 지정", "작품 권한을 유지한 초대 링크 복사", "접속·댓글·화면 공유 상태 확인"],
    openLabel: "공유 설정 Studio 열기",
    collaboration: true,
  },
};

export function StudioRoutePlaceholder({
  placeholderId,
  onOpenStudio,
}: {
  readonly onOpenStudio: () => void;
  readonly placeholderId: StudioPlaceholderRouteId;
}) {
  const guide = PLACEHOLDER_GUIDES[placeholderId];
  return (
    <section
      aria-labelledby="studio-placeholder-title"
      className="grid min-h-dvh place-items-center bg-bg px-5 py-12 text-fg"
      data-studio-collaboration-gateway={guide.collaboration ? placeholderId : undefined}
    >
      <div className="w-full max-w-2xl text-center">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-accent">{guide.eyebrow}</p>
        <h1
          id="studio-placeholder-title"
          className="mx-auto mt-2 max-w-[24ch] text-balance text-2xl font-bold tracking-tight sm:text-3xl"
        >
          {guide.title}
        </h1>
        <p className="mx-auto mt-3 max-w-[64ch] text-sm leading-relaxed text-fg-2">
          {guide.description}
        </p>
        <ol className="mt-6 grid gap-2 text-left sm:grid-cols-3" aria-label="권장 작업 순서">
          {guide.steps.map((step, index) => (
            <li
              key={step}
              className="flex min-h-24 items-start gap-3 rounded-2xl border border-line bg-card p-3.5"
            >
              <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-black text-accent"
              >
                {index + 1}
              </span>
              <span className="pt-1 text-xs font-semibold leading-relaxed text-fg-2">{step}</span>
            </li>
          ))}
        </ol>
        <p className="mx-auto mt-4 max-w-[64ch] text-xs leading-relaxed text-fg-3">
          이 주소에서는 편집 문서 런타임을 중복 실행하지 않습니다. 아래 버튼으로 기본 Studio를 열면
          같은 원고와 계정 권한을 유지한 채 해당 작업을 이어갈 수 있습니다.
        </p>
        <StudioRouteExits onOpenStudio={onOpenStudio} openLabel={guide.openLabel} />
      </div>
    </section>
  );
}
