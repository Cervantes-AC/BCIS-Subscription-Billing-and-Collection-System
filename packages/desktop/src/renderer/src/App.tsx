/**
 * BCIS Desktop Client - Main App Component
 */

import React from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from './stores/useStore';
import api from './lib/api';
import { formatCurrency, formatCentavos } from '@bcis/shared';

import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { useAuthStore } from './stores/useAuthStore';
import { usePermission } from './hooks/usePermission';
import { KPICards } from './components/KPICards';
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

  // Check permissions hook
  usePermission(hasPermission);

  if (isLoading) {
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
        onToggleSidebar={(sidebar: boolean) => useStore.getState().setSidebarCollapsed(sidebar)}
          onLogout={() => {
            void api.logout().catch(() => undefined).finally(() => {
              clearUser();
              queryClient.clear();
              navigate('/login', { replace: true });
            });
          }}
      />
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={sidebar => useStore.getState().setSidebarCollapsed(sidebar)}
        />

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          {/* Route wrapper with KPI cards on dashboard */}
          <Routes>
            <Route path="/login" element={<Navigate to="/dashboard" replace />} />
            <Route path="/" element={
              <div className="content-area">
                <KPICards />
                <DashboardPage />
              </div>
            } />
            <Route path="/dashboard" element={
              <div className="content-area">
                <KPICards />
                <DashboardPage />
              </div>
            } />
            <Route path="/subscribers" element={
              <SubscribersPage />
            } />
            <Route path="/billing" element={
              <BillingPage />
            } />
            <Route path="/payments" element={
              <PaymentsPage />
            } />
            <Route path="/collections" element={
              <CollectionsPage />
            } />
            <Route path="/receivables" element={
              <ReceivablesPage />
            } />
            <Route path="/reports" element={
              <ReportsPage />
            } />
            <Route path="/admin" element={
              <AdminPage />
            } />
          </Routes>
        </div>
      </div>
    </div>
  );
}
