/**
 * BCIS Desktop Client - Main App Component
 */

import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from './stores/useStore';
import api from './lib/api';

import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { useAuthStore } from './stores/useAuthStore';
import { usePermission } from './hooks/usePermission';
import { DashboardPage } from './pages/DashboardPage';
import { SubscribersPage } from './pages/SubscribersPage';
import { BillingPage } from './pages/BillingPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { ReceivablesPage } from './pages/ReceivablesPage';
import { ReportsPage } from './pages/ReportsPage';
import { AdminPage } from './pages/AdminPage';
import { LoginPage } from './pages/LoginPage';

export function App() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isLoading, setUser, clearUser, hasPermission } = useAuthStore();
  const { sidebarCollapsed } = useStore();
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const restoreSession = async () => {
      if (!api.isAuthenticated()) {
        clearUser();
        setSessionReady(true);
        return;
      }

      try {
        const response = await api.getCurrentUser();
        if (cancelled) return;
        if (response.success && response.data?.user) setUser(response.data.user);
        else clearUser();
      } catch {
        if (!cancelled) clearUser();
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    };

    void restoreSession();
    const handleSessionExpired = () => {
      clearUser();
      queryClient.clear();
    };
    window.addEventListener('bcis:session-expired', handleSessionExpired);
    return () => {
      cancelled = true;
      window.removeEventListener('bcis:session-expired', handleSessionExpired);
    };
  }, [clearUser, queryClient, setUser]);

  // Check permissions hook
  usePermission(hasPermission);

  const authorizedPage = (permission: string, page: React.ReactNode) =>
    hasPermission(permission) ? page : <Navigate to="/dashboard" replace />;

  if (isLoading || !sessionReady) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-text-secondary">Loading...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="page-container">
      <TopBar
        user={user}
        sidebarCollapsed={sidebarCollapsed}
        className={sidebarCollapsed ? 'sidebar-collapsed' : ''}
        onToggleSidebar={(sidebar: boolean) => useStore.getState().setSidebarCollapsed(sidebar)}
        onLogout={() => {
          void api.logout().catch(() => undefined).finally(() => {
            clearUser();
            queryClient.clear();
            navigate('/login', { replace: true });
          });
        }}
      />
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={sidebar => useStore.getState().setSidebarCollapsed(sidebar)}
      />

      <main className={`app-main ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <Routes>
          <Route path="/login" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/"
            element={
              <div className="content-area">
                <DashboardPage />
              </div>
            }
          />
          <Route
            path="/dashboard"
            element={
              <div className="content-area">
                <DashboardPage />
              </div>
            }
          />
          <Route path="/subscribers" element={authorizedPage('subscriber.view', <SubscribersPage />)} />
          <Route path="/billing" element={authorizedPage('billing.view', <BillingPage />)} />
          <Route path="/payments" element={authorizedPage('payment.view', <PaymentsPage />)} />
          <Route path="/collections" element={authorizedPage('collection.view', <CollectionsPage />)} />
          <Route path="/receivables" element={authorizedPage('receivables.view', <ReceivablesPage />)} />
          <Route path="/reports" element={authorizedPage('report.view', <ReportsPage />)} />
          <Route path="/admin" element={authorizedPage('admin.user.manage', <AdminPage />)} />
        </Routes>
      </main>
    </div>
  );
}
