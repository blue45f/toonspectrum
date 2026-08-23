/**
 * 브러시 엔진 믹서 UI — 엔진 구성 표시 · 다른 브러시에서 특성 가져오기 · 커스텀 브러시로 저장.
 *
 * 로직은 전부 `studio-brush-engine-mix.ts`(순수)와 기존 라이브러리 저장 경로에 위임한다.
 * 저장은 내 브러시 제품 권위(SQLite/OPFS, 폴백 세션)를 직접 쓰고
 * `notifyStudioBrushLibraryChanged()`로 열려 있는 라이브러리 패널에 갱신을 알린다.
 */
import { CheckCircle2, Download, LoaderCircle, Save, TriangleAlert } from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";

import { STUDIO_FOCUS_RING, StudioSectionHeader } from "../studio-panel-ui";

import {
  STUDIO_LISTED_CORE_BRUSH_CATALOG_ITEMS,
  STUDIO_BRUSH_MEDIA_LABELS,
} from "./studio-brush-catalog-core";
import { studioBrushDynamicsSettingsForBrushId } from "./studio-brush-dynamics";
import {
  describeStudioBrushEngineStack,
  isStudioBrushMixTraitSectionId,
  mergeStudioBrushMixTraitSection,
  STUDIO_BRUSH_MIX_TRAIT_SECTIONS,
  suggestStudioBrushMixName,
} from "./studio-brush-engine-mix";
import {
  createBrush,
  type StudioBrushSnapshot,
} from "./studio-brush-library";
import {
  notifyStudioBrushLibraryChanged,
  openProductBrushLibraryRepository,
} from "./studio-brush-library-sqlite-repository";

import type { NormalizedStudioBrushDynamicsSettings } from "./studio-brush-dynamics";
import type { StudioBrushEngineProgramSet } from "./studio-brush-engine-program-set";

import { cn } from "@/lib/utils";

function MixerCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card/45 p-3">
      <h3 className="text-sm font-bold text-fg">{title}</h3>
      {description ? (
        <p className="mt-0.5 text-[0.65rem] leading-relaxed text-fg-3">{description}</p>
      ) : null}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

export function StudioBrushEngineStackPanel({
  brushId,
  settings,
  enginePrograms,
}: {
  brushId: string;
  settings: NormalizedStudioBrushDynamicsSettings;
  enginePrograms?: StudioBrushEngineProgramSet | null;
}) {
  const entries = useMemo(
    () => describeStudioBrushEngineStack(brushId, settings, enginePrograms),
    [brushId, settings, enginePrograms],
  );
  return (
    <MixerCard
      title="현재 엔진 구성"
      description="이 브러시가 한 획을 그리기 위해 실행하는 엔진 패스입니다."
    >
      <ul className="flex flex-wrap gap-1.5">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={cn(
              "flex min-h-7 items-center gap-1 rounded-lg border px-2 py-1 text-[0.66rem] font-semibold",
              entry.active
                ? "border-accent/35 bg-accent-soft text-fg"
                : "border-line bg-raised text-fg-3",
            )}
          >
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full", entry.active ? "bg-accent" : "bg-fg-3")}
            />
            {entry.label}
          </li>
        ))}
      </ul>
    </MixerCard>
  );
}

interface TraitImportProps {
  settings: NormalizedStudioBrushDynamicsSettings;
  onSettingsChange: (settings: NormalizedStudioBrushDynamicsSettings) => void;
}

export function StudioBrushTraitImportControls({ settings, onSettingsChange }: TraitImportProps) {
  const [sourceId, setSourceId] = useState("");
  const [status, setStatus] = useState<{ tone: "done" | "error"; message: string } | null>(null);

  const groupedItems = useMemo(() => {
    const groups = new Map<
      typeof STUDIO_LISTED_CORE_BRUSH_CATALOG_ITEMS[number]["mediaGroup"],
      typeof STUDIO_LISTED_CORE_BRUSH_CATALOG_ITEMS[number][]
    >();
    for (const item of STUDIO_LISTED_CORE_BRUSH_CATALOG_ITEMS) {
      if (item.operation !== "paint") continue;
      const bucket = groups.get(item.mediaGroup) ?? [];
      bucket.push(item);
      groups.set(item.mediaGroup, bucket);
    }
    return Array.from(groups.entries());
  }, []);

  function handleSectionImport(sectionId: string) {
    if (!isStudioBrushMixTraitSectionId(sectionId) || !sourceId) return;
    const sourceName =
      STUDIO_LISTED_CORE_BRUSH_CATALOG_ITEMS.find((item) => item.id === sourceId)?.name ?? sourceId;
    const sourceDynamics = studioBrushDynamicsSettingsForBrushId(sourceId);
    if (!sourceDynamics) {
      setStatus({ tone: "error", message: `"${sourceName}" 브러시에서 특성을 가져오지 못했어요.` });
      return;
    }
    const sectionLabel = STUDIO_BRUSH_MIX_TRAIT_SECTIONS.find(
      (section) => section.id === sectionId,
    )?.label ?? sectionId;
    onSettingsChange(mergeStudioBrushMixTraitSection(sectionId, settings, sourceDynamics));
    setStatus({ tone: "done", message: `${sectionLabel} — "${sourceName}"에서 가져왔어요.` });
  }

  return (
    <MixerCard
      title="다른 브러시에서 특성 가져오기"
      description="소스 브러시를 고르고 원하는 특성만 현재 브러시로 조합합니다. 캐리어와 프로그램 핀은 지금 브러시의 것을 유지합니다."
    >
      <label className="block">
        <span className="sr-only">소스 브러시</span>
        <select
          value={sourceId}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            setSourceId(event.currentTarget.value);
            setStatus(null);
          }}
          className={cn(
            "h-11 w-full rounded-xl border border-line bg-card px-2.5 text-xs font-medium text-fg",
            STUDIO_FOCUS_RING,
          )}
        >
          <option value="">소스 브러시 선택…</option>
          {groupedItems.map(([mediaGroup, items]) => (
            <optgroup key={mediaGroup} label={STUDIO_BRUSH_MEDIA_LABELS[mediaGroup] ?? mediaGroup}>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {STUDIO_BRUSH_MIX_TRAIT_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            disabled={!sourceId}
            title={section.description}
            onClick={() => handleSectionImport(section.id)}
            className={cn(
              "flex min-h-11 flex-col items-start justify-center rounded-xl border border-line bg-card px-2.5 py-1.5 text-left transition-colors hover:border-accent/45 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50",
              STUDIO_FOCUS_RING,
            )}
          >
            <span className="flex items-center gap-1.5 text-[0.7rem] font-bold text-fg">
              <Download size={12} className="text-accent" aria-hidden />
              {section.label}
            </span>
          </button>
        ))}
      </div>
      {status ? (
        <p
          role="status"
          className={cn(
            "mt-2 flex items-center gap-1.5 text-[0.66rem] font-medium",
            status.tone === "done" ? "text-good" : "text-warn",
          )}
        >
          {status.tone === "done"
            ? <CheckCircle2 size={13} aria-hidden />
            : <TriangleAlert size={13} aria-hidden />}
          {status.message}
        </p>
      ) : null}
    </MixerCard>
  );
}

interface SaveAsCustomProps {
  snapshot: StudioBrushSnapshot;
  baseBrushName: string;
}

export function StudioBrushSaveAsCustomControls({ snapshot, baseBrushName }: SaveAsCustomProps) {
  const [name, setName] = useState(() => suggestStudioBrushMixName(baseBrushName));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "done" | "error"; message: string } | null>(null);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setStatus(null);
    try {
      const created = createBrush(name, snapshot);
      const product = await openProductBrushLibraryRepository();
      await product.repository.put(created);
      notifyStudioBrushLibraryChanged();
      setStatus({
        tone: "done",
        message: product.authority === "sqlite"
          ? `"${created.name}" 브러시를 내 브러시에 저장했어요.`
          : `"${created.name}" 브러시를 현재 세션에 보관했어요. 브라우저를 닫으면 사라지므로 필요하면 파일로 내보내 주세요.`,
      });
    } catch (caught) {
      setStatus({
        tone: "error",
        message: caught instanceof Error && caught.message
          ? `저장하지 못했어요: ${caught.message}`
          : "저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <MixerCard
      title="커스텀 브러시로 저장"
      description="지금까지 조합한 설정 전체(캐리어·펜촉·질감·반응·엔진 프로그램)가 하나의 이름 있는 브러시로 저장됩니다."
    >
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <input
          type="text"
          value={name}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.currentTarget.value)}
          maxLength={40}
          aria-label="새 브러시 이름"
          placeholder="새 브러시 이름"
          className={cn(
            "h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-2.5 text-xs font-medium text-fg placeholder:text-fg-3",
            STUDIO_FOCUS_RING,
          )}
        />
        <button
          type="submit"
          disabled={saving}
          className={cn(
            "flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-accent bg-accent px-3.5 text-xs font-bold text-on-accent transition-colors hover:bg-accent-2 disabled:cursor-wait disabled:opacity-60",
            STUDIO_FOCUS_RING,
          )}
        >
          {saving
            ? <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />
            : <Save size={14} aria-hidden />}
          {saving ? "저장 중" : "내 브러시에 저장"}
        </button>
      </form>
      {status ? (
        <p
          role="status"
          data-studio-brush-save-custom-status={status.tone}
          className={cn(
            "mt-2 text-[0.66rem] font-medium leading-relaxed",
            status.tone === "done" ? "text-good" : "text-warn",
          )}
        >
          {status.message}
        </p>
      ) : null}
    </MixerCard>
  );
}

export function StudioBrushComposerIntro() {
  return (
    <StudioSectionHeader
      title="엔진 믹서"
      description="캐리어는 유지한 채 다른 브러시의 펜촉·질감·반응을 가져와 조합하고, 하나의 커스텀 브러시로 저장합니다."
    />
  );
}
