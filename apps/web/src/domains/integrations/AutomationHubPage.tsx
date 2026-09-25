import { CheckCircle2, Download, Play, Save, Workflow } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getApiErrorMessage } from "@/infrastructure/api";
import { useI18n } from "@/shared/lib/i18n";

import { IntegrationLoading, IntegrationPage } from "./IntegrationUi";
import { integrationPlatformClient } from "./integration-platform-client";
import {
  downloadIntegrationJson,
  loadIntegrationRecipes,
  saveIntegrationRecipes,
} from "./integration-platform-storage";
import type {
  IntegrationCatalogResponse,
  IntegrationRecipeDraft,
  IntegrationRecipesResponse,
  IntegrationRecipeValidation,
} from "./integration-platform-types";

export function AutomationHubPage() {
  const lang = useI18n((state) => state.lang);
  const ko = lang.startsWith("ko");
  const [catalog, setCatalog] = useState<IntegrationCatalogResponse | null>(null);
  const [definition, setDefinition] = useState<IntegrationRecipesResponse | null>(null);
  const [recipes, setRecipes] = useState<readonly IntegrationRecipeDraft[]>([]);
  const [validations, setValidations] = useState<Record<string, IntegrationRecipeValidation>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      integrationPlatformClient.catalog(),
      integrationPlatformClient.recipes(),
    ]).then(([catalogResponse, recipeResponse]) => {
      if (cancelled) return;
      setCatalog(catalogResponse);
      setDefinition(recipeResponse);
      setRecipes(loadIntegrationRecipes(recipeResponse.templates));
    }).catch(async (error: unknown) => {
      if (!cancelled) setMessage(await getApiErrorMessage(error, "자동화 구성을 불러오지 못했습니다."));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const providerOptions = useMemo(() => catalog?.providers ?? [], [catalog]);

  const updateRecipe = (id: string, update: (recipe: IntegrationRecipeDraft) => IntegrationRecipeDraft) => {
    setRecipes((current) => current.map((recipe) => recipe.id === id ? update(recipe) : recipe));
    setValidations((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const validate = async (recipe: IntegrationRecipeDraft) => {
    setBusyId(recipe.id);
    setMessage(null);
    try {
      const result = await integrationPlatformClient.validateRecipe(recipe);
      setValidations((current) => ({ ...current, [recipe.id]: result }));
    } catch (error) {
      setMessage(await getApiErrorMessage(error, "자동화 검증에 실패했습니다."));
    } finally {
      setBusyId(null);
    }
  };

  const save = () => {
    saveIntegrationRecipes(recipes);
    setMessage(ko ? "이 브라우저에 자동화 구성을 저장했습니다." : "Automation recipes saved in this browser.");
  };

  return (
    <IntegrationPage
      eyebrow={ko ? "워크플로 · 이벤트" : "Workflow · events"}
      title={ko ? "자동화 허브" : "Automation hub"}
      description={ko
        ? "제작 이벤트를 일정·회의·파일·업무·알림·게시·서명 작업으로 연결합니다. 활성화 전에 공급자 기능과 운영 설정을 서버에서 검증합니다."
        : "Connect production events to calendar, meeting, file, task, notification, publishing and signing actions. Provider capability is validated before activation."}
    >
      {!definition || !catalog ? <IntegrationLoading message={message ?? undefined} /> : null}
      {definition && catalog ? (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            <button type="button" onClick={save} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent">
              <Save size={16} aria-hidden /> {ko ? "구성 저장" : "Save recipes"}
            </button>
            <button type="button" onClick={() => downloadIntegrationJson("toonspectrum-automation-recipes.json", recipes)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold text-fg-2">
              <Download size={16} aria-hidden /> {ko ? "JSON 내보내기" : "Export JSON"}
            </button>
          </div>
          {message ? <p className="mb-5 rounded-xl border border-line bg-panel p-3 text-sm text-fg-2">{message}</p> : null}
          <section className="space-y-4" aria-label={ko ? "자동화 레시피" : "Automation recipes"}>
            {recipes.map((recipe) => {
              const validation = validations[recipe.id];
              return (
                <article key={recipe.id} className="rounded-2xl border border-line bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent"><Workflow size={18} aria-hidden /></span>
                      <div>
                        <input
                          aria-label={ko ? "자동화 이름" : "Recipe name"}
                          value={recipe.name}
                          onChange={(event) => {
                            const name = event.currentTarget.value;
                            updateRecipe(recipe.id, (current) => ({ ...current, name }));
                          }}
                          className="w-full max-w-md border-0 bg-transparent p-0 text-lg font-bold text-fg outline-none"
                        />
                        <p className="mt-1 text-xs text-fg-3">{recipe.trigger}</p>
                      </div>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-fg-2">
                      <input
                        type="checkbox"
                        checked={recipe.enabled}
                        onChange={(event) => {
                          const enabled = event.currentTarget.checked;
                          updateRecipe(recipe.id, (current) => ({ ...current, enabled }));
                        }}
                      />
                      {ko ? "사용" : "Enabled"}
                    </label>
                  </div>
                  <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                    {recipe.actions.map((action, index) => (
                      <div key={`${action.type}-${index}`} className="rounded-xl border border-line bg-panel/50 p-3">
                        <p className="text-xs font-semibold text-fg-3">{action.type}</p>
                        <select
                          value={action.providerId}
                          aria-label={`${action.type} provider`}
                          onChange={(event) => {
                            const providerId = event.currentTarget.value;
                            updateRecipe(recipe.id, (current) => ({
                              ...current,
                              actions: current.actions.map((item, actionIndex) => (
                                actionIndex === index ? { ...item, providerId } : item
                              )),
                            }));
                          }}
                          className="mt-2 min-h-10 w-full rounded-lg border border-line bg-canvas px-2 text-sm text-fg"
                        >
                          {providerOptions.map((provider) => (
                            <option key={provider.id} value={provider.id}>
                              {provider.name} · {provider.status}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={busyId === recipe.id}
                      onClick={() => void validate(recipe)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-fg"
                    >
                      <Play size={15} aria-hidden /> {busyId === recipe.id ? (ko ? "검증 중" : "Validating") : (ko ? "실행 가능성 검증" : "Validate")}
                    </button>
                    {validation ? (
                      <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${validation.executable ? "text-good" : validation.valid ? "text-warn" : "text-danger"}`}>
                        <CheckCircle2 size={15} aria-hidden />
                        {validation.executable
                          ? (ko ? "실행 가능" : "Executable")
                          : validation.valid
                            ? (ko ? "구성은 유효하지만 공급자 설정 필요" : "Valid, provider setup required")
                            : (ko ? "구성 오류" : "Invalid")}
                      </span>
                    ) : null}
                  </div>
                  {validation && (validation.errors.length > 0 || validation.warnings.length > 0) ? (
                    <ul className="mt-4 space-y-1 text-xs text-fg-3">
                      {[...validation.errors, ...validation.warnings].map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  ) : null}
                </article>
              );
            })}
          </section>
        </>
      ) : null}
    </IntegrationPage>
  );
}
