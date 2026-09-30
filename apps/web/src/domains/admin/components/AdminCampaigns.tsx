import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  adminFetch,
  centsToWon,
  formatNum,
  formatWon,
  wonToCents,
  type AdminApiError,
  type Campaign,
} from "./admin-client";
import {
  AdminNotice,
  AdminSpinner,
  Field,
  adminInputClass,
} from "./admin-ui";
import { adminButtonClass } from "./admin-ui-utils";

import { useT } from "@/shared/lib/i18n";

const campaignFormSchema = z.object({
  creatorId: z.string().trim().min(1, "Creator ID & title are required."),
  titleId: z.string(),
  planId: z.string(),
  title: z.string().trim().min(1, "Creator ID & title are required."),
  description: z.string(),
  targetWon: z.string(),
  isActive: z.boolean(),
  startsAt: z.string(),
  endsAt: z.string(),
});

type CampaignFormValues = z.infer<typeof campaignFormSchema>;

const emptyDraft: CampaignFormValues = {
  creatorId: "",
  titleId: "",
  planId: "",
  title: "",
  description: "",
  targetWon: "",
  isActive: true,
  startsAt: "",
  endsAt: "",
};

const dateInput = (value: string | null) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

function toDraft(campaign: Campaign): CampaignFormValues {
  return {
    creatorId: campaign.creatorId,
    titleId: campaign.titleId ?? "",
    planId: campaign.planId ?? "",
    title: campaign.title,
    description: campaign.description ?? "",
    targetWon: String(centsToWon(campaign.targetAmountCents)),
    isActive: campaign.isActive,
    startsAt: dateInput(campaign.startsAt),
    endsAt: dateInput(campaign.endsAt),
  };
}

export function AdminCampaigns({ uid }: { uid: string }) {
  const [items, setItems] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id?: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // Inline delete confirmation (row-level, replaces blocking confirm())
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const t = useT();

  // Move keyboard focus to the safe (cancel) action and allow Escape to
  // dismiss the inline confirmation.
  useEffect(() => {
    if (!confirmingDeleteId) return;
    cancelDeleteRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmingDeleteId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmingDeleteId]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: emptyDraft,
  });

  const load = useCallback(() => {
    setError(null);
    adminFetch<{ items: Campaign[] }>("/campaigns", uid)
      .then((data) => setItems(data.items))
      .catch((requestError: AdminApiError) => setError(requestError.message));
  }, [uid]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  const openNew = () => {
    setFormError(null);
    reset(emptyDraft);
    setEditing({});
  };

  const openEdit = (campaign: Campaign) => {
    setFormError(null);
    reset(toDraft(campaign));
    setEditing({ id: campaign.id });
  };

  const close = () => {
    setEditing(null);
    setFormError(null);
  };

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await adminFetch("/campaigns", uid, {
        method: "POST",
        body: JSON.stringify({
          id: editing?.id,
          creatorId: values.creatorId.trim(),
          titleId: values.titleId.trim() || undefined,
          planId: values.planId.trim() || undefined,
          title: values.title.trim(),
          description: values.description.trim() || undefined,
          targetAmountCents: wonToCents(Number(values.targetWon)),
          currency: "KRW",
          isActive: values.isActive,
          startsAt: values.startsAt
            ? new Date(values.startsAt).toISOString()
            : undefined,
          endsAt: values.endsAt
            ? new Date(values.endsAt).toISOString()
            : undefined,
        }),
      });
      setEditing(null);
      load();
    } catch (requestError) {
      setFormError((requestError as AdminApiError).message);
    }
  });

  const remove = async (id: string) => {
    try {
      setDeleting(true);
      await adminFetch(
        `/campaigns/${encodeURIComponent(id)}`,
        uid,
        { method: "DELETE" },
      );
      setConfirmingDeleteId(null);
      load();
    } catch (requestError) {
      setError((requestError as AdminApiError).message);
    } finally {
      setDeleting(false);
    }
  };

  if (error) {
    return <AdminNotice title={t("admin.campaigns.loadError")} body={error} />;
  }
  if (!items) return <AdminSpinner />;

  const validationError =
    errors.creatorId?.message ?? errors.title?.message ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-3">
          {t("admin.campaigns.count").replace(
            "{count}",
            formatNum(items.length),
          )}
        </p>
        {!editing ? (
          <button
            type="button"
            className={adminButtonClass("accent")}
            onClick={openNew}
          >
            <Plus size={15} /> {t("admin.campaigns.new")}
          </button>
        ) : null}
      </div>

      {editing ? (
        <form
          className="grid grid-cols-1 gap-3 rounded-2xl border border-line-strong bg-panel p-5 sm:grid-cols-2"
          onSubmit={submit}
        >
          <div className="flex items-center justify-between sm:col-span-2">
            <h3 className="text-sm font-semibold text-fg">
              {editing.id
                ? t("admin.campaigns.edit")
                : t("admin.campaigns.new")}
            </h3>
            <button
              type="button"
              aria-label="Close"
              className="text-fg-3 hover:text-fg"
              onClick={close}
            >
              <X size={16} />
            </button>
          </div>
          <Field label={t("admin.campaigns.titleLabel")} full>
            <input className={adminInputClass} {...register("title")} />
          </Field>
          <Field label={t("admin.campaigns.creatorId")}>
            <input className={adminInputClass} {...register("creatorId")} />
          </Field>
          <Field label={t("admin.campaigns.planId")}>
            <input className={adminInputClass} {...register("planId")} />
          </Field>
          <Field label={t("admin.campaigns.workId")}>
            <input
              className={adminInputClass}
              {...register("titleId")}
              placeholder="nw-..."
            />
          </Field>
          <Field label={t("admin.plans.description")} full>
            <input
              className={adminInputClass}
              {...register("description")}
            />
          </Field>
          <Field label={t("admin.campaigns.targetWon")}>
            <input
              type="number"
              min={0}
              className={adminInputClass}
              {...register("targetWon")}
            />
          </Field>
          <Field label={t("admin.campaigns.startsAt")}>
            <input
              type="date"
              className={adminInputClass}
              {...register("startsAt")}
            />
          </Field>
          <Field label={t("admin.campaigns.endsAt")}>
            <input
              type="date"
              className={adminInputClass}
              {...register("endsAt")}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-fg-2">
            <input type="checkbox" {...register("isActive")} />
            {t("admin.plans.active")}
          </label>
          <div className="flex items-center justify-end gap-2 sm:col-span-2">
            {validationError || formError ? (
              <span className="mr-auto text-xs text-bad">
                {validationError ?? formError}
              </span>
            ) : null}
            <button
              type="button"
              className={adminButtonClass("ghost")}
              onClick={close}
            >
              {t("admin.plans.cancel")}
            </button>
            <button
              type="submit"
              className={adminButtonClass("accent")}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? t("admin.plans.saving")
                : t("admin.plans.save")}
            </button>
          </div>
        </form>
      ) : null}

      <div className="flex flex-col gap-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-card/40 px-5 py-10 text-center text-sm text-fg-3">
            {t("admin.campaigns.empty")}
          </div>
        ) : null}
        {items.map((campaign) => {
          const percent =
            campaign.targetAmountCents > 0
              ? Math.min(
                  100,
                  Math.round(
                    (campaign.raisedAmountCents /
                      campaign.targetAmountCents) *
                      100,
                  ),
                )
              : 0;
          return (
            <article
              key={campaign.id}
              className="rounded-2xl border border-line bg-card p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold text-fg">
                      {campaign.title}
                    </h3>
                    <span
                      className={
                        campaign.isActive
                          ? "text-xs text-good"
                          : "text-xs text-fg-3"
                      }
                    >
                      {campaign.isActive
                        ? t("admin.plans.statusActive")
                        : t("admin.plans.statusInactive")}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-fg-3">
                    {campaign.creatorName ?? campaign.creatorId}
                    {campaign.planCode ? ` · ${campaign.planCode}` : ""}
                    {campaign.titleId ? ` · ${campaign.titleId}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className={adminButtonClass("ghost")}
                    onClick={() => openEdit(campaign)}
                  >
                    <Pencil size={13} />
                    {t("admin.plans.tableHeaderAction")}
                  </button>
                  {confirmingDeleteId === campaign.id ? (
                    <div
                      role="alert"
                      className="flex items-center gap-2 rounded-xl border border-bad/30 bg-bad/10 px-2 py-1"
                    >
                      <span className="text-xs text-bad">
                        {t("admin.campaigns.confirmDelete")}
                      </span>
                      <button
                        type="button"
                        className={adminButtonClass("danger")}
                        disabled={deleting}
                        onClick={() => void remove(campaign.id)}
                      >
                        {t("admin.campaigns.confirmDeleteButton")}
                      </button>
                      <button
                        type="button"
                        className={adminButtonClass("ghost")}
                        disabled={deleting}
                        ref={cancelDeleteRef}
                        onClick={() => setConfirmingDeleteId(null)}
                      >
                        {t("admin.plans.cancel")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={adminButtonClass("danger")}
                      onClick={() => setConfirmingDeleteId(campaign.id)}
                      aria-label={t("admin.campaigns.confirmDelete")}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
              {campaign.description ? (
                <p className="mt-2 line-clamp-2 text-sm text-fg-2">
                  {campaign.description}
                </p>
              ) : null}
              <div className="mt-3 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="numeral shrink-0 text-xs text-fg-2">
                  {formatWon(campaign.raisedAmountCents)} /{" "}
                  {formatWon(campaign.targetAmountCents)} ({percent}%)
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
