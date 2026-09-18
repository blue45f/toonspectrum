import { CheckSquare2, Plus, Sparkles } from "lucide-react";
import { useMemo } from "react";

import {
  createCreatorRoleTemplateTasks,
  creatorRoleTaskTemplates,
} from "./creator-role-task-templates";
import type {
  ProductionRole,
  ProductionWorkspace,
} from "./studio-production-workspace-runtime";

import { buttonClass } from "@/shared/components/ui/button-utils";

let fallbackSequence = 0;
function createTaskId(templateId: string, index: number): string {
  const random = globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 10);
  if (random) return `role-task-${templateId}-${index}-${random}`;
  fallbackSequence += 1;
  return `role-task-${templateId}-${index}-${Date.now().toString(36)}-${fallbackSequence}`;
}

export function CreatorRoleToolkit({
  workspace,
  activeRoles,
  currentUserId,
  currentUserName,
  canEdit,
  onCommit,
}: {
  readonly workspace: ProductionWorkspace;
  readonly activeRoles: readonly ProductionRole[];
  readonly currentUserId: string;
  readonly currentUserName: string;
  readonly canEdit: boolean;
  readonly onCommit: (
    update: (current: ProductionWorkspace) => ProductionWorkspace,
    message: string,
  ) => void;
}) {
  const templates = useMemo(
    () => creatorRoleTaskTemplates(activeRoles),
    [activeRoles],
  );
  const myAssignment = workspace.roleAssignments.find(
    (assignment) => assignment.memberId === currentUserId
      && assignment.roles.some((role) => activeRoles.includes(role)),
  );
  if (templates.length === 0) return null;

  const applyTemplate = (templateId: string) => {
    const selected = templates.find((template) => template.id === templateId);
    if (!selected || !canEdit) return;
    const tasks = createCreatorRoleTemplateTasks(
      selected,
      currentUserName,
      myAssignment?.id ?? null,
      (index) => createTaskId(selected.id, index),
    );
    onCommit((current) => ({
      ...current,
      tasks: [...current.tasks, ...tasks],
    }), `${selected.label} 체크리스트를 내 작업에 추가했습니다.`);
  };

  return (
    <section className="rounded-2xl border border-line bg-card p-4" aria-labelledby="creator-role-toolkit-title">
      <header>
        <div className="flex items-center gap-2 text-accent">
          <Sparkles size={16} aria-hidden="true" />
          <p className="text-[0.68rem] font-black uppercase tracking-[0.14em]">ROLE TOOLKIT</p>
        </div>
        <h2 id="creator-role-toolkit-title" className="mt-1 text-sm font-black text-fg">
          직무별 작업 템플릿
        </h2>
        <p className="mt-1 text-xs leading-5 text-fg-2">
          실제 제작 작업으로 추가되는 순서형 체크리스트입니다. 프로젝트 권한은 바꾸지 않습니다.
        </p>
      </header>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {templates.slice(0, 4).map((template) => (
          <article key={template.id} className="rounded-xl border border-line bg-panel p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-xs font-black text-fg">{template.label}</h3>
                <p className="mt-1 text-[0.7rem] leading-5 text-fg-2">{template.description}</p>
              </div>
              <CheckSquare2 size={16} className="shrink-0 text-accent" aria-hidden="true" />
            </div>            <ol className="mt-3 space-y-1.5">
              {template.steps.map((step, index) => (
                <li key={step.title} className="flex items-start gap-2 text-[0.7rem] leading-5 text-fg-2">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-raised text-[0.58rem] font-black text-accent">
                    {index + 1}
                  </span>
                  <span>{step.title}</span>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className={buttonClass({ variant: "quiet", size: "sm", className: "mt-3 w-full gap-1.5" })}
              disabled={!canEdit}
              onClick={() => applyTemplate(template.id)}
            >
              <Plus size={13} aria-hidden="true" />
              내 작업에 추가
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
