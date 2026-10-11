import React from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { KPICards } from '../components/KPICards';

export function DashboardPage() {
  const { user } = useAuthStore();

  return (
    <div>
      <h2 className="page-title mb-6">Dashboard</h2>
      <p className="text-text-secondary mb-6">
        Welcome back, {user?.fullName || 'User'}. Here's an overview of your BCIS operations.
      </p>
      <KPICards />
    </div>
  );
}
