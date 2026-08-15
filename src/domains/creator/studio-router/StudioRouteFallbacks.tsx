import type { StudioWorkspaceRouteErrorCode } from "../studio-workspace-route";
import type { StudioPlaceholderRouteId } from "./studio-route-manifest";

const ROUTE_ERROR_DETAILS: Readonly<Record<StudioWorkspaceRouteErrorCode, string>> = {
  "identity-conflict": "작품과 리믹스 원본 ID가 한 주소에 함께 들어 있어 문서를 열지 않았습니다.",
  "invalid-mode": "지원하지 않거나 중복된 Studio 모드가 지정되어 있습니다.",
  "invalid-path": "지원하지 않는 Studio 작업 주소입니다.",
  "invalid-remix-id": "리믹스 원본 ID를 안전하게 읽을 수 없습니다.",
  "invalid-work-id": "작품 ID를 안전하게 읽을 수 없습니다.",
  "work-id-conflict": "주소의 작품 ID가 서로 달라 다른 문서를 여는 대신 작업을 중단했습니다.",
};

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
        <button
          type="button"
          onClick={onOpenStudio}
          className="mt-6 min-h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          새 Studio 작업 열기
        </button>
      </div>
    </section>
  );
}

const PLACEHOLDER_LABELS: Readonly<Record<StudioPlaceholderRouteId, string>> = {
  assets: "에셋",
  join: "공동 작업 참여",
  present: "프레젠테이션",
  projects: "프로젝트",
  share: "공유",
};

export function StudioRoutePlaceholder({
  placeholderId,
  onOpenStudio,
}: {
  readonly onOpenStudio: () => void;
  readonly placeholderId: StudioPlaceholderRouteId;
}) {
  return (
    <section
      aria-labelledby="studio-placeholder-title"
      className="grid min-h-dvh place-items-center bg-bg px-5 py-12 text-fg"
    >
      <div className="max-w-lg text-center">
        <h1 id="studio-placeholder-title" className="text-2xl font-bold tracking-tight">
          {PLACEHOLDER_LABELS[placeholderId]} 작업공간을 준비하고 있습니다
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-2">
          이 화면에서는 편집 문서 런타임이 종료됩니다. 저장을 마친 작업은 기본 편집기에서 다시 열 수 있습니다.
        </p>
        <button
          type="button"
          onClick={onOpenStudio}
          className="mt-6 min-h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent"
        >
          Studio 편집기 열기
        </button>
      </div>
    </section>
  );
}
