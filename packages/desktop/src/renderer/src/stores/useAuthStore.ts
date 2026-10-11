import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthStore {
  user: any;
  isLoading: boolean;
  setUser: (user: any) => void;
  clearUser: () => void;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: true,
      setUser: (user: any) => set({ user, isLoading: false }),
      clearUser: () => set({ user: null, isLoading: false }),
      hasPermission: (permission: string) =>
        get().user?.role?.permissions?.some((item: any) => item.code === permission) ?? false,
    }),
    {
      name: 'bcis-auth-storage',
      partialize: (state) => ({ user: state.user }),
    }
  )
);