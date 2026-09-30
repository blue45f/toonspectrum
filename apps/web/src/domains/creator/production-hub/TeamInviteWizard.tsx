import { useState } from "react";
import { Check, LoaderCircle, Mail, ShieldCheck, UserRound } from "lucide-react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { InlineHelp, ProductionWizard } from "./ProductionUxKit";

export interface TeamInviteProject {
  readonly workId: string;
  readonly title: string;
}

export interface TeamInviteWizardInput {
  readonly email: string;
  /** 워크스페이스 역할 티어: admin | editor | commenter | viewer | guest-link */
  readonly tierId: string;
  readonly projectWorkId: string;
  readonly projectRole: string;
}

const TIERS: readonly {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
}[] = [
  { id: "admin", label: "관리자", summary: "팀 설정·초대·구성원 관리를 할 수 있습니다." },
  { id: "editor", label: "편집자", summary: "원고를 수정하고 검수에 제출할 수 있습니다." },
  { id: "commenter", label: "검수자", summary: "원고를 수정하지 않고 댓글만 남길 수 있습니다." },
  { id: "viewer", label: "뷰어", summary: "원고를 열람만 할 수 있습니다." },
  { id: "guest-link", label: "게스트(링크)", summary: "초대 링크로 참여하는 외부 인원입니다." },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * 팀원 초대 — 3단계 마법사.
 *
 * 3클릭 원칙: 1) 이메일 입력 → 2) 역할 선택 → 3) 작품 배정(선택) → 초대 완료.
 * 초대 → 역할 → 배정을 한 화면 흐름에서 끝낸다.
 */
export function TeamInviteWizard({
  projects,
  onInvite,
  onCancel,
}: {
  readonly projects: readonly TeamInviteProject[];
  readonly onInvite: (input: TeamInviteWizardInput) => Promise<void>;
  readonly onCancel?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [email, setEmail] = useState("");
  const [tierId, setTierId] = useState("editor");
  const [projectWorkId, setProjectWorkId] = useState("");
  const [projectRole, setProjectRole] = useState("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const emailValid = EMAIL_RE.test(email.trim());

  const invite = async () => {
    if (!emailValid) return;
    setBusy(true);
    setError("");
    try {
      await onInvite({ email: email.trim(), tierId, projectWorkId, projectRole });
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "초대를 만들지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    const tier = TIERS.find((item) => item.id === tierId);
    return (
      <div className="rounded-3xl border border-line bg-card p-6 text-center" data-slot="team-invite-done">
        <p className="mx-auto grid size-12 place-items-center rounded-full bg-good/10 text-good">
          <Check size={24} aria-hidden="true" />
        </p>
        <h3 className="mt-3 text-lg font-bold">초대 링크를 만들었습니다</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-fg-2">
          <strong>{email.trim()}</strong> 님에게 <strong>{tier?.label ?? tierId}</strong> 역할로 초대합니다.
          링크는 7일간 유효하며, 이메일은 자동 발송하지 않으니 직접 전달해 주세요.
        </p>
        <button type="button" className={cn(buttonClass(), "mt-4")} onClick={() => onCancel?.()}>
          닫기
        </button>
      </div>
    );
  }

  return (
    <ProductionWizard
      steps={[
        { id: "email", title: "누구를 초대할까요?", description: "초대받을 분의 이메일을 입력합니다." },
        { id: "role", title: "역할 정하기", description: "무엇을 할 수 있는 사람인지 고릅니다." },
        { id: "assign", title: "작품 배정", description: "바로 참여할 작품이 있으면 함께 정합니다. (선택)" },
      ]}
      currentIndex={index}
      onIndexChange={setIndex}
      onComplete={() => void invite()}
      onCancel={onCancel}
      completeLabel="초대 링크 만들기"
      isNextDisabled={(stepIndex) => stepIndex === 0 && !emailValid}
    >
      {(stepIndex) => {
        if (stepIndex === 0) {
          return (
            <label className="block text-sm font-semibold">
              <span className="flex items-center gap-2">
                <Mail size={16} aria-hidden="true" /> 초대받을 이메일
              </span>
              <input
                type="email"
                required
                maxLength={320}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammate@example.com"
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm"
              />
              {!emailValid && email.length > 0 ? (
                <span role="alert" className="mt-1 block text-xs font-normal text-bad">
                  이메일 형식을 확인해 주세요.
                </span>
              ) : null}
            </label>
          );
        }
        if (stepIndex === 1) {
          return (
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="초대 역할">
              {TIERS.map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  role="radio"
                  aria-checked={tierId === tier.id}
                  onClick={() => setTierId(tier.id)}
                  className={cn(
                    "rounded-2xl border p-4 text-left",
                    tierId === tier.id ? "border-accent bg-accent-soft" : "border-line bg-card hover:bg-raised",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-bold">
                    {tier.id === "admin" ? <ShieldCheck size={16} aria-hidden="true" /> : <UserRound size={16} aria-hidden="true" />}
                    {tier.label}
                  </span>
                  <span className="mt-1 block text-xs leading-6 text-fg-2">{tier.summary}</span>
                </button>
              ))}
            </div>
          );
        }
        return (
          <div className="space-y-4">
            <div className="block text-sm font-semibold">
              <span className="flex items-center gap-1">
                함께 참여할 작품
                <InlineHelp label="작품 배정">
                  작품을 고르면 워크스페이스 초대와 함께 작품 권한 초대도 만들어집니다.
                  건너뛰면 나중에 작품 설정에서 권한을 줄 수 있습니다.
                </InlineHelp>
              </span>
              <select
                aria-label="함께 참여할 작품"
                value={projectWorkId}
                onChange={(event) => setProjectWorkId(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm"
              >
                <option value="">나중에 정하기</option>
                {projects.map((project) => (
                  <option key={project.workId} value={project.workId}>
                    {project.title}
                  </option>
                ))}
              </select>
            </div>
            {projectWorkId ? (
              <label className="block text-sm font-semibold">
                작품에서의 역할
                <select
                  value={projectRole}
                  onChange={(event) => setProjectRole(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm"
                >
                  <option value="editor">편집자</option>
                  <option value="commenter">검토자</option>
                  <option value="viewer">열람자</option>
                  <option value="admin">관리자</option>
                </select>
              </label>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-bad">
                {error}
              </p>
            ) : null}
            {busy ? (
              <p className="flex items-center gap-2 text-sm text-fg-2" role="status">
                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> 초대 링크를 만드는 중…
              </p>
            ) : null}
          </div>
        );
      }}
    </ProductionWizard>
  );
}
