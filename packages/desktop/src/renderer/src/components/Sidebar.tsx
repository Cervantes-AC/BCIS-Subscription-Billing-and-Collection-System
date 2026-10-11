import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../stores/useStore';
import { useAuthStore } from '../stores/useAuthStore';
import api from '../lib/api';
import {
  LayoutDashboard, Users, FileText, CreditCard, Truck,
  AlertTriangle, BarChart2, Settings, LogOut
} from 'lucide-react';

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  permission?: string;
}

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: (collapsed: boolean) => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const navigate = useNavigate();
  const store = useStore.getState();
  const sidebarCollapsed = collapsed ?? store.sidebarCollapsed;
  const { user } = useAuthStore();
  const clearUser = useAuthStore((state) => state.clearUser);

  const navItems: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { key: 'subscribers', label: 'Subscribers', icon: <Users className="w-5 h-5" /> },
    { key: 'billing', label: 'Billing', icon: <FileText className="w-5 h-5" /> },
    { key: 'payments', label: 'Payments', icon: <CreditCard className="w-5 h-5" /> },
    { key: 'collections', label: 'Collections', icon: <Truck className="w-5 h-5" /> },
    { key: 'receivables', label: 'Receivables', icon: <AlertTriangle className="w-5 h-5" /> },
    { key: 'reports', label: 'Reports', icon: <BarChart2 className="w-5 h-5" /> },
    { key: 'admin', label: 'Administration', icon: <Settings className="w-5 h-5" />, permission: 'admin.user.manage' },
  ];

  // Filter by user permissions
  const visibleItems = navItems.filter((item) => {
    if (!item.permission) return true;
    const userPermissions = user?.role?.permissions?.map((p: any) => p.code) || [];
    return userPermissions.includes(item.permission);
  });

  return (
    <aside
      className={`sidebar flex flex-col h-screen border-r border-border ${sidebarCollapsed ? 'collapsed' : ''}`}
    >
      {/* Sidebar header */}
      <div className={`p-4 border-b border-border ${sidebarCollapsed ? 'text-center' : ''}`}>
        <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
          <span className={sidebarCollapsed ? 'sr-only' : ''}>
            Navigation
          </span>
          {sidebarCollapsed && <span aria-hidden="true">BC</span>}
        </h2>
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pt-2">
        <ul className="space-y-1">
          {visibleItems.map((item) => (
            <li key={item.key}>
              <button
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${sidebarCollapsed ? 'justify-center' : ''}`}
                onClick={() => {
                  // Navigate to route
                  const routes: Record<string, string> = {
                    dashboard: '/dashboard',
                    subscribers: '/subscribers',
                    billing: '/billing',
                    payments: '/payments',
                    collections: '/collections',
                    receivables: '/receivables',
                    reports: '/reports',
                    admin: '/admin',
                  };
                  navigate(routes[item.key]);
                }}
                aria-label={item.label}
              >
                {item.icon}
                <span className={sidebarCollapsed ? 'sr-only' : 'truncate'}>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer with logout */}
      <div className="p-3 border-t border-border text-xs text-text-secondary">
        <button
                onClick={() => {
                  void api.logout().catch(() => undefined).finally(() => {
                    clearUser();
                    navigate('/login', { replace: true });
                  });
                }}
          className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 transition-colors flex items-center gap-2"
          aria-label="Logout"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:block">Logout</span>
        </button>
      </div>
    </aside>
  );
}
