// =============================================================================
// Store UI (zustand). Stato globale di interfaccia: drawer, tema, workspace
// attivo. Persistito in localStorage per continuita' fra le sessioni.
// =============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Workspace } from "@pv/lib/types";

export type ThemeMode = "dark" | "light" | "system";

interface UiState {
  drawerOpen: boolean;
  theme: ThemeMode;
  activeWorkspaceId: string;
  /** Workspace creati dall'utente (onboarding). Si sommano a quelli remoti. */
  customWorkspaces: Workspace[];
  toggleDrawer: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  setTheme: (theme: ThemeMode) => void;
  setActiveWorkspace: (workspaceId: string) => void;
  addWorkspace: (workspace: Workspace) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      drawerOpen: false,
      theme: "dark",
      activeWorkspaceId: "ws-aethersy",
      customWorkspaces: [],
      toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen })),
      openDrawer: () => set({ drawerOpen: true }),
      closeDrawer: () => set({ drawerOpen: false }),
      setTheme: (theme) => set({ theme }),
      setActiveWorkspace: (activeWorkspaceId) => set({ activeWorkspaceId }),
      addWorkspace: (workspace) =>
        set((state) => ({
          customWorkspaces: [
            workspace,
            ...state.customWorkspaces.filter((item) => item.id !== workspace.id),
          ],
          activeWorkspaceId: workspace.id,
        })),
    }),
    {
      name: "aethersy-ui",
      // Il drawer non deve essere ripristinato aperto al reload.
      partialize: (state) => ({
        theme: state.theme,
        activeWorkspaceId: state.activeWorkspaceId,
        customWorkspaces: state.customWorkspaces,
      }),
    },
  ),
);
