import { AlertTriangle } from "lucide-react";

import { translateBilingualPair } from "@/shared/lib/i18n-bilingual-copy";

import { collabButton, collabPrimary } from "./collaboration-ui";

const SCOPE = "domains.collaboration.conflict";

const copy = {
  title: () =>
    translateBilingualPair(
      SCOPE,
      "다른 곳에서 먼저 저장했어요",
      "Someone else saved first",
    ),
  body: () =>
    translateBilingualPair(
      SCOPE,
      "다른 탭이나 기기에서 이 공고를 먼저 수정했어요. 계속 진행하려면 최신 내용을 먼저 불러와 주세요.",
      "This post was updated in another tab or device. Load the latest version to continue.",
    ),
  inputWarning: () =>
    translateBilingualPair(
      SCOPE,
      "최신 내용을 불러오면 지금 화면의 입력은 사라지니, 필요한 부분은 미리 복사해 두세요.",
      "Loading the latest version will discard what you are currently editing, so copy anything you need first.",
    ),
  reload: () =>
    translateBilingualPair(SCOPE, "최신 내용 불러오기", "Load latest version"),
  keepEditing: () =>
    translateBilingualPair(SCOPE, "내 작성 내용 유지하기", "Keep editing mine"),
  reloading: () =>
    translateBilingualPair(SCOPE, "최신 내용을 불러오는 중…", "Loading latest…"),
};

export function CollaborationConflictPanel({
  onReload,
  onKeepEditing,
  busy = false,
  inputWarning = false,
}: {
  onReload: () => void;
  onKeepEditing: () => void;
  busy?: boolean;
  /** 편집 중인 입력이 있을 때만 최신 불러오기로 입력이 사라짐을 경고한다. */
  inputWarning?: boolean;
}) {
  return (
    <div
      role="alert"
      aria-labelledby="collab-conflict-title"
      className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5"
    >
      <h2
        id="collab-conflict-title"
        className="flex items-center gap-2 text-base font-bold text-fg"
      >
        <AlertTriangle size={18} className="shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        {copy.title()}
      </h2>
      <p className="mt-3 text-sm leading-7 text-fg-2">{copy.body()}</p>
      {inputWarning && (
        <p className="mt-2 text-sm leading-7 text-fg-2">{copy.inputWarning()}</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={collabPrimary}
          disabled={busy}
          onClick={onReload}
        >
          {busy ? copy.reloading() : copy.reload()}
        </button>
        <button
          type="button"
          className={collabButton}
          disabled={busy}
          onClick={onKeepEditing}
        >
          {copy.keepEditing()}
        </button>
      </div>
    </div>
  );
}
