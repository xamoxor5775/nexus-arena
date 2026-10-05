import { create } from "zustand";

export type SkinsPanel = "arsenal" | "credits" | null;

export const useSkinsUi = create<{ panel: SkinsPanel; setPanel: (p: SkinsPanel) => void }>((set) => ({
  panel: null,
  setPanel: (panel) => set({ panel }),
}));

export function openSkinsPanel(panel: Exclude<SkinsPanel, null>) {
  useSkinsUi.getState().setPanel(panel);
}
