// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreatorDirectoryPage } from "./CreatorDirectoryPage";

import type {
  CreatorDirectoryEntry,
  CreatorDirectoryResult,
} from "@/platform/creator-client";
import type { PublicCreatorRoleProfile } from "@/shared/lib/creator-role-contract";
import { CREATOR_PUBLIC_ROLE_PROFILE_VERSION } from "@/shared/lib/creator-role-contract";

const searchCreatorDirectory = vi.hoisted(() => vi.fn());
vi.mock("@/platform/creator-client", () => ({
  searchCreatorDirectory,
}));

function profile(overrides: Partial<PublicCreatorRoleProfile> = {}): PublicCreatorRoleProfile {
  return {
    version: CREATOR_PUBLIC_ROLE_PROFILE_VERSION,
    primaryRole: "story",
    secondaryRoles: [],
    specialties: ["world-building"],
    experienceLevel: null,
    collaborationStatus: "available",
    roleAliases: [],
    ...overrides,
  };
}

function entry(id: string, name: string): CreatorDirectoryEntry {
  return {
    id,
    name,
    avatar: "#123456",
    bio: `${name} 소개`,
    createdAt: null,
    creatorRoleProfile: profile(),
  };
}

function result(items: CreatorDirectoryEntry[], nextOffset: number | null = null): CreatorDirectoryResult {
  return { items, nextOffset };
}

function view() {
  return (
    <MemoryRouter initialEntries={["/creators"]}>
      <CreatorDirectoryPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  searchCreatorDirectory.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("CreatorDirectoryPage", () => {
  it("목록을 불러와 창작자 카드를 렌더링한다", async () => {
    searchCreatorDirectory.mockResolvedValue(result([entry("a", "창작자A"), entry("b", "창작자B")]));
    render(view());

    expect(screen.getByLabelText("창작자 목록을 불러오는 중")).toBeTruthy();

    await waitFor(() => expect(screen.getByText("창작자A")).toBeTruthy());
    expect(screen.getByText("창작자B")).toBeTruthy();
    expect(screen.getByText("공개 창작자 2명")).toBeTruthy();
    expect(searchCreatorDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 24, offset: 0 }),
      expect.any(AbortSignal),
    );
  });

  it("검색 조건을 적용하면 질의가 갱신된다", async () => {
    searchCreatorDirectory.mockResolvedValue(result([]));
    render(view());
    await waitFor(() => expect(searchCreatorDirectory).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText("이름 또는 소개 검색"), {
      target: { value: "웹툰" },
    });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    await waitFor(() =>
      expect(searchCreatorDirectory).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "웹툰", limit: 24, offset: 0 }),
        expect.any(AbortSignal),
      ),
    );
  });

  it("오류가 나면 재시도 버튼으로 다시 불러온다", async () => {
    searchCreatorDirectory
      .mockRejectedValueOnce(new Error("네트워크 오류"))
      .mockResolvedValue(result([entry("a", "창작자A")]));
    render(view());

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("네트워크 오류");

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() => expect(screen.getByText("창작자A")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(searchCreatorDirectory).toHaveBeenCalledTimes(2);
  });

  it("결과가 없으면 빈 상태와 검색 조건 초기화 CTA를 보여준다", async () => {
    searchCreatorDirectory.mockResolvedValue(result([]));
    render(view());

    await waitFor(() =>
      expect(screen.getByText("조건에 맞는 공개 창작자가 없습니다")).toBeTruthy(),
    );

    const emptySection = document.querySelector("section");
    expect(emptySection).toBeTruthy();
    fireEvent.click(
      within(emptySection as HTMLElement).getByRole("button", { name: "검색 조건 초기화" }),
    );

    await waitFor(() =>
      expect(searchCreatorDirectory).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: undefined, role: undefined, specialty: undefined }),
        expect.any(AbortSignal),
      ),
    );
  });

  it("더 보기로 다음 페이지를 이어 붙인다", async () => {
    searchCreatorDirectory
      .mockResolvedValueOnce(result([entry("a", "창작자A")], 1))
      .mockResolvedValue(result([entry("b", "창작자B")], null));
    render(view());

    await waitFor(() => expect(screen.getByText("창작자A")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));

    await waitFor(() => expect(screen.getByText("창작자B")).toBeTruthy());
    expect(screen.getByText("창작자A")).toBeTruthy();
    expect(searchCreatorDirectory).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 1, limit: 24 }),
    );
  });
});
