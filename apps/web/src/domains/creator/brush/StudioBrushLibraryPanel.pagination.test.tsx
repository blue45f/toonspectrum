// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useCallback, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { studioBrushDynamicsPresetSettings } from "./studio-brush-dynamics";
import {
  BRUSH_LIBRARY_CAPACITY,
  type DeletedBrushRecord,
  type StudioBrushSnapshot,
  type StudioSavedBrush,
} from "./studio-brush-library";
import type {
  BrushLibraryPageRequest,
  BrushLibraryRepositoryPort,
} from "./studio-brush-library-repository";
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

function makeBrush(index: number): StudioSavedBrush {
  return {
    id: `brush-${index}`,
    name: `테스트 브러시 ${index}`,
    createdAt: index,
    updatedAt: index,
    pinned: false,
    lastUsedAt: null,
    ...snapshot,
  };
}

type ProductRepository = {
  readonly authority: "sqlite";
  readonly repository: BrushLibraryRepositoryPort;
  readonly migration: null;
};

/** 커서 기반 페이지 쿼리를 흉내내는 가짜 repository. */
function createPagedRepository(brushes: readonly StudioSavedBrush[]) {
  const queryCalls: BrushLibraryPageRequest[] = [];
  const repository: BrushLibraryRepositoryPort = {
    capacity: BRUSH_LIBRARY_CAPACITY,
    query: async (request = {}) => {
      queryCalls.push(request);
      const start = request.cursor == null ? 0 : Number(request.cursor);
      const limit = request.limit ?? 256;
      const items = brushes.slice(start, start + limit);
      const next = start + limit;
      return {
        items,
        nextCursor: next < brushes.length ? String(next) : null,
        hasMore: next < brushes.length,
        totalCount: brushes.length,
      };
    },
    getById: async (id) => brushes.find((brush) => brush.id === id) ?? null,
    put: async (brush) => brush,
    putMany: async () => ({ savedCount: 0, skippedDuplicateCount: 0 }),
    delete: async () => null,
    restore: async (deleted: DeletedBrushRecord) => deleted.brush,
    duplicate: async () => null,
  };
  return { repository, queryCalls };
}

function Harness({
  repositoryFactory,
  onBrushesChange,
}: {
  readonly repositoryFactory: () => Promise<ProductRepository>;
  readonly onBrushesChange: (brushes: StudioSavedBrush[]) => void;
}) {
  const [items, setItems] = useState<StudioSavedBrush[]>([]);
  // 패널의 로드 effect 의존성이 안정적이도록 핸들러를 메모이즈한다.
  const handleChange = useCallback(
    (next: StudioSavedBrush[]) => {
      onBrushesChange(next);
      setItems(next);
    },
    [onBrushesChange],
  );
  return (
    <StudioBrushLibraryPanel
      currentSnapshot={snapshot}
      brushes={items}
      onBrushesChange={handleChange}
      onApplyBrush={() => undefined}
      onBrushDeleted={() => undefined}
      repositoryFactory={repositoryFactory}
    />
  );
}

function setup(total: number) {
  const brushes = Array.from({ length: total }, (_, index) => makeBrush(index));
  const { repository, queryCalls } = createPagedRepository(brushes);
  const repositoryFactory = vi.fn(
    async (): Promise<ProductRepository> => ({
      authority: "sqlite",
      repository,
      migration: null,
    }),
  );
  const seen: StudioSavedBrush[][] = [];
  render(<Harness repositoryFactory={repositoryFactory} onBrushesChange={(next) => seen.push(next)} />);
  return { queryCalls, seen };
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("StudioBrushLibraryPanel 페이지 단위 로드", () => {
  it("첫 로드에서는 256개 페이지만 요청한다", async () => {
    const { queryCalls, seen } = setup(600);

    await waitFor(() => {
      expect(seen.at(-1)).toHaveLength(256);
    });
    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0]?.cursor ?? null).toBeNull();
    expect(queryCalls[0]?.limit).toBe(256);
    // 버튼 라벨에 현재 누적 수/전체가 표시된다.
    expect(screen.getByRole("button", { name: /더 불러오기/ }).textContent).toContain("(256/600)");
  });

  it("더 불러오기를 누르면 커서로 다음 페이지를 합친다", async () => {
    const { queryCalls, seen } = setup(600);

    await waitFor(() => {
      expect(seen.at(-1)).toHaveLength(256);
    });

    fireEvent.click(screen.getByRole("button", { name: /더 불러오기/ }));
    await waitFor(() => {
      expect(seen.at(-1)).toHaveLength(512);
    });
    expect(queryCalls).toHaveLength(2);
    expect(queryCalls[1]?.cursor).toBe("256");
    expect(queryCalls[1]?.limit).toBe(256);
    // 중복 없이 합쳐졌는지 id 기준으로 확인한다.
    const ids = new Set(seen.at(-1)?.map((brush) => brush.id));
    expect(ids.size).toBe(512);

    fireEvent.click(screen.getByRole("button", { name: /더 불러오기/ }));
    await waitFor(() => {
      expect(seen.at(-1)).toHaveLength(600);
    });
    expect(queryCalls).toHaveLength(3);
    expect(queryCalls[2]?.cursor).toBe("512");

    // 마지막 페이지 뒤에는 더 불러오기 버튼이 사라진다.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /더 불러오기/ })).toBeNull();
    });
  });

  it("라이브러리가 한 페이지보다 작으면 더 불러오기를 렌더하지 않는다", async () => {
    const { queryCalls, seen } = setup(100);

    await waitFor(() => {
      expect(seen.at(-1)).toHaveLength(100);
    });
    expect(queryCalls).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /더 불러오기/ })).toBeNull();
  });
});
