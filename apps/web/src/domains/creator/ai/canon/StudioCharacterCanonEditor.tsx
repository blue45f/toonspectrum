// 캐릭터 캐논 등록·수정 폼.
// 이름·외모·의상·특징 태그를 입력받고, 레퍼런스 이미지는 세 가지 경로로 받는다.
//  1) 파일 업로드 — 캔버스에서 512px로 줄인 data URL로 저장한다.
//  2) 기본 아바타 — repo에 번들로 들어 있는 샘플 캐릭터 썸네일에서 고른다.
//  3) 3D 셰이퍼 — character-lab/SHAPER 계열의 캐릭터 제작 화면으로 연결하고,
//     스냅샷 URL을 붙여넣을 수 있다(앱 경계가 달라 직접 import하지 않는다).
import { useRef, useState } from "react";
import { ImagePlus, Link2, Shapes, Trash2, UserRound } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  CANON_APPEARANCE_MAX,
  CANON_NAME_MAX,
  CANON_OUTFIT_MAX,
  type CanonReferenceSource,
  type CanonSheetDraft,
  type CharacterCanonSheet,
} from "./studio-character-canon";
import { isSafeReferenceImageUrl, safeReferenceImageSrc } from "./reference-image-src";

/**
 * 번들 샘플 아바타 썸네일 — domains/creator/vrm/vrm-library.ts의
 * BUNDLED_VRM_RIGHTS_BLOCKS와 같은 공개 에셋 경로. vrm-library 모듈은
 * sqlite/OPFS 저장소를 함께 끌어와서 무거우니 경로만 가져와 쓴다.
 */
const BUNDLED_AVATARS: readonly { readonly id: string; readonly name: string; readonly thumbnail: string }[] = [
  { id: "sample-vrm", name: "루미", thumbnail: "/assets/3d/characters/thumbnails/refined-v2/sample-vrm.png" },
  { id: "avatar-a", name: "하린", thumbnail: "/assets/3d/characters/thumbnails/refined-v2/avatar-a.png" },
  { id: "avatar-b", name: "세라", thumbnail: "/assets/3d/characters/thumbnails/refined-v2/avatar-b.png" },
  { id: "avatar-c", name: "유나", thumbnail: "/assets/3d/characters/thumbnails/refined-v2/avatar-c.png" },
  { id: "shion", name: "시온", thumbnail: "/assets/3d/characters/thumbnails/refined-v2/shion.png" },
  { id: "vivi", name: "비비", thumbnail: "/assets/3d/characters/thumbnails/refined-v1/vivi.png" },
  { id: "vita", name: "비타", thumbnail: "/assets/3d/characters/thumbnails/refined-v2/vita.png" },
  { id: "rubin", name: "루빈", thumbnail: "/assets/3d/characters/thumbnails/refined-v1/rubin.png" },
];

const REFERENCE_IMAGE_MAX_BYTES = 350_000;
const REFERENCE_IMAGE_MAX_EDGE = 512;

/** 업로드한 파일을 512px JPEG data URL로 줄인다. */
async function fileToCanonDataUrl(
  file: File,
): Promise<{ readonly ok: true; readonly dataUrl: string } | { readonly ok: false; readonly message: string }> {
  if (!file.type.startsWith("image/")) {
    return { ok: false, message: "이미지 파일만 올릴 수 있어요." };
  }
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    return { ok: false, message: "이미지를 읽지 못했습니다. 다른 파일로 올려 주세요." };
  }
  const scale = Math.min(1, REFERENCE_IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return { ok: false, message: "이미지를 처리할 수 없습니다." };
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  if (dataUrl.length > REFERENCE_IMAGE_MAX_BYTES * 1.4) {
    return { ok: false, message: "이미지가 너무 커요. 더 작은 파일로 올려 주세요." };
  }
  return { ok: true, dataUrl };
}

type ReferenceTab = "upload" | "avatar" | "shaper";

export function StudioCharacterCanonEditor({
  sheet,
  onSubmit,
  onCancel,
  busy,
}: {
  readonly sheet?: CharacterCanonSheet | null;
  /** 검증 오류 목록을 돌려준다 — 비어 있으면 저장이 끝난 것으로 보고 부모가 닫는다. */
  readonly onSubmit: (draft: CanonSheetDraft) => readonly string[];
  readonly onCancel: () => void;
  readonly busy?: boolean;
}) {
  const bt = useBilingual("canon.editor");
  const [name, setName] = useState(sheet?.name ?? "");
  const [appearance, setAppearance] = useState(sheet?.appearance ?? "");
  const [outfit, setOutfit] = useState(sheet?.outfit ?? "");
  const [tagsText, setTagsText] = useState(sheet?.tags.join(", ") ?? "");
  const [referenceImage, setReferenceImage] = useState<string | null>(sheet?.referenceImage ?? null);
  const [referenceSource, setReferenceSource] = useState<CanonReferenceSource | null>(sheet?.referenceSource ?? null);
  const [referenceLabel, setReferenceLabel] = useState<string | null>(sheet?.referenceLabel ?? null);
  const [tab, setTab] = useState<ReferenceTab>("upload");
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const referenceImageSrc = safeReferenceImageSrc(referenceImage);
  const renderableReferenceImageSrc =
    referenceImageSrc !== null && isSafeReferenceImageUrl(referenceImageSrc) ? referenceImageSrc : null;

  const pickReference = (image: string | null, source: CanonReferenceSource | null, label: string | null) => {
    setReferenceImage(image);
    setReferenceSource(source);
    setReferenceLabel(label);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || uploading) return;
    setUploading(true);
    setUploadMessage(null);
    const result = await fileToCanonDataUrl(file);
    setUploading(false);
    if (!result.ok) {
      setUploadMessage(result.message);
      return;
    }
    pickReference(result.dataUrl, "upload", bt("업로드 이미지", "Uploaded image"));
  };

  const submit = () => {
    const draft: CanonSheetDraft = {
      name,
      appearance,
      outfit,
      tags: tagsText.split(/[,，\n]/u).map((tag) => tag.trim()).filter(Boolean),
      referenceImage,
      referenceSource,
      referenceLabel,
    };
    const validation = onSubmit(draft);
    setErrors(validation);
  };

  const tabs: readonly { readonly id: ReferenceTab; readonly label: string; readonly icon: typeof ImagePlus }[] = [
    { id: "upload", label: bt("업로드", "Upload"), icon: ImagePlus },
    { id: "avatar", label: bt("기본 아바타", "Sample avatars"), icon: UserRound },
    { id: "shaper", label: bt("3D 셰이퍼", "3D Shaper"), icon: Shapes },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-fg-2">
          {bt("캐릭터 이름", "Character name")}
          <input
            value={name}
            onChange={(event) => setName(event.target.value.slice(0, CANON_NAME_MAX))}
            placeholder={bt("예: 유진", "e.g. Yujin")}
            disabled={busy}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg outline-none focus:border-accent disabled:opacity-60"
          />
        </label>
        <label className="block text-xs font-semibold text-fg-2">
          {bt("특징 태그 (쉼표로 구분)", "Trait tags (comma separated)")}
          <input
            value={tagsText}
            onChange={(event) => setTagsText(event.target.value.slice(0, 400))}
            placeholder={bt("예: 안경, 왼쪽 눈 밑 점, 차분함", "e.g. glasses, mole under left eye, calm")}
            disabled={busy}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg outline-none focus:border-accent disabled:opacity-60"
          />
        </label>
      </div>

      <label className="block text-xs font-semibold text-fg-2">
        {bt("외모 설명", "Appearance")}
        <textarea
          value={appearance}
          onChange={(event) => setAppearance(event.target.value.slice(0, CANON_APPEARANCE_MAX))}
          placeholder={bt("얼굴 생김새, 머리 스타일·색, 눈, 체형 — AI가 매 컷마다 똑같이 그리도록 자세히 적어 주세요.", "Face, hairstyle and color, eyes, build — describe in detail so the AI draws the same character every panel.")}
          rows={3}
          disabled={busy}
          className="mt-1 w-full resize-y rounded-lg border border-line bg-card px-3 py-2 text-sm leading-relaxed text-fg outline-none focus:border-accent disabled:opacity-60"
        />
      </label>

      <label className="block text-xs font-semibold text-fg-2">
        {bt("의상", "Outfit")}
        <textarea
          value={outfit}
          onChange={(event) => setOutfit(event.target.value.slice(0, CANON_OUTFIT_MAX))}
          placeholder={bt("예: 남색 교복 재킷, 붉은 넥타이, 검은 로퍼", "e.g. navy school blazer, red necktie, black loafers")}
          rows={2}
          disabled={busy}
          className="mt-1 w-full resize-y rounded-lg border border-line bg-card px-3 py-2 text-sm leading-relaxed text-fg outline-none focus:border-accent disabled:opacity-60"
        />
      </label>

      <fieldset>
        <legend className="text-xs font-semibold text-fg-2">{bt("레퍼런스 이미지", "Reference image")}</legend>
        <div className="mt-1 flex gap-1" role="tablist" aria-label={bt("레퍼런스 출처", "Reference source")}>
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              disabled={busy}
              className={cn(
                "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-semibold",
                tab === id ? "border-accent/50 bg-accent-soft text-fg" : "border-line bg-card text-fg-3 hover:text-fg",
              )}
            >
              <Icon size={14} aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {tab === "upload" ? (
          <div className="mt-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label={bt("레퍼런스 이미지 파일 선택", "Choose reference image file")}
              onChange={(event) => {
                void handleFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy || uploading}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold hover:bg-raised disabled:opacity-60"
            >
              <ImagePlus size={14} aria-hidden />
              {uploading ? bt("처리 중…", "Processing…") : bt("이미지 파일 올리기", "Upload image file")}
            </button>
            {uploadMessage ? <p role="alert" className="mt-1 text-xs text-bad">{uploadMessage}</p> : null}
          </div>
        ) : null}

        {tab === "avatar" ? (
          <ul className="mt-2 grid grid-cols-4 gap-2" aria-label={bt("기본 아바타 목록", "Sample avatar list")}>
            {BUNDLED_AVATARS.map((avatar) => {
              const selected = referenceImage === avatar.thumbnail;
              return (
                <li key={avatar.id}>
                  <button
                    type="button"
                    onClick={() => pickReference(avatar.thumbnail, "avatar", bt("기본 아바타", "Sample avatar") + ` · ${avatar.name}`)}
                    aria-pressed={selected}
                    disabled={busy}
                    className={cn(
                      "group w-full overflow-hidden rounded-lg border bg-card",
                      selected ? "border-accent ring-2 ring-accent/40" : "border-line hover:border-accent/40",
                    )}
                  >
                    <span className="block aspect-square bg-raised">
                      <img src={avatar.thumbnail} alt={avatar.name} loading="lazy" className="size-full object-cover" />
                    </span>
                    <span className="block truncate px-1 py-1 text-center text-[0.62rem] text-fg-3 group-hover:text-fg">{avatar.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {tab === "shaper" ? (
          <div className="mt-2 rounded-lg border border-line bg-card p-3 text-xs leading-relaxed text-fg-2">
            <p>
              {bt(
                "3D 캐릭터 셰이퍼(character-lab/SHAPER)에서 만든 캐릭터의 스냅샷을 레퍼런스로 쓸 수 있어요. 셰이퍼에서 스냅샷을 저장한 뒤 아래에 붙여넣거나 파일로 올리세요.",
                "Use a snapshot from the 3D character Shaper (character-lab/SHAPER) as reference. Save a snapshot in the Shaper, then paste it below or upload the file.",
              )}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                href="/studio/assets/characters/new"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs font-semibold hover:bg-raised"
              >
                <Shapes size={14} aria-hidden />
                {bt("3D 셰이퍼 열기", "Open 3D Shaper")}
              </a>
            </div>
            <label className="mt-2 block text-[0.68rem] font-semibold text-fg-3">
              {bt("스냅샷 URL 붙여넣기", "Paste snapshot URL")}
              <span className="mt-1 flex gap-1">
                <input
                  id="canon-shaper-url"
                  type="url"
                  inputMode="url"
                  placeholder="https://…"
                  disabled={busy}
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-panel px-2 text-xs text-fg outline-none focus:border-accent disabled:opacity-60"
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    const input = event.currentTarget;
                    if (input.value.trim()) {
                      pickReference(input.value.trim(), "shaper", bt("3D 셰이퍼 스냅샷", "3D Shaper snapshot"));
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const input = document.getElementById("canon-shaper-url") as HTMLInputElement | null;
                    if (input?.value.trim()) {
                      pickReference(input.value.trim(), "shaper", bt("3D 셰이퍼 스냅샷", "3D Shaper snapshot"));
                    }
                  }}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-panel px-3 text-xs font-semibold hover:bg-raised disabled:opacity-60"
                >
                  <Link2 size={13} aria-hidden />
                  {bt("적용", "Apply")}
                </button>
              </span>
            </label>
          </div>
        ) : null}

        {renderableReferenceImageSrc ? (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-card p-2">
            <img src={renderableReferenceImageSrc} alt={bt("선택된 레퍼런스", "Selected reference")} className="h-12 w-12 shrink-0 rounded object-cover" />
            <p className="min-w-0 flex-1 truncate text-xs text-fg-2">{referenceLabel ?? bt("레퍼런스 이미지", "Reference image")}</p>
            <button
              type="button"
              onClick={() => pickReference(null, null, null)}
              disabled={busy}
              aria-label={bt("레퍼런스 이미지 제거", "Remove reference image")}
              className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-fg-3 hover:bg-raised hover:text-bad disabled:opacity-60"
            >
              <Trash2 size={14} aria-hidden />
            </button>
          </div>
        ) : null}
      </fieldset>

      {errors.length > 0 ? (
        <ul role="alert" className="space-y-1 rounded-lg border border-bad/30 bg-bad/10 p-2 text-xs text-bad">
          {errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="min-h-11 flex-1 rounded-lg bg-accent px-4 text-sm font-bold text-on-accent hover:bg-accent/90 disabled:opacity-60"
        >
          {sheet ? bt("캐논 저장", "Save canon") : bt("캐논 등록", "Register canon")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-11 rounded-lg border border-line bg-card px-4 text-sm font-semibold hover:bg-raised disabled:opacity-60"
        >
          {bt("취소", "Cancel")}
        </button>
      </div>
    </div>
  );
}
