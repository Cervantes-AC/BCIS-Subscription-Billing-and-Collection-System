import React from 'react';
import { useStore } from '../stores/useStore';
import { useAuthStore } from '../stores/useAuthStore';

export function TopBar({ user, sidebarCollapsed, onToggleSidebar, onLogout }: any) {
  const setSidebarCollapsed = useStore.getState().setSidebarCollapsed;

  return (
    <header className="topbar bg-surface border-b border-border px-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-white font-bold">BCIS</span>
        </div>
        <h1 className="text-xl font-semibold text-text-primary">BCIS Billing System</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* User info */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">
            {user?.fullName || 'User'}
          </span>
        </div>

        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="p-2 rounded-lg hover:bg-gray-50 transition-colors"
          aria-label="Toggle sidebar"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              className="stroke-2"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={onLogout}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
            aria-label="Logout"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                className="stroke-2"
                d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M12 3v18m0-3h4a2 2 0 002-2V5a2 2 0 00-2-2h-4m0 2l-3 9m3-9l3-9m-3 9l3 9"
              />
            </svg>
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}