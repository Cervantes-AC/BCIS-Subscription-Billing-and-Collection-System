import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AppStore {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed: boolean) => set({ sidebarCollapsed: collapsed }),
    }),
    {
      name: 'bcis-desktop-storage',
    }
  )
);

export const useStore = useAppStore;

export interface AuthStore {
  user: any;
  isLoading: boolean;
  setUser: (user: any) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user: any) => set({ user, isLoading: false }),
  clearUser: () => set({ user: null, isLoading: false }),
}));