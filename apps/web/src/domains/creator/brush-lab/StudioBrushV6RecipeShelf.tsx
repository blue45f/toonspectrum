import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { useId, useState } from "react";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { BRUSH_STUDIO_V6_RECIPES } from "./brush-studio-v6-engine";
import { BRUSH_STUDIO_V6_RECIPE_GROUPS, searchBrushStudioV6Recipes } from "./brush-studio-v6-recipe-search";

const FIELD = `min-h-11 rounded-xl border border-line bg-card px-3 text-sm text-fg ${STUDIO_FOCUS_RING}`;
interface Props { readonly selectedId: string; readonly onChoose: (id: string) => void; }

export function StudioBrushV6RecipeShelf({ selectedId, onChoose }: Props) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const recipes = searchBrushStudioV6Recipes(query, group);
  const reset = () => { setQuery(""); setGroup("all"); };
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <label htmlFor={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.brush.lab.StudioBrushV6RecipeShelf", "en", "{v0}-search"), { v0: String(id) })} className="text-xs font-bold text-fg-2">{translateCurrentStaticSourceText("domains.creator.brush.lab.StudioBrushV6RecipeShelf", "ko", "브러시 레시피 검색")}<input id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.brush.lab.StudioBrushV6RecipeShelf", "en", "{v0}-search"), { v0: String(id) })} type="search" maxLength={160} value={query}
          placeholder={translateCurrentStaticSourceText("domains.creator.brush.lab.StudioBrushV6RecipeShelf", "ko", "이름·용도·영문 ID 검색")} onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }} className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.brush.lab.StudioBrushV6RecipeShelf", "en", "{v0} mt-1.5 w-full"), { v0: String(FIELD) })} />
      </label>
      <label htmlFor={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.brush.lab.StudioBrushV6RecipeShelf", "en", "{v0}-group"), { v0: String(id) })} className="text-xs font-bold text-fg-2">{translateCurrentStaticSourceText("domains.creator.brush.lab.StudioBrushV6RecipeShelf", "ko", "브러시 용도")}<select id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.brush.lab.StudioBrushV6RecipeShelf", "en", "{v0}-group"), { v0: String(id) })} value={group} onChange={(event) => setGroup(event.currentTarget.value)} className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.brush.lab.StudioBrushV6RecipeShelf", "en", "{v0} mt-1.5 w-full"), { v0: String(FIELD) })}>
          <option value="all">{translateCurrentStaticSourceText("domains.creator.brush.lab.StudioBrushV6RecipeShelf", "ko", "전체 용도")}</option>
          {BRUSH_STUDIO_V6_RECIPE_GROUPS.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
    </div>
    <p role="status" aria-live="polite" className="text-xs text-fg-3">{recipes.length} / {BRUSH_STUDIO_V6_RECIPES.length}{translateCurrentStaticSourceText("domains.creator.brush.lab.StudioBrushV6RecipeShelf", "ko", "개 레시피")}</p>
    {!recipes.length ? <div className="rounded-xl border border-line bg-bg-2/55 p-4">
      <p className="text-sm text-fg-2">{translateCurrentStaticSourceText("domains.creator.brush.lab.StudioBrushV6RecipeShelf", "ko", "검색 결과가 없습니다. 다른 이름이나 용도로 검색해 주세요.")}</p>
      <button type="button" onClick={reset} className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.brush.lab.StudioBrushV6RecipeShelf", "en", "{v0} mt-3 font-bold"), { v0: String(FIELD) })}>{translateCurrentStaticSourceText("domains.creator.brush.lab.StudioBrushV6RecipeShelf", "ko", "검색·필터 초기화")}</button>
    </div> : null}
    {BRUSH_STUDIO_V6_RECIPE_GROUPS.map((name) => {
      const entries = recipes.filter((recipe) => recipe.group === name);
      if (!entries.length) return null;
      return <section key={name} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.brush.lab.StudioBrushV6RecipeShelf", "ko", "{v0} 레시피"), { v0: String(name) })}>
        <h3 className="mb-2 text-xs font-black text-fg-2">{name} · {entries.length}</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{entries.map((recipe) =>
          <button key={recipe.id} type="button" aria-pressed={selectedId === recipe.id} onClick={() => onChoose(recipe.id)}
            className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.brush.lab.StudioBrushV6RecipeShelf", "en", "min-h-[108px] rounded-xl border p-3 text-left hover:border-accent/50 hover:bg-accent/10 {v0} {v1}"), { v0: String(selectedId === recipe.id ? "border-accent/60 bg-accent/10" : "border-line bg-bg-2/55"), v1: String(STUDIO_FOCUS_RING) })}>
            <span className="text-sm font-black text-fg">{recipe.label}</span>
            <span className="mt-2 block text-xs leading-relaxed text-fg-3">{recipe.description}</span>
          </button>)}
        </div>
      </section>;
    })}
  </div>;
}
