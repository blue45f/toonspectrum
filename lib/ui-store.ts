import { create } from "zustand";

// 클라이언트 전역 UI 상태(서버 상태 아님 — react-query 영역과 분리). 비영속(새로고침 시 닫힘).
// 커맨드 팔레트 열림은 헤더 검색 버튼·OpenSearchButton·⌘K 단축키 등 여러 곳에서 토글하므로
// 기존 window CustomEvent 브리지 대신 zustand 스토어로 단일화한다(상태 동작은 동일).
interface UiState {
  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

export const useUi = create<UiState>()((set) => ({
  commandPaletteOpen: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
}));
