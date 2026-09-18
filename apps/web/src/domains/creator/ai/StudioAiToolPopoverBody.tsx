import {
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  Clapperboard,
  Images,
  Languages,
  ScanText,
  Settings2,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { Suspense, useCallback } from "react";

import { StudioMenuPopoverHeader, StudioMenuSubtabs } from "../studio-chrome-ui";
import {
  StudioAdvancedAiTools,
  StudioAiAssistHub,
  StudioAiBackgroundPanel,
  StudioAiCharacterConsistencyPanel,
  StudioAiCompositionPanel,
  StudioDialogueSuggestPanel,
  StudioIntegrationsSettingsPanel,
  StudioPaletteSuggestPanel,
  StudioStockImagePanel,
  preloadStudioIntegrationsSettingsPanel,
  preloadStudioStockImagePanel,
} from "../studio-page-lazy-ui";
import { StudioPanelLoading } from "../StudioLazySurfaceFallback";

import { pushStudioAiRecentPrompt } from "./studio-ai-assist-ux";
import { isStudioAiConfigured } from "./studio-ai-client";
import {
  requestStudioGenerated3dArtifact,
  useStudioGenerated3dHostBridge,
} from "./studio-generated-3d-product-bridge";
import { createStudioAiComicComposerHandoff } from "./studio-ai-comic-composer-handoff";
import { requestStudioAiComicComposerOpen } from "./studio-ai-comic-composer-intent";
import { requestStudioAiEpisodeProductionOpen } from "./studio-ai-episode-production-intent";
import { preloadStudioAiEpisodeProductionModal } from "./studio-ai-episode-production-loader";
import { requestStudioAiSuperSuiteOpen } from "./studio-ai-super-suite-intent";
import { preloadStudioAiSuperSuiteModal } from "./studio-ai-super-suite-loader";
import { StudioAiEpisodeProductionGateway } from "./StudioAiEpisodeProductionGateway";
import { StudioAiSuperSuiteGateway } from "./StudioAiSuperSuiteGateway";

import type { StudioMenu } from "../studio-editor-tool-model";
import type { StudioServerAiProviderPreference } from "../studio-server-ai-client";
import type { StudioAiEpisodeProductionPlan } from "./studio-ai-episode-production-director";
import type { StudioToolBeltContentProps } from "../StudioToolBeltContent";

import { useSession } from "@/compat/auth-session-store";
import { AiRecoveryNotice } from "@/shared/ai/AiRecoveryNotice";
import {
  useUserAi,
  userAiAutomaticExternalConnectionsForCapability,
} from "@/shared/ai/user-ai-store";
import { useT } from "@/shared/lib/i18n";



export interface StudioAiToolPopoverBodyProps {
  readonly toolBelt: StudioToolBeltContentProps;
}

export function StudioAiToolPopoverBody({
  toolBelt,
}: StudioAiToolPopoverBodyProps) {
  const t = useT();
  const { data: session, ready: sessionReady, status: sessionStatus } = useSession();
  useUserAi();
  const lt = (fallback: string, key: string) => {
    const translated = t(key);
    return translated === key ? fallback : translated;
  };

  const {
    activePage,
    activeServerAiProviderLabel,
    aiAssistTool,
    aiBgBusy,
    aiBgError,
    aiBgPrompt,
    aiBgSize,
    aiCharacterBusy,
    aiCharacterError,
    aiCharacterPrompt,
    aiCompositionDraft,
    aiDialogueSuggestBusy,
    aiDialogueSuggestCandidates,
    aiDialogueSuggestError,
    aiDialogueSuggestIncludeContext,
    aiDialogueSuggestSituation,
    aiPaletteSuggestBusy,
    aiPaletteSuggestError,
    aiPaletteSuggestion,
    aiPaletteSuggestMood,
    aiPaletteSuggestSavedMsg,
    aiRecentPrompts,
    aiSettings,
    configuredServerAiProviders,
    masterEditMode,
    menu,
    selected,
    serverAiProvider,
    serverAiStatus,
    setAiAssistTool,
    setAiBgPrompt,
    setAiBgSize,
    setAiCharacterPrompt,
    setAiCompositionDraft,
    setAiDialogueSuggestIncludeContext,
    setAiDialogueSuggestSituation,
    setAiPaletteSuggestMood,
    setAiRecentPrompts,
    setBg3dOpen,
    setDialogueTranslateOpen,
    setMenu,
    setScenarioOpen,
    setTool,
    textAiConfigured,
    textAiTransport,
  } = toolBelt;
  const {
    addDialogueSuggestionToScript,
    announceDrawingShortcut,
    applyAiAssistPresetPrompt,
    beginTrackedStudioAiOperation,
    disarmAllPixelTools,
    executeSuggestColorPalette,
    executeSuggestDialogueLines,
    insertAiCompositionNote,
    insertDialogueSuggestionToSelected,
    insertStockImage,
    onGenerateAiBackground,
    onGenerateAiCharacter,
    pendingTextAiProviderContext,
    saveSuggestedPaletteToLibrary,
    settleTrackedTextAiOperation,
    updateAiSettings,
    updateServerAiProvider,
  } = toolBelt.stableHandlers;

  const openGenerated3dImporter = useCallback(() => {
    setBg3dOpen(true);
  }, [setBg3dOpen]);
  useStudioGenerated3dHostBridge({
    ownerId: session?.user.id ?? "guest",
    openObjectInsert: openGenerated3dImporter,
  });

  const personalTextRoutes = userAiAutomaticExternalConnectionsForCapability("text");
  const personalTextConfigured = personalTextRoutes.length > 0;
  const personalFreeTextConfigured = personalTextRoutes.some((route) =>
    route.costPolicy === "provider-free-tier" || route.costPolicy === "openrouter-free"
  );
  const managedTextReady = textAiTransport.mode === "server"
    && serverAiStatus?.configured === true
    && (!serverAiStatus.requiresAuth || sessionStatus === "authenticated");
  const serverStatusPending = textAiTransport.mode === "server"
    && serverAiStatus === null
    && !personalTextConfigured;
  const serverSessionChecking = sessionReady === false
    && textAiTransport.mode === "server"
    && serverAiStatus?.configured === true
    && Boolean(serverAiStatus.requiresAuth)
    && !personalTextConfigured;
  const serverLoginRequired = sessionReady
    && textAiTransport.mode === "server"
    && serverAiStatus?.configured === true
    && Boolean(serverAiStatus.requiresAuth)
    && sessionStatus === "unauthenticated"
    && !personalTextConfigured;
  const textAiReady = personalTextConfigured
    || managedTextReady
    || (textAiTransport.mode !== "server" && textAiConfigured);
  const imageAiConfigured = isStudioAiConfigured(aiSettings);

  const openTranslationSurface = (surface: "translate" | "qa") => {
    setDialogueTranslateOpen(surface);
    setMenu(null);
    announceDrawingShortcut(
      surface === "translate"
        ? "대사 번역 검토 화면을 열었어요."
        : "현지화 QA와 말풍선 넘침 검사를 열었어요.",
    );
  };

  const applyEpisodeProductionPlan = (plan: StudioAiEpisodeProductionPlan) => {
    if (masterEditMode) {
      announceDrawingShortcut("마스터 편집 중에는 회차 AI 컷 제작을 사용할 수 없어요.");
      return;
    }
    const handoff = createStudioAiComicComposerHandoff(plan);
    requestStudioAiComicComposerOpen(handoff);
    setMenu(null);
    announceDrawingShortcut(
      `${handoff.totalCuts}컷 전체 제작 계획을 편집 가능한 후보 보드로 넘겼어요.`
    );
  };

  const applySuperSuitePrompt = (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const target = aiAssistTool === "character" ? "character" : "background";
    if (target === "character") setAiCharacterPrompt(trimmed);
    else setAiBgPrompt(trimmed);
    setAiAssistTool(target);
    setAiRecentPrompts(
      pushStudioAiRecentPrompt(globalThis.sessionStorage, target, trimmed)
    );
    setMenu("aiAssist");
    announceDrawingShortcut(
      target === "character"
        ? "슈퍼 스위트 프롬프트를 캐릭터 생성 도구에 적용했어요."
        : "슈퍼 스위트 프롬프트를 배경 생성 도구에 적용했어요."
    );
  };

  return (
    <>
      <StudioMenuPopoverHeader
        icon={WandSparkles}
        title={lt("AI 연동", "studio.aiToolPopover.title")}
        description={lt(
          "회차 제작·초안·스톡·시나리오를 연결하고, 키 설정은 연동 탭에서 관리합니다.",
          "studio.aiToolPopover.description"
        )}
        className="shrink-0"
      />
      <StudioMenuSubtabs
        aria-label={lt("AI 메뉴 구역", "studio.aiToolPopover.menuAria")}
        className="shrink-0"
        activeId={
          menu === "aiAssist" || menu === "stockImage" || menu === "integrations"
            ? menu
            : translateCurrentStaticSourceText("domains.creator.ai.StudioAiToolPopoverBody", "en", "aiAssist")
        }
        onSelect={(id) => {
          if (id === "scenario") {
            if (masterEditMode) return;
            setScenarioOpen(true);
            setMenu(null);
            return;
          }
          if (id === "stockImage") preloadStudioStockImagePanel();
          if (id === "integrations") preloadStudioIntegrationsSettingsPanel();
          setMenu(id as StudioMenu);
        }}
        items={[
          {
            id: "aiAssist",
            label: lt("어시스트", "studio.aiToolPopover.tabAssist"),
            icon: Sparkles,
            title: lt("회차 제작·배경·캐릭터·구도 제안", "studio.aiToolPopover.tabAssistTitle"),
          },
          {
            id: "scenario",
            label: lt("시나리오", "studio.aiToolPopover.tabScenario"),
            icon: Clapperboard,
            disabled: masterEditMode,
            title: masterEditMode
              ? lt("마스터 편집 중에는 사용할 수 없어요", "studio.aiToolPopover.tabScenarioDisabled")
              : lt("시나리오 설계", "studio.aiToolPopover.tabScenarioTitle"),
          },
          {
            id: "stockImage",
            label: lt("스톡", "studio.aiToolPopover.tabStock"),
            icon: Images,
            title: lt("Unsplash 무료 사진", "studio.aiToolPopover.tabStockTitle"),
          },
          {
            id: "integrations",
            label: lt("설정", "studio.aiToolPopover.tabIntegrations"),
            icon: Settings2,
            title: lt("자동 무료 AI·개인 키 설정", "studio.aiToolPopover.tabIntegrationsTitle"),
          },
        ]}
      />
      {menu === "aiAssist" && (
        <div
          className="pointer-events-auto relative z-[4] flex min-h-0 flex-1 flex-col isolate"
          data-studio-ai-pointer-shield="true"
        >
          <Suspense
            fallback={
              <StudioPanelLoading label={lt("AI 어시스트 패널을 여는 중...", "studio.aiToolPopover.panelLoadingAssist")} />
            }
          >
            <StudioAiAssistHub
              className="min-h-0 flex-1"
              activeTool={aiAssistTool}
              onToolChange={setAiAssistTool}
              imageConfigured={imageAiConfigured}
              textConfigured={textAiReady}
              connectionOk={textAiReady || imageAiConfigured}
              connectionLabel={
                serverStatusPending || serverSessionChecking
                  ? lt("무료 AI 상태 확인 중", "studio.aiToolPopover.serverSessionChecking")
                  : serverLoginRequired
                    ? lt("무료 AI 준비됨 · 로그인 필요", "studio.aiToolPopover.serverLoginRequired")
                    : personalTextConfigured && sessionStatus === "unauthenticated"
                      ? personalFreeTextConfigured
                        ? lt("내 무료 API 연결됨", "studio.aiToolPopover.personalFreeConnected")
                        : lt("내 BYOK 연결됨", "studio.aiToolPopover.personalByokConnected")
                      : textAiConfigured
                      ? textAiTransport.mode === "server"
                      ? lt(
                          `${activeServerAiProviderLabel} 연결됨`,
                          "studio.aiToolPopover.serverProviderConnected"
                        ).replace("{provider}", activeServerAiProviderLabel)
                      : lt("내 API 연결됨", "studio.aiToolPopover.internalProviderConnected")
                  : imageAiConfigured
                    ? lt("이미지 API 연결됨", "studio.aiToolPopover.imageApiConnected")
                    : serverAiStatus?.configured
                      ? lt("로그인하면 자동 무료 AI 사용", "studio.aiToolPopover.serverLoginHint")
                      : lt("무료 AI 준비 중 · 개인 키 연결 가능", "studio.aiToolPopover.apiKeyNeed")
              }
              onOpenSettings={() => {
                preloadStudioIntegrationsSettingsPanel();
                setMenu("integrations");
              }}
              onPreloadSettings={preloadStudioIntegrationsSettingsPanel}
              onOpenEpisodeProduction={() => requestStudioAiEpisodeProductionOpen()}
              onPreloadEpisodeProduction={preloadStudioAiEpisodeProductionModal}
              onPreloadSuperSuite={preloadStudioAiSuperSuiteModal}
              recentState={aiRecentPrompts}
              onApplyPresetPrompt={applyAiAssistPresetPrompt}
              onOpenScenario={() => {
                if (masterEditMode) return;
                setScenarioOpen(true);
                setMenu(null);
              }}
              scenarioDisabled={masterEditMode}
              scenarioDisabledReason={translateCurrentStaticSourceText("domains.creator.ai.StudioAiToolPopoverBody", "ko", "마스터 편집 중에는 시나리오 제작을 사용할 수 없어요.")}
              onOpenSuperSuite={() => {
                requestStudioAiSuperSuiteOpen();
              }}
              providerSlot={
                <div className="grid gap-2">
                  {serverLoginRequired ? (
                    <AiRecoveryNotice
                      code="login_required"
                      message={translateCurrentStaticSourceText("domains.creator.ai.StudioAiToolPopoverBody", "ko", "로그인하면 현재 입력을 유지한 채 자동 무료 AI를 사용할 수 있어요. 로그인 없이 쓰려면 개인 무료 API 키를 연결하세요.")}
                      compact
                    />
                  ) : null}
                  {textAiTransport.mode === "server"
                    && configuredServerAiProviders.length > 0
                    && !serverLoginRequired
                    && !serverSessionChecking
                    && !(personalTextConfigured && sessionStatus === "unauthenticated") ? (
                    <div className="rounded-xl border border-line bg-card/35 p-2.5">
                    <label className="flex items-center justify-between gap-2 text-xs font-semibold text-fg-2">
                      <span>{lt("텍스트 AI 제공자", "studio.aiToolPopover.textAiProvider")}</span>
                      <select
                        value={serverAiProvider}
                        onChange={(event) =>
                          updateServerAiProvider(event.target.value as StudioServerAiProviderPreference)
                        }
                        className="min-h-11 min-w-0 rounded-lg border border-line bg-panel px-2 text-xs text-fg outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25"
                        aria-label={lt("서버 텍스트 AI 제공자", "studio.aiToolPopover.serverTextAiProviderAria")}
                      >
                        <option value="auto">{lt("자동 전환", "studio.aiToolPopover.serverProviderAuto")}</option>
                        {(serverAiStatus?.providers?.length
                          ? serverAiStatus.providers
                          : [
                              { id: "gemini" as const, label: "Gemini 무료", configured: false, model: "" },
                              { id: "qwen" as const, label: "Qwen 베이징 무료 할당량", configured: false, model: "" },
                              { id: "groq" as const, label: "Groq 무료", configured: false, model: "" },
                              { id: "sambanova" as const, label: "SambaNova 무료", configured: false, model: "" },
                              { id: "zai" as const, label: "Z.AI 무료 Flash", configured: false, model: "" },
                              { id: "mistral" as const, label: "Mistral 무료", configured: false, model: "" },
                              { id: "cloudflare" as const, label: "Cloudflare Workers AI 무료", configured: false, model: "" },
                              { id: "openrouter" as const, label: "OpenRouter 무료", configured: false, model: "" },
                              { id: "siliconflow" as const, label: "SiliconFlow 무료 텍스트", configured: false, model: "" },
                            ]
                        ).map((provider) => (
                          <option key={provider.id} value={provider.id} disabled={!provider.configured}>
                            {provider.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="mt-1.5 text-[0.65rem] leading-relaxed text-fg-3">
                      {lt(
                        "무료 한도·요청 제한으로 추론 전에 거절된 경우에만 다음 무료 제공자로 전환합니다. 네트워크 오류·타임아웃·5xx에는 중복 요청하지 않아요.",
                        "studio.aiToolPopover.serverFallbackMessage"
                      )}
                    </p>
                  </div>
                ) : null}
                </div>
              }
              toolPanel={
                <>
                  <section
                    className="rounded-xl border border-line bg-card/55 p-2"
                    aria-label={translateCurrentStaticSourceText("domains.creator.ai.StudioAiToolPopoverBody", "ko", "AI 번역·검수 바로가기")}
                  >
                    <div className="flex items-center justify-between gap-2 px-1">
                      <strong className="text-[0.64rem] font-black text-fg-2">{translateCurrentStaticSourceText("domains.creator.ai.StudioAiToolPopoverBody", "ko", "번역·검수")}</strong>
                      <span className="text-[0.56rem] text-fg-3">{translateCurrentStaticSourceText("domains.creator.ai.StudioAiToolPopoverBody", "ko", "현재 문서 기준")}</span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => openTranslationSurface("translate")}
                        data-studio-ai-translation-launcher="true"
                        className="flex min-h-12 min-w-0 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-2 text-left transition-colors hover:border-accent/45 hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                          <Languages size={14} aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-[0.66rem] font-black text-fg">{translateCurrentStaticSourceText("domains.creator.ai.StudioAiToolPopoverBody", "ko", "대사 번역")}</strong>
                          <span className="block truncate text-[0.55rem] text-fg-3">{translateCurrentStaticSourceText("domains.creator.ai.StudioAiToolPopoverBody", "ko", "검토 후 적용")}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openTranslationSurface("qa")}
                        data-studio-ai-localization-qa-launcher="true"
                        className="flex min-h-12 min-w-0 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-2 text-left transition-colors hover:border-accent/45 hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                          <ScanText size={14} aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-[0.66rem] font-black text-fg">{translateCurrentStaticSourceText("domains.creator.ai.StudioAiToolPopoverBody", "ko", "현지화 QA")}</strong>
                          <span className="block truncate text-[0.55rem] text-fg-3">{translateCurrentStaticSourceText("domains.creator.ai.StudioAiToolPopoverBody", "ko", "넘침·문체 검사")}</span>
                        </span>
                      </button>
                    </div>
                  </section>
                  {aiAssistTool === "background" ? (
                    <StudioAiBackgroundPanel
                      configured={isStudioAiConfigured(aiSettings)}
                      prompt={aiBgPrompt}
                      onPromptChange={setAiBgPrompt}
                      size={aiBgSize}
                      onSizeChange={setAiBgSize}
                      busy={aiBgBusy}
                      error={aiBgError}
                      onGenerate={onGenerateAiBackground}
                    />
                  ) : null}
                  {aiAssistTool === "character" ? (
                    <StudioAiCharacterConsistencyPanel
                      configured={isStudioAiConfigured(aiSettings)}
                      hasReference={selected?.type === "image"}
                      referenceThumbnail={selected?.type === "image" ? selected.src : null}
                      prompt={aiCharacterPrompt}
                      onPromptChange={setAiCharacterPrompt}
                      busy={aiCharacterBusy}
                      error={aiCharacterError}
                      onRequestSelectReference={() => {
                        disarmAllPixelTools();
                        setTool("select");
                        announceDrawingShortcut(
                          "기준 캐릭터 이미지를 선택하세요 · Esc로 취소",
                        );
                      }}
                      onGenerate={() => {
                        const prompt = aiCharacterPrompt.trim();
                        if (prompt) {
                          setAiRecentPrompts(
                            pushStudioAiRecentPrompt(globalThis.sessionStorage, "character", prompt)
                          );
                        }
                        onGenerateAiCharacter();
                      }}
                    />
                  ) : null}
                  {aiAssistTool === "composition" ? (
                    <StudioAiCompositionPanel
                      settings={aiSettings}
                      transport={textAiTransport}
                      configured={textAiReady}
                      sceneText={aiCompositionDraft}
                      onSceneTextChange={setAiCompositionDraft}
                      onInsertAsNote={insertAiCompositionNote}
                      onOperationStart={(prompt) => {
                        setAiRecentPrompts(
                          pushStudioAiRecentPrompt(globalThis.sessionStorage, "composition", prompt)
                        );
                        const provider = pendingTextAiProviderContext();
                        return beginTrackedStudioAiOperation("composition", {
                          kind: "text",
                          task: "composition",
                          provider: provider.provider,
                          model: provider.model,
                          transport: provider.transport,
                          promptVersion: 1,
                          prompt,
                          target: { pageId: activePage.id },
                          references: [],
                        });
                      }}
                      onOperationSettled={({ operationId, result, textProvenance }) => {
                        settleTrackedTextAiOperation(operationId, result, textProvenance);
                      }}
                    />
                  ) : null}
                  {aiAssistTool === "dialogue" ? (
                    <StudioDialogueSuggestPanel
                      configured={textAiReady}
                      situationText={aiDialogueSuggestSituation}
                      onSituationTextChange={setAiDialogueSuggestSituation}
                      hasContext={activePage.elements.some(
                        (el) => (el.type === "bubble" || el.type === "text") && el.text.trim().length > 0
                      )}
                      includeContext={aiDialogueSuggestIncludeContext}
                      onIncludeContextChange={setAiDialogueSuggestIncludeContext}
                      busy={aiDialogueSuggestBusy}
                      error={aiDialogueSuggestError}
                      candidates={aiDialogueSuggestCandidates}
                      onGenerate={() => {
                        const prompt = aiDialogueSuggestSituation.trim();
                        if (prompt) {
                          setAiRecentPrompts(
                            pushStudioAiRecentPrompt(globalThis.sessionStorage, "dialogue", prompt)
                          );
                        }
                        void executeSuggestDialogueLines();
                      }}
                      canInsertToSelected={
                        !!selected && (selected.type === "bubble" || selected.type === "text")
                      }
                      onAddToScript={addDialogueSuggestionToScript}
                      onInsertToSelected={insertDialogueSuggestionToSelected}
                    />
                  ) : null}
                  {aiAssistTool === "palette" ? (
                    <StudioPaletteSuggestPanel
                      configured={textAiReady}
                      moodText={aiPaletteSuggestMood}
                      onMoodTextChange={setAiPaletteSuggestMood}
                      busy={aiPaletteSuggestBusy}
                      error={aiPaletteSuggestError}
                      suggestion={aiPaletteSuggestion}
                      savedMessage={aiPaletteSuggestSavedMsg}
                      onGenerate={() => {
                        const prompt = aiPaletteSuggestMood.trim();
                        if (prompt) {
                          setAiRecentPrompts(
                            pushStudioAiRecentPrompt(globalThis.sessionStorage, "palette", prompt)
                          );
                        }
                        void executeSuggestColorPalette();
                      }}
                      onSaveToLibrary={saveSuggestedPaletteToLibrary}
                    />
                  ) : null}
                  <StudioAdvancedAiTools
                    userId={session?.user.id}
                    onInsertGenerated3d={(blob, revisionId) => {
                      requestStudioGenerated3dArtifact({
                        intent: "insert",
                        blob,
                        revisionId,
                      });
                    }}
                  />
                </>
              }
            />
          </Suspense>
        </div>
      )}
      {menu === "stockImage" && (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <Suspense
            fallback={
              <StudioPanelLoading label={lt("스톡 사진 패널을 여는 중...", "studio.aiToolPopover.panelLoadingStock")} />
            }
          >
            <StudioStockImagePanel
              onInsert={insertStockImage}
              onOpenSettings={() => {
                preloadStudioIntegrationsSettingsPanel();
                setMenu("integrations");
              }}
            />
          </Suspense>
        </div>
      )}
      {menu === "integrations" && (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <Suspense
            fallback={
              <StudioPanelLoading
                label={lt("연동 설정 패널을 여는 중...", "studio.aiToolPopover.panelLoadingIntegrations")}
              />
            }
          >
            <StudioIntegrationsSettingsPanel aiSettings={aiSettings} onAiSettingsChange={updateAiSettings} />
          </Suspense>
        </div>
      )}

      <StudioAiEpisodeProductionGateway onApplyPlan={applyEpisodeProductionPlan} />

      <StudioAiSuperSuiteGateway onApplyPrompt={applySuperSuitePrompt} />
    </>
  );
}
