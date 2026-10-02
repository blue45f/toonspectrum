/**
 * MembershipTierEditor.tsx
 *
 * 창작자용 멤버십 티어 생성·수정 폼.
 */
import { Plus } from "lucide-react";
import { useState } from "react";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import { buttonClass } from "@/shared/components/ui/button-utils";

import {
  formatMembershipKrw,
  MEMBERSHIP_PERK_IDS,
  TIER_DESCRIPTION_MAX_LENGTH,
  TIER_NAME_MAX_LENGTH,
  TIER_PRICE_MAX_KRW,
  TIER_PRICE_MIN_KRW,
  validateTierInput,
  type MembershipPerk,
  type MembershipTier,
} from "../models/membership-model";
import { createTier, updateTier } from "../models/membership-store";

interface MembershipTierEditorProps {
  readonly creatorId: string;
  /** 수정 모드일 때 대상 티어. 없으면 생성 모드. */
  readonly editingTier?: MembershipTier | null;
  readonly onSaved: () => void;
  readonly onCancel?: () => void;
}

export function MembershipTierEditor({
  creatorId,
  editingTier,
  onSaved,
  onCancel,
}: MembershipTierEditorProps) {
  const t = useT();
  const [name, setName] = useState(editingTier?.name ?? "");
  const [price, setPrice] = useState(editingTier ? String(editingTier.monthlyPriceKrw) : "");
  const [description, setDescription] = useState(editingTier?.description ?? "");
  const [perks, setPerks] = useState<readonly MembershipPerk[]>(editingTier?.perks ?? []);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const togglePerk = (perk: MembershipPerk) => {
    setPerks((prev) =>
      prev.includes(perk) ? prev.filter((p) => p !== perk) : [...prev, perk],
    );
  };

  const handleSave = () => {
    const monthlyPriceKrw = Number(price.replace(/[^0-9]/g, "")) || 0;
    const validationKey = validateTierInput({
      name,
      monthlyPriceKrw,
      description,
      perks,
    });
    if (validationKey) {
      setErrorKey(validationKey);
      return;
    }
    setErrorKey(null);
    if (editingTier) {
      updateTier(editingTier.id, { name, monthlyPriceKrw, description, perks });
    } else {
      createTier({ creatorId, name, monthlyPriceKrw, description, perks });
    }
    onSaved();
  };

  return (
    <div className="rounded-2xl border border-line p-4 sm:p-6">
      <h3 className="text-base font-bold text-fg">
        {editingTier ? t("membership.tierEditor.editTitle") : t("membership.tierEditor.createTitle")}
      </h3>

      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="tier-name" className="text-sm font-semibold text-fg">
            {t("membership.tierEditor.nameLabel")}
          </label>
          <input
            id="tier-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value.slice(0, TIER_NAME_MAX_LENGTH))}
            placeholder={t("membership.tierEditor.namePlaceholder")}
            className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted/60 focus:border-accent focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="tier-price" className="text-sm font-semibold text-fg">
            {t("membership.tierEditor.priceLabel")}
          </label>
          <input
            id="tier-price"
            type="text"
            inputMode="numeric"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder={t("membership.tierEditor.pricePlaceholder", {
              min: formatMembershipKrw(TIER_PRICE_MIN_KRW),
              max: formatMembershipKrw(TIER_PRICE_MAX_KRW),
            })}
            className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm tabular-nums text-fg placeholder:text-muted/60 focus:border-accent focus:outline-none"
          />
          <p className="mt-1 text-xs text-muted">{t("membership.tierEditor.priceHint")}</p>
        </div>

        <div>
          <label htmlFor="tier-description" className="text-sm font-semibold text-fg">
            {t("membership.tierEditor.descriptionLabel")}
          </label>
          <textarea
            id="tier-description"
            value={description}
            onChange={(event) => setDescription(event.target.value.slice(0, TIER_DESCRIPTION_MAX_LENGTH))}
            rows={2}
            placeholder={t("membership.tierEditor.descriptionPlaceholder")}
            className="mt-1 w-full resize-none rounded-xl border border-line bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted/60 focus:border-accent focus:outline-none"
          />
        </div>

        <fieldset>
          <legend className="text-sm font-semibold text-fg">
            {t("membership.tierEditor.perksLabel")}
          </legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {MEMBERSHIP_PERK_IDS.map((perk) => {
              const selected = perks.includes(perk);
              return (
                <button
                  key={perk}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  onClick={() => togglePerk(perk)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left transition",
                    selected
                      ? "border-accent bg-accent/10"
                      : "border-line hover:border-fg/30",
                  )}
                >
                  <span className="block text-sm font-semibold text-fg">
                    {t(`membership.perk.${perk}`)}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {t(`membership.perk.${perk}Description`)}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {errorKey && (
          <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-fg">
            {t(`membership.tierEditor.error.${errorKey}`)}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            className={cn(buttonClass({ variant: "solid" }), "gap-1.5")}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {editingTier ? t("membership.tierEditor.save") : t("membership.tierEditor.create")}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className={buttonClass({ variant: "outline" })}
            >
              {t("membership.tierEditor.cancel")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
