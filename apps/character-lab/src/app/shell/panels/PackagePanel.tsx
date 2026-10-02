/**
 * PackagePanel: 제작(authored) 패키지 레인 UI.
 * index.json → 목록 → 선택 → manifest·slot-mapping·GLB fetch + SHA-256 검증 → AuthoredPackagePlan
 * → packagePlans.register → (엔진이 있으면) engineSession.reloadSource → `source/set` dispatch.
 * 15슬롯 능력표(선언/규칙 출처·불일치)·격차·경고·헤어 LOD·본/shape key 커버리지·VRM 메타(베타 파서)를 보여 준다.
 * 실패는 LabFailure 사유 그대로 표시하고 다른 패키지·절차 소스로 바꿔치기하지 않는다(ADR-0018).
 * 네트워크는 loader prop(기본: *.browser 모듈 동적 import)으로 분리해 jsdom 테스트는 fs 기반 가짜 로더를 쓴다.
 * 스타일 클래스 접두는 `cl-package-`(core CSS).
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ALL_AVAILABLE_CAPABILITIES, CHARACTER_SLOT_KINDS, SLOT_LABELS_KO, failVisible, isLabFailure } from "../../../contracts";
import { compareCapabilities } from "../../../domains/authored/package-capability";
import { parseVrmFromGlb } from "../../../domains/authored/vrm-extension-parser";
import { useDispatch, useLabContext, useLabState } from "../lab-store-context";

import type { LabFailure, SlotCapabilityStatus, SlotKind } from "../../../contracts";
import type { AuthoredIndexEntry } from "../../../domains/authored/package-index";
import type { AuthoredPackageLoadResult, PackageIndexLoadResult } from "../../../domains/authored/package-load-flow";
import type { VrmcVrmInfo } from "../../../domains/authored/vrm-extension-parser";

export interface PackagePanelLoader {
  loadIndex(): Promise<PackageIndexLoadResult>;
  loadPackage(entry: AuthoredIndexEntry, options: { readonly preferredLod?: number }): Promise<AuthoredPackageLoadResult>;
}

/** 브라우저 기본 로더: 두 *.browser 모듈을 지연 import한다(별도 청크). */
export const browserPackageLoader: PackagePanelLoader = {
  loadIndex: () => import("../../../domains/authored/package-index.browser").then((module) => module.loadCharacterPackageIndex()),
  loadPackage: (entry, options) => import("../../../domains/authored/package-loader.browser").then((module) => module.loadAuthoredPackage(entry, options)),
};

export interface PackagePanelProps {
  readonly loader?: PackagePanelLoader;
  /** 마운트 시 index.json 자동 로드(기본 true) */
  readonly autoLoadIndex?: boolean;
  /** 헤어 LOD 선호(기본 0 = 가장 상세) */
  readonly preferredLod?: number;
  readonly now?: () => number;
}

type IndexState =
  | { readonly phase: "idle" }
  | { readonly phase: "loading" }
  | { readonly phase: "ready"; readonly entries: readonly AuthoredIndexEntry[] }
  | { readonly phase: "failed"; readonly failure: LabFailure };

type LoadedPackage = Extract<AuthoredPackageLoadResult, { ok: true }>;

type PackageState =
  | { readonly phase: "loading"; readonly step: string }
  | { readonly phase: "ready"; readonly result: LoadedPackage; readonly vrm: VrmcVrmInfo | null; readonly vrmNoteKo: string; readonly applied: "engine" | "registry" }
  | { readonly phase: "failed"; readonly failure: LabFailure };

const STATUS_LABELS_KO: Readonly<Record<SlotCapabilityStatus, string>> = { available: "지원", partial: "부분 지원", unavailable: "미지원" };

function shortSha(sha: string | null | undefined): string {
  return sha ? `${sha.slice(0, 12)}…` : "-";
}

function describeFailure(failure: LabFailure): string {
  return failure.detail ? `${failure.reasonKo} (${failure.code})` : `${failure.reasonKo} (${failure.code})`;
}

interface CapabilityTableProps {
  readonly result: LoadedPackage;
}

function CapabilityTable({ result }: CapabilityTableProps) {
  const { judgement } = result.detail;
  const comparison = compareCapabilities(judgement.ruleOnly, result.plan.capabilities);
  const divergent = new Map<SlotKind, SlotCapabilityStatus>(comparison.divergent.map((entry) => [entry.slot, entry.rule]));
  return (
    <table className="cl-package-capabilities">
      <caption>
        15슬롯 능력(선언 = Blender 레인 slot-mapping.json, 규칙 = manifest 판정) · 불일치 {comparison.divergent.length}개
      </caption>
      <thead>
        <tr>
          <th scope="col">슬롯</th>
          <th scope="col">상태</th>
          <th scope="col">출처</th>
          <th scope="col">사유</th>
        </tr>
      </thead>
      <tbody>
        {CHARACTER_SLOT_KINDS.map((slot) => {
          const capability = result.plan.capabilities[slot];
          const ruleStatus = divergent.get(slot);
          return (
            <tr key={slot} data-slot={slot} data-status={capability.status}>
              <th scope="row">{SLOT_LABELS_KO[slot]}</th>
              <td>
                <span className={`cl-package-badge cl-package-badge--${capability.status}`}>{STATUS_LABELS_KO[capability.status]}</span>
              </td>
              <td>
                {judgement.basis[slot] === "declared" ? "선언" : "규칙"}
                {ruleStatus ? ` (규칙 판정: ${STATUS_LABELS_KO[ruleStatus]})` : ""}
              </td>
              <td className="cl-package-reason">{capability.reasonKo ?? ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface PackageDetailProps {
  readonly state: Extract<PackageState, { phase: "ready" }>;
}

function PackageDetail({ state }: PackageDetailProps) {
  const { result, vrm, vrmNoteKo, applied } = state;
  const { plan, detail } = result;
  const { bones, shapeKeys, meshes } = detail.judgement.mappings;
  const quality = plan.manifest.quality;
  return (
    <div className="cl-package-detail">
      <p className="cl-package-status" role="status">
        {applied === "engine" ? "엔진에 올렸습니다" : "플랜을 등록했습니다(엔진이 준비되면 적용 루프가 올립니다)"} · GLB SHA-256 {shortSha(detail.observedSha256)} 검증 일치 · {plan.glbBytes.toLocaleString("ko-KR")} B
      </p>
      <dl className="cl-package-facts">
        <dt>품질</dt>
        <dd>
          {quality.score} / 최소 {quality.minimumScore} · {quality.passed ? "통과" : "미통과"}
        </dd>
        <dt>라이선스</dt>
        <dd>{plan.licenseNote}</dd>
        <dt>헤어</dt>
        <dd>
          {detail.hairLod.style ?? "없음"} · LOD {detail.hairLod.lods.join("/") || "-"} · 표시 LOD {detail.hairLod.chosen ?? "-"} · 숨김 {detail.hairLod.hidden.length}개 · 삼각형 {plan.manifest.capabilities.authoredHair.lodTriangles.join("/") || "-"}
        </dd>
        <dt>본 매핑</dt>
        <dd>
          필수 {bones.required.covered.length}/15 · 손가락 {bones.fingers.covered.length}/30 · 전체 {bones.all.covered.length}/55 · 미매핑 {bones.unmapped.length}개
        </dd>
        <dt>shape key</dt>
        <dd>
          매핑 {Object.keys(shapeKeys.mapped).length}개 · 규약 밖 {shapeKeys.unmapped.length}개 · FACS 유닛 {detail.judgement.facsUnits.length}개
        </dd>
        <dt>메시 역할</dt>
        <dd>
          분류 {Object.keys(meshes.roles).length}개 · 미분류 {meshes.unknown.length}개 · 외곽선 셸 {meshes.outlines.length}개
        </dd>
        <dt>VRM 확장(베타 파서)</dt>
        <dd>{vrm ? `${vrm.family} · ${vrm.meta.name ?? "이름 없음"} · 저자 ${vrm.meta.authors.join(", ") || "-"} · 라이선스 ${vrm.meta.licenseName ?? "-"} · humanoid ${Object.keys(vrm.humanoid).length}본 · 표정 ${vrm.expressions.length}개` : vrmNoteKo}</dd>
      </dl>
      {detail.warnings.length > 0 ? (
        <ul className="cl-package-warnings" aria-label="경고">
          {detail.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <CapabilityTable result={result} />
      {detail.gaps.length > 0 ? (
        <details className="cl-package-gaps">
          <summary>패키지 격차 {detail.gaps.length}개</summary>
          <ul>
            {detail.gaps.map((gap) => (
              <li key={gap.id}>
                [{gap.severity}] {gap.id}: {gap.summary}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {shapeKeys.unmapped.length > 0 || bones.unmapped.length > 0 || meshes.unknown.length > 0 ? (
        <details className="cl-package-unmapped">
          <summary>규약 밖 이름(사유)</summary>
          <ul>
            {shapeKeys.unmapped.map((entry) => (
              <li key={`sk:${entry.name}`}>shape key {entry.reasonKo}</li>
            ))}
            {bones.unmapped.map((entry) => (
              <li key={`bone:${entry.name}`}>본 {entry.reasonKo}</li>
            ))}
            {meshes.unknown.map((entry) => (
              <li key={`mesh:${entry.name}`}>메시 {entry.reasonKo}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export function PackagePanel({ loader = browserPackageLoader, autoLoadIndex = true, preferredLod = 0, now = () => Date.now() }: PackagePanelProps) {
  const state = useLabState();
  const dispatch = useDispatch();
  const { store, packagePlans, engineSession } = useLabContext();
  const ids = useId();
  const [index, setIndex] = useState<IndexState>({ phase: "idle" });
  const [packages, setPackages] = useState<Readonly<Record<string, PackageState>>>({});
  const mounted = useRef(true);
  const indexRequested = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reportFailure = useCallback(
    (failure: LabFailure): void => {
      store.applyEvent({ type: "failure", failure });
    },
    [store],
  );

  const loadIndex = useCallback(async (): Promise<void> => {
    setIndex({ phase: "loading" });
    let result: PackageIndexLoadResult;
    try {
      result = await loader.loadIndex();
    } catch (error) {
      result = { ok: false, failure: isLabFailure(error) ? error : failVisible("package-index-fetch-failed", "index.json을 불러오지 못했습니다.", error, now()) };
    }
    if (!mounted.current) return;
    if (result.ok) setIndex({ phase: "ready", entries: result.entries });
    else {
      setIndex({ phase: "failed", failure: result.failure });
      reportFailure(result.failure);
    }
  }, [loader, now, reportFailure]);

  useEffect(() => {
    if (!autoLoadIndex || indexRequested.current) return;
    indexRequested.current = true;
    void loadIndex();
  }, [autoLoadIndex, loadIndex]);

  const setPackage = useCallback((characterId: string, next: PackageState): void => {
    if (!mounted.current) return;
    setPackages((previous) => ({ ...previous, [characterId]: next }));
  }, []);

  const loadPackage = useCallback(
    async (entry: AuthoredIndexEntry): Promise<void> => {
      const id = entry.characterId;
      setPackage(id, { phase: "loading", step: "manifest·slot-mapping·GLB 받는 중" });
      let result: AuthoredPackageLoadResult;
      try {
        result = await loader.loadPackage(entry, { preferredLod });
      } catch (error) {
        result = { ok: false, failure: isLabFailure(error) ? error : failVisible("package-load-failed", `제작 패키지 '${id}' 로드에 실패했습니다.`, error, now()) };
      }
      if (!result.ok) {
        setPackage(id, { phase: "failed", failure: result.failure });
        reportFailure(result.failure);
        return;
      }
      const parsedVrm = parseVrmFromGlb(result.detail.glbBytes);
      const vrm = parsedVrm.ok ? parsedVrm.info : null;
      const vrmNoteKo = parsedVrm.ok ? (parsedVrm.info ? "" : "GLB에 VRM 확장 없음(humanoid·표정 bind는 manifest.json이 담당)") : `GLB JSON 청크를 읽지 못함: ${parsedVrm.reasonKo}`;

      setPackage(id, { phase: "loading", step: "플랜 등록·엔진 적용" });
      packagePlans.register(result.plan);
      let capabilities = result.plan.capabilities;
      let applied: "engine" | "registry" = "registry";
      if (engineSession.engine()) {
        try {
          const reloaded = await engineSession.reloadSource({ kind: "package", plan: result.plan });
          if (reloaded) {
            capabilities = reloaded.capabilities;
            applied = "engine";
          }
        } catch (error) {
          const failure = isLabFailure(error) ? error : failVisible("package-engine-load-failed", `엔진이 제작 패키지 '${id}' GLB를 올리지 못했습니다.`, error, now());
          setPackage(id, { phase: "failed", failure });
          reportFailure(failure);
          return;
        }
      }
      dispatch({ type: "source/set", source: { kind: "package", characterId: result.plan.manifest.characterId, sha256: result.plan.glbSha256 }, capabilities });
      setPackage(id, { phase: "ready", result, vrm, vrmNoteKo, applied });
    },
    [dispatch, engineSession, loader, now, packagePlans, preferredLod, reportFailure, setPackage],
  );

  const backToProcedural = useCallback((): void => {
    dispatch({ type: "source/set", source: { kind: "procedural" }, capabilities: ALL_AVAILABLE_CAPABILITIES });
  }, [dispatch]);

  const source = state.recipe.source;

  return (
    <section className="cl-package-panel" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`}>제작 패키지</h2>
      <p className="cl-package-source" role="status">
        현재 소스: {source.kind === "package" ? `제작 패키지 ${source.characterId} (SHA ${shortSha(source.sha256)})` : "절차적 휴머노이드"}
        {source.kind === "package" ? (
          <button type="button" className="cl-package-back" onClick={backToProcedural}>
            절차 소스로 돌아가기
          </button>
        ) : null}
      </p>
      <div className="cl-package-toolbar">
        <button type="button" onClick={() => void loadIndex()} disabled={index.phase === "loading"}>
          {index.phase === "loading" ? "목록 불러오는 중…" : "목록 새로고침"}
        </button>
        <span className="cl-package-hint">public/assets/characters/index.json</span>
      </div>
      {index.phase === "failed" ? (
        <p className="cl-package-failure" role="alert">
          {describeFailure(index.failure)}
        </p>
      ) : null}
      {index.phase === "idle" ? <p className="cl-package-hint">목록을 아직 불러오지 않았습니다.</p> : null}
      {index.phase === "ready" ? (
        <ul className="cl-package-list" aria-label="제작 패키지 목록">
          {index.entries.map((entry) => {
            const packageState = packages[entry.characterId];
            return (
              <li key={entry.characterId} className="cl-package-item" data-character-id={entry.characterId}>
                <div className="cl-package-item-head">
                  <strong>{entry.displayName}</strong>
                  {entry.primary ? <span className="cl-package-badge cl-package-badge--primary">주 캐릭터</span> : null}
                  {entry.role ? <span className="cl-package-role">{entry.role}</span> : null}
                  <span className="cl-package-id">{entry.characterId}</span>
                </div>
                <p className="cl-package-summary">
                  품질 {entry.summary.qualityScore ?? "-"} · 스켈레톤 {entry.summary.skeleton === null ? "-" : entry.summary.skeleton ? "있음" : "없음"} · 의미 기반 shape key {entry.summary.semanticShapeKeys ?? "-"}개 · 헤어 LOD 삼각형 {entry.summary.hairLodTriangles.join("/") || "-"} · GLB 삼각형 {entry.summary.glbTriangles ?? "-"} · 라이선스 {entry.licenseNote ?? "미기재"} · GLB SHA {shortSha(entry.glbSha256)}
                </p>
                <button type="button" onClick={() => void loadPackage(entry)} disabled={packageState?.phase === "loading"} aria-label={`${entry.displayName} 불러오기`}>
                  {packageState?.phase === "loading" ? `불러오는 중… (${packageState.step})` : packageState?.phase === "ready" ? "다시 불러오기" : "불러오기"}
                </button>
                {packageState?.phase === "failed" ? (
                  <p className="cl-package-failure" role="alert">
                    {describeFailure(packageState.failure)}
                  </p>
                ) : null}
                {packageState?.phase === "ready" ? <PackageDetail state={packageState} /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
