import {
  StudioScene3dCommandTimeline,
  hashStudioScene3dCommandState,
} from "./studio-scene3d-command-core";
import {
  approveStudioScene3dVersionedCut,
  compareStudioScene3dCutSource,
  createStudioScene3dVersionedCut,
  editStudioScene3dCutPerformance,
  parseStudioScene3dCutSource,
  reviewStudioScene3dCutCorrection,
  updateStudioScene3dCutSource,
  validateStudioScene3dShotVersionCollection,
  type StudioScene3dCutSource,
  type StudioScene3dVersionedCut,
} from "./studio-scene3d-shot-versions";
import {
  createStudioWebAuthoringProjectV3,
  parseStudioWebAuthoringProjectV3,
  serializeStudioWebAuthoringProjectV3,
  validateStudioWebAuthoringProjectV3,
  type StudioWebAuthoringProjectV3,
} from "../studio-web-runtime/studio-web-authoring-project-v3";
import type { StudioWebAuthoringProjectV3Repository } from "../studio-web-runtime/studio-web-authoring-project-v3-repository";

export interface StudioScene3dCutHost {
  readonly projectId: string;
  readSource(previous?: StudioScene3dCutSource): StudioScene3dCutSource;
  blockedReason(): string | null;
  readRevision?(): unknown;
  readPinnedCut?(): StudioScene3dVersionedCut | null;
  applySource(
    source: StudioScene3dCutSource,
    cut: StudioScene3dVersionedCut | null,
    signal: AbortSignal
  ): void | "applied" | "deferred" | Promise<void | "applied" | "deferred">;
}
export interface StudioScene3dCutSessionSnapshot {
  readonly phase: "loading" | "ready" | "saving" | "applying" | "error";
  readonly project: StudioWebAuthoringProjectV3 | null;
  readonly selectedId: string | null;
  readonly notice: string;
  readonly dirty: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

/** 패널 수명과 비동기 저장 수명을 분리하고, 복원 전 쓰기를 허용하지 않는다. */
export class StudioScene3dCutSession {
  #snapshot: StudioScene3dCutSessionSnapshot = {
    phase: "loading",
    project: null,
    selectedId: null,
    notice: "컷 프로젝트를 복원하고 있습니다.",
    dirty: false,
    canUndo: false,
    canRedo: false,
  };
  #listeners = new Set<() => void>();
  #timeline: StudioScene3dCommandTimeline<StudioWebAuthoringProjectV3> | null =
    null;
  #storedRevision: number | null = null;
  #revision = 0;
  #operation: AbortController | null = null;
  #epoch = 0;
  #hydrated = false;
  #requiresReload = false;
  constructor(
    readonly host: StudioScene3dCutHost,
    readonly repository: StudioWebAuthoringProjectV3Repository
  ) {}
  read = () => this.#snapshot;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  #publish(patch: Partial<StudioScene3dCutSessionSnapshot>) {
    this.#snapshot = Object.freeze({ ...this.#snapshot, ...patch });
    for (const listener of this.#listeners) listener();
  }
  #assertReady() {
    if (
      !this.#hydrated ||
      !this.#snapshot.project ||
      !["ready", "error"].includes(this.#snapshot.phase)
    )
      throw new Error("복원 또는 진행 중 작업을 마친 뒤 다시 시도하세요.");
    if (this.#requiresReload)
      throw new Error(
        "저장 상태를 확인하려면 로컬 다시 불러오기를 먼저 실행하세요."
      );
    const reason = this.host.blockedReason();
    if (reason) throw new Error(reason);
    return this.#snapshot.project;
  }
  #begin(phase: StudioScene3dCutSessionSnapshot["phase"]) {
    this.#operation?.abort();
    const controller = new AbortController();
    this.#operation = controller;
    const epoch = ++this.#epoch;
    this.#publish({ phase, notice: "작업 중입니다." });
    return {
      signal: controller.signal,
      current: () => !controller.signal.aborted && this.#epoch === epoch,
    };
  }
  #fail(error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      ["cancelled-after-write", "revision-conflict"].includes(
        String(error.code)
      )
    )
      this.#requiresReload = true;
    this.#publish({
      phase: "error",
      notice:
        error instanceof Error
          ? error.message
          : "컷 작업을 완료하지 못했습니다.",
    });
  }
  async restore() {
    const hostRevision = this.host.readRevision?.();
    const task = this.#begin("loading");
    try {
      const saved = await this.repository.load(this.host.projectId, {
        signal: task.signal,
      });
      if (!task.current()) return;
      if (saved && this.host.readRevision?.() !== hostRevision)
        throw new Error(
          "불러오는 동안 장면이 변경되어 저장된 원본을 적용하지 않았습니다. 다시 불러오기를 선택하세요."
        );
      const pinned = this.host.readPinnedCut?.();
      const source = pinned
        ? pinned.source
        : saved
        ? parseStudioScene3dCutSource(saved)
        : this.host.readSource();
      let project =
        saved ??
        createStudioWebAuthoringProjectV3({
          projectId: this.host.projectId,
          title: "3D 컷 프로젝트",
          ...source,
        });
      let selectedId = project.shotVersions?.cuts[0]?.id ?? null;
      let pinnedConflict = false;
      if (pinned) {
        const cuts = project.shotVersions?.cuts ?? [];
        const sameId = cuts.find((cut) => cut.id === pinned.id);
        pinnedConflict = Boolean(
          sameId &&
            hashStudioScene3dCommandState(sameId) !==
              hashStudioScene3dCommandState(pinned)
        );
        const retained = pinnedConflict
          ? {
              ...pinned,
              id: `cut:linked:${hashStudioScene3dCommandState(pinned).slice(
                7,
                39
              )}`,
              name: `${pinned.name.slice(0, 140)} (원고 고정 버전)`,
            }
          : pinned;
        const existing = cuts.find((cut) => cut.id === retained.id);
        if (
          existing &&
          hashStudioScene3dCommandState(existing) !==
            hashStudioScene3dCommandState(retained)
        )
          throw new Error("원고 고정 컷 식별자가 다른 저장 버전과 충돌합니다.");
        project = validateStudioWebAuthoringProjectV3({
          ...project,
          ...source,
          shotVersions: {
            version: 1,
            cuts: existing ? cuts : [...cuts, retained],
          },
        });
        selectedId = retained.id;
      }
      const applied =
        saved || pinned
          ? await this.host.applySource(source, pinned ?? null, task.signal)
          : undefined;
      if (!task.current()) return;
      this.#timeline = new StudioScene3dCommandTimeline(project, {
        clone: validateStudioWebAuthoringProjectV3,
      });
      this.#storedRevision = saved?.revision ?? null;
      this.#revision = project.revision;
      this.#hydrated = true;
      this.#requiresReload = false;
      const dirty = Boolean(
        pinned &&
          (!saved ||
            serializeStudioWebAuthoringProjectV3(project) !==
              serializeStudioWebAuthoringProjectV3(saved))
      );
      const notice = pinnedConflict
        ? "원고에 고정된 승인 버전으로 복원했습니다. 저장된 다른 버전도 별도 컷으로 보존했습니다."
        : pinned
        ? "원고에 고정된 컷 원본과 승인 상태를 복원했습니다."
        : saved
        ? "저장한 컷과 원본을 복원했습니다."
        : "새 컷 프로젝트가 준비되었습니다.";
      this.#publish({
        project,
        phase: "ready",
        selectedId,
        dirty,
        canUndo: false,
        canRedo: false,
        notice:
          applied === "deferred"
            ? `${notice} 카메라는 뷰포트 준비 후 적용됩니다.`
            : notice,
      });
    } catch (error) {
      if (task.current()) this.#fail(error);
    }
  }
  cancel() {
    if (this.#snapshot.phase === "saving") this.#requiresReload = true;
    this.#operation?.abort();
    this.#epoch++;
    this.#publish({
      phase: this.#hydrated ? "ready" : "error",
      notice:
        "작업을 취소했습니다. 저장 중이었다면 재복원으로 저장 상태를 확인하세요.",
    });
  }
  dispose() {
    if (this.#snapshot.phase === "saving") this.#requiresReload = true;
    this.#operation?.abort();
    this.#epoch++;
    if (["saving", "applying"].includes(this.#snapshot.phase))
      this.#publish({
        phase: "error",
        notice:
          "이전 작업이 중단되었습니다. 로컬 다시 불러오기로 저장 상태를 확인하세요.",
      });
    this.#listeners.clear();
  }
  run(action: () => void) {
    try {
      action();
    } catch (error) {
      this.#fail(error);
    }
  }
  #commit(project: StudioWebAuthoringProjectV3, label: string) {
    const next = validateStudioWebAuthoringProjectV3({
      ...project,
      revision: ++this.#revision,
      updatedAt: new Date().toISOString(),
    });
    if (!this.#timeline) throw new Error("컷 history가 준비되지 않았습니다.");
    this.#timeline.commit({
      id: "scene3d.cut.edit",
      label,
      source: "inspector",
      apply: () => next,
    });
    this.#publish({
      project: next,
      phase: "ready",
      dirty: true,
      canUndo: this.#timeline.canUndo,
      canRedo: this.#timeline.canRedo,
      notice: label,
    });
  }
  #cuts(project: StudioWebAuthoringProjectV3) {
    return project.shotVersions?.cuts ?? [];
  }
  #cut(project: StudioWebAuthoringProjectV3, id: string) {
    const cut = this.#cuts(project).find((item) => item.id === id);
    if (!cut) throw new Error("선택한 컷이 없습니다.");
    return cut;
  }
  #replace(
    project: StudioWebAuthoringProjectV3,
    cut: StudioScene3dVersionedCut,
    label: string
  ) {
    this.#commit(
      {
        ...project,
        shotVersions: {
          version: 1,
          cuts: this.#cuts(project).map((item) =>
            item.id === cut.id ? cut : item
          ),
        },
      },
      label
    );
  }
  select(id: string) {
    this.#cut(this.#assertReady(), id);
    this.#publish({ selectedId: id });
  }
  capture(name: string) {
    const project = this.#assertReady();
    const source = this.host.readSource(project);
    const cut = createStudioScene3dVersionedCut({
      ...source,
      id: `cut:${crypto.randomUUID()}`,
      name: name.trim() || `컷 ${this.#cuts(project).length + 1}`,
    });
    this.#commit(
      {
        ...project,
        ...source,
        shotVersions: { version: 1, cuts: [...this.#cuts(project), cut] },
      },
      "현재 장면·카메라·포즈를 새 컷에 고정했습니다."
    );
    this.#publish({ selectedId: cut.id });
  }
  duplicate(id: string) {
    const project = this.#assertReady();
    const cut = this.#cut(project, id);
    const copy = {
      ...cut,
      id: `cut:${crypto.randomUUID()}`,
      name: `${cut.name} 사본`.slice(0, 160),
    };
    this.#commit(
      {
        ...project,
        shotVersions: { version: 1, cuts: [...this.#cuts(project), copy] },
      },
      "컷을 복제했습니다."
    );
    this.#publish({ selectedId: copy.id });
  }
  rename(id: string, name: string) {
    const project = this.#assertReady();
    const cut = this.#cut(project, id);
    this.#replace(
      project,
      { ...cut, name: name.trim(), revision: cut.revision + 1 },
      "컷 이름을 변경했습니다."
    );
  }
  remove(id: string) {
    const project = this.#assertReady();
    this.#cut(project, id);
    const cuts = this.#cuts(project).filter((item) => item.id !== id);
    this.#commit(
      { ...project, shotVersions: { version: 1, cuts } },
      "컷을 삭제했습니다. 컷 실행 취소로 복구할 수 있습니다."
    );
    this.#publish({ selectedId: cuts[0]?.id ?? null });
  }
  compare(id: string) {
    const project = this.#assertReady();
    return compareStudioScene3dCutSource(
      this.#cut(project, id),
      this.host.readSource(project)
    );
  }
  update(
    id: string,
    selection: { scene: boolean; characterIds: readonly string[] }
  ) {
    const project = this.#assertReady();
    const source = this.host.readSource(project);
    this.#replace(
      { ...project, ...source },
      updateStudioScene3dCutSource(this.#cut(project, id), source, selection),
      "선택한 원본을 갱신했습니다. 보정과 출력을 재검토하세요."
    );
  }
  savePerformance(id: string) {
    const project = this.#assertReady();
    const cut = this.#cut(project, id);
    const source = this.host.readSource(project);
    const current = createStudioScene3dVersionedCut({
      ...source,
      id: cut.id,
      name: cut.name,
    });
    let next = editStudioScene3dCutPerformance(cut, {
      camera: current.camera,
      performances: current.performances,
    });
    // Legacy rig pose/morph는 원본 BG3D 노드가 소유하므로 같은 노드의 연기 필드만 옮긴다.
    if (cut.source.legacyBg3d && source.legacyBg3d) {
      const live = new Map(
        source.legacyBg3d.nodes.map((node) => [node.id, node])
      );
      const nodes = cut.source.legacyBg3d.nodes.map((node) => {
        const candidate = live.get(node.id);
        return node.kind === "model" &&
          candidate?.kind === "model" &&
          node.attachmentId === candidate.attachmentId
          ? {
              ...node,
              pose: candidate.pose,
              morph: candidate.morph,
              animation: candidate.animation,
              constraints: candidate.constraints,
            }
          : node;
      });
      next = updateStudioScene3dCutSource(
        next,
        { ...next.source, legacyBg3d: { ...cut.source.legacyBg3d, nodes } },
        { scene: true, characterIds: [] }
      );
    }
    this.#replace(
      { ...project, ...source },
      next,
      "현재 카메라·포즈를 저장했습니다. 승인을 다시 확인하세요."
    );
  }
  approve(id: string) {
    const project = this.#assertReady();
    this.#replace(
      project,
      approveStudioScene3dVersionedCut(this.#cut(project, id)),
      "선택한 컷 버전을 승인했습니다."
    );
  }
  reviewScreen(id: string, correctionId: string) {
    const project = this.#assertReady();
    const cut = this.#cut(project, id);
    const correction = cut.corrections.find((item) => item.id === correctionId);
    if (!correction || correction.kind !== "screen-space")
      throw new Error(
        "표면 부착은 재투영을 지원하지 않아 원본 도구에서 다시 부착해야 합니다."
      );
    this.#replace(
      project,
      reviewStudioScene3dCutCorrection(cut, {
        ...correction,
        status: "current",
      }),
      "화면 보정을 검토했습니다."
    );
  }
  async apply(id: string) {
    const project = this.#assertReady();
    const cut = this.#cut(project, id);
    const task = this.#begin("applying");
    try {
      const applied = await this.host.applySource(cut.source, cut, task.signal);
      if (task.current())
        this.#publish({
          phase: "ready",
          selectedId: id,
          notice:
            applied === "deferred"
              ? "컷 문서를 복원했습니다. 카메라는 뷰포트 준비 후 적용됩니다."
              : "고정한 컷으로 돌아왔습니다.",
        });
    } catch (error) {
      if (task.current()) this.#fail(error);
    }
  }
  step(direction: "undo" | "redo") {
    const current = this.#assertReady();
    const source = this.host.readSource(current);
    const result = this.#timeline?.[direction]();
    if (!result || result.status !== "applied") return;
    // 컷 목록 history와 실제 장면 history는 각각의 authority에서 실행 취소한다.
    const project = validateStudioWebAuthoringProjectV3({
      ...result.state,
      ...source,
      legacyBg3d: source.legacyBg3d,
      revision: ++this.#revision,
    });
    this.#publish({
      project,
      selectedId: project.shotVersions?.cuts[0]?.id ?? null,
      phase: "ready",
      dirty: true,
      canUndo: this.#timeline?.canUndo,
      canRedo: this.#timeline?.canRedo,
      notice:
        direction === "undo"
          ? "컷 변경을 취소했습니다."
          : "컷 변경을 다시 적용했습니다.",
    });
  }
  async save() {
    const project = this.#assertReady();
    const source = this.host.readSource(project);
    const sourceRevision = this.host.readRevision?.();
    const candidate = validateStudioWebAuthoringProjectV3({
      ...project,
      ...source,
      revision: ++this.#revision,
    });
    const task = this.#begin("saving");
    try {
      const receipt = await this.repository.save(candidate, {
        expectedStoredRevision: this.#storedRevision,
        signal: task.signal,
      });
      if (!task.current()) return;
      this.#storedRevision = receipt.revision;
      const changedWhileSaving = this.host.readRevision?.() !== sourceRevision;
      this.#publish({
        project: candidate,
        phase: "ready",
        dirty: changedWhileSaving,
        notice: changedWhileSaving
          ? "요청한 버전은 저장했습니다. 저장 중 바뀐 장면은 다시 저장하세요."
          : "로컬 컷 프로젝트를 저장했습니다.",
      });
    } catch (error) {
      if (task.current()) this.#fail(error);
    }
  }
  backup() {
    const project = this.#snapshot.project;
    if (
      !this.#hydrated ||
      !project ||
      !["ready", "error"].includes(this.#snapshot.phase)
    )
      throw new Error("복원 또는 진행 중 작업을 마친 뒤 백업하세요.");
    const reason = this.host.blockedReason();
    if (reason) throw new Error(reason);
    // 저장 충돌 뒤에도 현재 장면과 보존한 컷을 백업할 수 있다. 저장소 쓰기는 수행하지 않는다.
    const source = this.host.readSource(project);
    return serializeStudioWebAuthoringProjectV3({
      ...project,
      ...source,
      legacyBg3d: source.legacyBg3d,
    });
  }
  async importJson(raw: string) {
    const current = this.#assertReady();
    if (new TextEncoder().encode(raw).byteLength > 32 * 1024 * 1024)
      throw new Error("JSON 백업이 32 MiB 가져오기 한도를 초과했습니다.");
    const imported = parseStudioWebAuthoringProjectV3(raw);
    if (imported.projectId !== this.host.projectId)
      throw new Error("다른 프로젝트의 백업은 이 장면에 덮어쓸 수 없습니다.");
    validateStudioScene3dShotVersionCollection(
      imported.shotVersions ?? { version: 1, cuts: [] }
    );
    const task = this.#begin("applying");
    try {
      const applied = await this.host.applySource(
        parseStudioScene3dCutSource(imported),
        null,
        task.signal
      );
      if (!task.current()) return;
      this.#revision = Math.max(
        this.#revision,
        current.revision,
        imported.revision
      );
      this.#commit(
        imported,
        applied === "deferred"
          ? "JSON 문서를 가져왔습니다. 카메라는 뷰포트 준비 후 적용됩니다. 로컬 저장으로 확정하세요."
          : "JSON 백업을 가져왔습니다. 로컬 저장으로 확정하세요."
      );
      this.#publish({ selectedId: imported.shotVersions?.cuts[0]?.id ?? null });
    } catch (error) {
      if (task.current()) this.#fail(error);
    }
  }
}
