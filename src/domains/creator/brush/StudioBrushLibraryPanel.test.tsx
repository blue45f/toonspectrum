// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildAuthoredSutFixture } from "../../../../tests/corpus/formats/csp-sut-fixtures";
import { buildKritaBundleFixture } from "../../../../tests/corpus/formats/krita-bundle-fixtures";

import { studioBrushDynamicsPresetSettings } from "./studio-brush-dynamics";
import {
  BRUSH_LIBRARY_KEY,
  BRUSH_LIBRARY_STORAGE_VERSION,
  type BrushLibraryStorage,
  type StudioBrushSnapshot,
  type StudioSavedBrush,
} from "./studio-brush-library";
import {
  createStorageBrushLibraryRepository,
  type BrushLibraryPageRequest,
} from "./studio-brush-library-repository";
import { notifyStudioBrushLibraryChanged } from "./studio-brush-library-sqlite-repository";
import { STUDIO_BRUSH_PACK_ACCEPT } from "./studio-brush-pack-format";
import { StudioBrushLibraryPanel } from "./StudioBrushLibraryPanel";

const snapshot: StudioBrushSnapshot = {
  brushId: "pen",
  strokeWidth: 6,
  brushOpacity: 1,
  color: "#ff6600",
  stabilizer: 6,
  stabilizerMode: "adaptive",
  postCorrection: 4,
  preserveCorners: true,
  pressureCurve: 1,
      pressureMinSize: 0,
  useVelocityPressure: true,
  velocitySensitivity: 0.65,
  tiltEnabled: true,
  tipAngle: -30,
  tipRoundness: 0.24,
  brushDynamics: studioBrushDynamicsPresetSettings("ink-particle"),
  stampTuning: null,
  enginePrograms: null,
};

const saved: StudioSavedBrush = {
  id: "saved-1",
  name: "주력 펜",
  createdAt: 1,
  updatedAt: 2,
  pinned: true,
  lastUsedAt: 3,
  ...snapshot,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StudioBrushLibraryPanel", () => {
  it("controlled 목록과 고정·복제·이름·내보내기·공유·삭제 액션을 렌더한다", () => {
    const html = renderToStaticMarkup(
      <StudioBrushLibraryPanel
        currentSnapshot={snapshot}
        brushes={[saved]}
        activeBrushId={saved.id}
        onBrushesChange={() => undefined}
        onApplyBrush={() => undefined}
        onBrushDeleted={() => undefined}
      />
    );
    expect(html).toContain('data-studio-brush-library-scope="saved"');
    expect(html).toContain('data-studio-brush-surface-role="user-library-management"');
    expect(html).toContain('aria-label="내 브러시"');
    expect(html).toContain("내 브러시 · 사용자 설정");
    expect(html).toContain("로컬 SQL 브러시 카탈로그 연결 중…");
    expect(html).not.toContain("1개 · 무제한");
    expect(html).not.toContain("1/120");
    expect(html).not.toContain("Infinity");
    expect(html).toContain(
      'aria-label="브러시 설정 · Photoshop ABR · Clip Studio SUT/SUTG · libmypaint MYB · Krita KPP/번들 가져오기"',
    );
    // MYB/KPP 파서가 있는데 진입점이 없던 상태를 되돌리지 못하게 accept 를 고정한다.
    expect(html).toContain(`accept="${STUDIO_BRUSH_PACK_ACCEPT}"`);
    for (const extension of [".json", ".abr", ".myb", ".kpp", ".sut", ".sutg", ".bundle"]) {
      expect(STUDIO_BRUSH_PACK_ACCEPT).toContain(extension);
    }
    expect(html).toContain("주력 펜 고정 해제");
    expect(html).toContain("주력 펜 복제");
    expect(html).toContain("주력 펜 이름 변경");
    expect(html).toContain("주력 펜 내보내기");
    expect(html).toContain("주력 펜 브러시 공유");
    expect(html).toContain("주력 펜 브러시 삭제");
    expect(html).toContain("<details");
    expect(html).toContain("관리 · 덮어쓰기, 복제, 공유");
    expect(html).not.toContain("<details open");
    expect(html).toContain("grid-cols-3");
    expect(html).toContain("sm:grid-cols-6");
    expect(html).toContain('aria-label="주력 펜 브러시 적용, 펜(매끈), 6px, 100퍼센트"');
    expect(html).toContain('aria-pressed="true"');
  });

  it("모바일 조작 영역과 투명 색상용 명암 미리보기를 유지한다", () => {
    const html = renderToStaticMarkup(
      <StudioBrushLibraryPanel
        currentSnapshot={snapshot}
        brushes={[saved]}
        onBrushesChange={() => undefined}
        onApplyBrush={() => undefined}
        onBrushDeleted={() => undefined}
      />
    );
    expect(html).toContain("min-h-11");
    expect(html).toContain("size-11");
    expect(html).toContain("min-h-16");
    expect(html).toContain('role="group" aria-label="내 브러시 표시 방식"');
    expect(html).toContain('data-studio-saved-brush-view="stroke"');
    expect(html).toContain('data-studio-saved-brush-preview="solid"');
    expect(html).toContain('data-studio-saved-brush-preview-opacity="1"');
    expect(html).toContain('fill="#ff6600"');
    expect(html).toContain("oklch(0.9 0.008 70)");
  });

  it("저장한 프로 브러시는 런타임 펜이 아니라 원본 프리셋 이름과 획 스타일로 표시한다", () => {
    const proSaved: StudioSavedBrush = {
      ...saved,
      id: "saved-pro",
      name: "반짝임 장식",
      brushId: "ink-particle",
      sourcePresetId: "heart-stamp",
      sourcePresetName: "하트 도장",
    };
    const html = renderToStaticMarkup(
      <StudioBrushLibraryPanel
        currentSnapshot={snapshot}
        brushes={[proSaved]}
        onBrushesChange={() => undefined}
        onApplyBrush={() => undefined}
        onBrushDeleted={() => undefined}
      />
    );

    expect(html).toContain('data-studio-saved-brush-preview="glitter"');
    expect(html).toContain(
      'aria-label="반짝임 장식 브러시 적용, 하트 도장, 6px, 100퍼센트"'
    );
    expect(html).toContain("하트 도장 · 6px · 100%");
    expect(html).not.toContain("입자");
  });

  it("획과 이름 목록을 바꿔도 저장 브러시 적용·관리 계약을 유지한다", async () => {
    const onApplyBrush = vi.fn();
    const values = new Map<string, string>([
      [
        BRUSH_LIBRARY_KEY,
        JSON.stringify({ version: BRUSH_LIBRARY_STORAGE_VERSION, brushes: [saved] }),
      ],
    ]);
    const repository = createStorageBrushLibraryRepository({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    });
    const repositoryFactory = vi.fn(async () => ({
      authority: "sqlite" as const,
      repository,
      migration: null,
    }));
    const { container } = render(
      <StudioBrushLibraryPanel
        currentSnapshot={snapshot}
        brushes={[saved]}
        onBrushesChange={vi.fn()}
        onApplyBrush={onApplyBrush}
        onBrushDeleted={vi.fn()}
        repositoryFactory={repositoryFactory}
      />
    );

    await waitFor(() => expect(
      container.querySelector("[data-studio-brush-library-authority]")
        ?.getAttribute("data-studio-brush-library-authority"),
    ).toBe("sqlite"));

    const list = () => container.querySelector<HTMLElement>("[data-studio-saved-brush-view]");
    expect(list()?.dataset.studioSavedBrushView).toBe("stroke");
    expect(screen.getByRole("button", { name: "내 브러시 획 미리보기" }).getAttribute("aria-pressed"))
      .toBe("true");
    expect(container.querySelector("[data-studio-saved-brush-preview]")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "내 브러시 이름 목록" }));
    expect(list()?.dataset.studioSavedBrushView).toBe("text");
    expect(screen.getByRole("button", { name: "내 브러시 이름 목록" }).getAttribute("aria-pressed"))
      .toBe("true");
    expect(container.querySelector("[data-studio-saved-brush-preview]")).toBeNull();
    expect(container.querySelector('span[style*="background"]')).toBeTruthy();

    fireEvent.click(screen.getByRole("button", {
      name: "주력 펜 브러시 적용, 펜(매끈), 6px, 100퍼센트",
    }));
    await waitFor(() => expect(onApplyBrush).toHaveBeenCalledOnce());
    expect(onApplyBrush).toHaveBeenCalledWith(expect.objectContaining({ id: saved.id }));
    expect(screen.getByText("관리 · 덮어쓰기, 복제, 공유")).toBeTruthy();
  });

  it("빈 상태는 모바일에서도 저장 브러시를 재사용할 수 있음을 안내한다", () => {
    const html = renderToStaticMarkup(
      <StudioBrushLibraryPanel
        currentSnapshot={snapshot}
        brushes={[]}
        onBrushesChange={() => undefined}
        onApplyBrush={() => undefined}
        onBrushDeleted={() => undefined}
      />
    );
    expect(html).toContain("브러시 카탈로그를 준비하고 있어요");
  });

  it("제품 경계가 SQLite 권위 repository를 비동기로 불러오고 mutation을 그 포트로 보낸다", async () => {
    const values = new Map<string, string>([
      [
        BRUSH_LIBRARY_KEY,
        JSON.stringify({ version: BRUSH_LIBRARY_STORAGE_VERSION, brushes: [saved] }),
      ],
    ]);
    const storage: BrushLibraryStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
    const repository = createStorageBrushLibraryRepository(storage);
    const repositoryFactory = vi.fn(async () => ({
      authority: "sqlite" as const,
      repository,
      migration: null,
    }));

    function Harness() {
      const [items, setItems] = useState<StudioSavedBrush[]>([]);
      return (
        <StudioBrushLibraryPanel
          currentSnapshot={snapshot}
          brushes={items}
          onBrushesChange={setItems}
          onApplyBrush={vi.fn()}
          onBrushDeleted={vi.fn()}
          repositoryFactory={repositoryFactory}
        />
      );
    }

    const { container } = render(<Harness />);
    await waitFor(() => expect(screen.getByText(/1개 · 무제한 · 로컬 SQL/)).toBeTruthy());
    expect(
      container.querySelector("[data-studio-brush-library-authority]")
        ?.getAttribute("data-studio-brush-library-authority"),
    ).toBe("sqlite");
    expect(repositoryFactory).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "주력 펜 고정 해제" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "주력 펜 빠른 선반에 고정" })
          .getAttribute("aria-pressed"),
      ).toBe("false");
    });

    await repository.put({
      ...saved,
      id: "market-installed",
      name: "마켓 설치 펜",
      createdAt: 10,
      updatedAt: 10,
      lastUsedAt: null,
    });
    notifyStudioBrushLibraryChanged();
    await waitFor(() => expect(screen.getByText("마켓 설치 펜")).toBeTruthy());
    expect(screen.getByText(/2개 · 무제한 · 로컬 SQL/u)).toBeTruthy();
  });

  it("첫 repository 열기 실패 뒤 같은 패널에서 새 generation으로 복구한다", async () => {
    const repository = createStorageBrushLibraryRepository({
      getItem: () => null,
      setItem: () => undefined,
    });
    const repositoryFactory = vi.fn()
      .mockRejectedValueOnce(new Error("worker bootstrap failed"))
      .mockResolvedValue({
        authority: "sqlite" as const,
        repository,
        migration: null,
      });

    function Harness() {
      const [items, setItems] = useState<StudioSavedBrush[]>([]);
      return (
        <StudioBrushLibraryPanel
          currentSnapshot={snapshot}
          brushes={items}
          onBrushesChange={setItems}
          onApplyBrush={vi.fn()}
          onBrushDeleted={vi.fn()}
          repositoryFactory={repositoryFactory}
        />
      );
    }

    const { container } = render(<Harness />);
    await waitFor(() => expect(
      container.querySelector("[data-studio-brush-library-authority]")
        ?.getAttribute("data-studio-brush-library-authority"),
    ).toBe("error"));

    fireEvent.change(screen.getByRole("searchbox", { name: "내 브러시 검색" }), {
      target: { value: "복구" },
    });

    await waitFor(() => expect(
      container.querySelector("[data-studio-brush-library-authority]")
        ?.getAttribute("data-studio-brush-library-authority"),
    ).toBe("sqlite"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(repositoryFactory).toHaveBeenCalledTimes(2);
  });

  it("SQLite 비가용 메모리 세션을 비영속으로 표시하고 저장·무제한을 주장하지 않는다", async () => {
    const values = new Map<string, string>([
      [
        BRUSH_LIBRARY_KEY,
        JSON.stringify({ version: BRUSH_LIBRARY_STORAGE_VERSION, brushes: [saved] }),
      ],
    ]);
    const repository = createStorageBrushLibraryRepository({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    });
    const repositoryFactory = vi.fn(async () => ({
      authority: "memory-session" as const,
      repository,
      migration: null,
    }));

    function Harness() {
      const [items, setItems] = useState<StudioSavedBrush[]>([]);
      return (
        <StudioBrushLibraryPanel
          currentSnapshot={snapshot}
          brushes={items}
          onBrushesChange={setItems}
          onApplyBrush={vi.fn()}
          onBrushDeleted={vi.fn()}
          repositoryFactory={repositoryFactory}
        />
      );
    }

    const { container } = render(<Harness />);
    await waitFor(() => expect(screen.getByText(
      "세션 편집·가져오기·공유·재적용 · 1개 · 비영속 메모리 · 브라우저 종료 시 사라짐",
    )).toBeTruthy());
    expect(container.querySelector("[data-studio-brush-library-authority]")
      ?.getAttribute("data-studio-brush-library-authority")).toBe("memory-session");
    expect(screen.getByRole("button", { name: "현재 브러시 세션에 보관" })).toBeTruthy();
    expect(container.textContent).not.toContain("무제한");
    expect(container.textContent).not.toContain("현재 브러시 저장");
    expect(container.textContent).not.toContain("호환 저장소");
  });

  it("무제한 SQLite 카탈로그를 256개 keyset 페이지로 읽고 명시적으로 이어 붙인다", async () => {
    const second: StudioSavedBrush = {
      ...saved,
      id: "saved-2",
      name: "두 번째 펜",
      createdAt: 4,
      updatedAt: 5,
      lastUsedAt: 6,
      pinned: false,
    };
    const baseRepository = createStorageBrushLibraryRepository({
      getItem: () => null,
      setItem: () => undefined,
    });
    const query = vi.fn(async (request: BrushLibraryPageRequest = {}) => {
      if (request.search === "두 번째") {
        return {
          items: [second],
          nextCursor: null,
          hasMore: false,
          totalCount: 1,
        };
      }
      return request.cursor === "page-2"
        ? {
            items: [second],
            nextCursor: null,
            hasMore: false,
            totalCount: 2,
          }
        : {
            items: [saved],
            nextCursor: "page-2",
            hasMore: true,
            totalCount: 2,
          };
    });
    const repositoryFactory = async () => ({
      authority: "sqlite" as const,
      repository: { ...baseRepository, query },
      migration: null,
    });

    function Harness() {
      const [items, setItems] = useState<StudioSavedBrush[]>([]);
      return (
        <StudioBrushLibraryPanel
          currentSnapshot={snapshot}
          brushes={items}
          onBrushesChange={setItems}
          onApplyBrush={vi.fn()}
          onBrushDeleted={vi.fn()}
          repositoryFactory={repositoryFactory}
        />
      );
    }

    const { container } = render(<Harness />);
    await waitFor(() => expect(screen.getByText(/2개 · 무제한 · 로컬 SQL/u)).toBeTruthy());
    expect(query).toHaveBeenNthCalledWith(1, { cursor: null, limit: 256 });
    expect(container.querySelector("[data-studio-brush-library-loaded-count]")
      ?.getAttribute("data-studio-brush-library-loaded-count")).toBe("1");
    expect(screen.queryByText("두 번째 펜")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "더 불러오기 (1/2)" }));

    await waitFor(() => expect(screen.getByText("두 번째 펜")).toBeTruthy());
    expect(query).toHaveBeenNthCalledWith(2, { cursor: "page-2", limit: 256 });
    expect(screen.queryByRole("button", { name: /더 불러오기/u })).toBeNull();
    expect(container.querySelector("[data-studio-brush-library-loaded-count]")
      ?.getAttribute("data-studio-brush-library-loaded-count")).toBe("2");

    fireEvent.change(screen.getByRole("searchbox", { name: "내 브러시 검색" }), {
      target: { value: "두 번째" },
    });

    await waitFor(() => expect(screen.getByText(/1개 · 무제한 · 로컬 SQL/u)).toBeTruthy());
    expect(query).toHaveBeenLastCalledWith({
      cursor: null,
      limit: 256,
      search: "두 번째",
    });
    expect(screen.getByText("두 번째 펜")).toBeTruthy();
    expect(screen.queryByText("주력 펜")).toBeNull();
  });

  it("Krita bundle의 KPP/MYB 3개를 한 putMany로 저장하고 권리·미지원 원장을 표시한다", async () => {
    const values = new Map<string, string>();
    const storage: BrushLibraryStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
    const repository = createStorageBrushLibraryRepository(storage);
    const putMany = vi.spyOn(repository, "putMany");
    const repositoryFactory = async () => ({
      authority: "sqlite" as const,
      repository,
      migration: null,
    });

    function Harness() {
      const [items, setItems] = useState<StudioSavedBrush[]>([]);
      return (
        <StudioBrushLibraryPanel
          currentSnapshot={snapshot}
          brushes={items}
          onBrushesChange={setItems}
          onApplyBrush={vi.fn()}
          onBrushDeleted={vi.fn()}
          repositoryFactory={repositoryFactory}
        />
      );
    }

    render(<Harness />);
    await waitFor(() => expect(screen.getByText(/0개 · 무제한 · 로컬 SQL/u)).toBeTruthy());
    const bytes = buildKritaBundleFixture({ compression: "stored" });
    const input = screen.getByLabelText(
      "브러시 설정 · Photoshop ABR · Clip Studio SUT/SUTG · libmypaint MYB · Krita KPP/번들 가져오기",
    );
    fireEvent.change(input, {
      target: {
        files: [new File([bytes.slice().buffer], "authored.bundle", {
          type: "application/x-krita-resourcebundle",
        })],
      },
    });

    await waitFor(() => expect(putMany).toHaveBeenCalledOnce());
    expect(putMany.mock.calls[0]?.[0]).toHaveLength(3);
    await waitFor(() => expect(screen.getByText(/3개 · 무제한 · 로컬 SQL/u)).toBeTruthy());
    const status = screen.getByRole("status").textContent ?? "";
    expect(status).toContain("Krita 번들");
    expect(status).toContain("CC0-1.0");
    expect(status).toContain("미지원 항목");
  });

  it("Worker 격리가 없으면 preserve-only SUT를 성공 처리하거나 putMany하지 않는다", async () => {
    vi.stubGlobal("Worker", undefined);
    const values = new Map<string, string>();
    const storage: BrushLibraryStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
    const repository = createStorageBrushLibraryRepository(storage);
    const putMany = vi.spyOn(repository, "putMany");
    const repositoryFactory = async () => ({
      authority: "sqlite" as const,
      repository,
      migration: null,
    });
    render(
      <StudioBrushLibraryPanel
        currentSnapshot={snapshot}
        brushes={[]}
        onBrushesChange={vi.fn()}
        onApplyBrush={vi.fn()}
        onBrushDeleted={vi.fn()}
        repositoryFactory={repositoryFactory}
      />,
    );
    const bytes = buildAuthoredSutFixture();
    fireEvent.change(screen.getByLabelText(
      "브러시 설정 · Photoshop ABR · Clip Studio SUT/SUTG · libmypaint MYB · Krita KPP/번들 가져오기",
    ), {
      target: {
        files: [new File([bytes.slice().buffer], "preserve-only.sut", {
          type: "application/octet-stream",
        })],
      },
    });

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("보존 판정"));
    expect(screen.getByRole("alert").textContent).toContain("SQLite 카탈로그에는 저장하지 않았어요");
    expect(screen.queryByRole("status")).toBeNull();
    expect(putMany).not.toHaveBeenCalled();
  });
});
