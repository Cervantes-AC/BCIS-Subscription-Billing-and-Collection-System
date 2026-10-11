import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@bcis/shared';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/useAuthStore';
import { KPICard } from './KPICard';

interface DashboardStats {
  activeSubscribers: number;
  totalReceivable: number;
  monthlyCollections: number;
  overdueAccounts: number;
}

export function KPICards() {
  const hasReportPermission = useAuthStore((state) => state.hasPermission('report.view'));
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<DashboardStats>('/reports/dashboard'),
    enabled: hasReportPermission,
  });

  if (!hasReportPermission) return null;
  if (isLoading) return <p className="text-sm text-text-secondary">Loading dashboard totals…</p>;
  if (error || !data?.data) {
    return <p role="alert" className="text-sm text-red-700">Could not load dashboard totals. Check the API connection and your report access.</p>;
  }

  const kpis = [
    { id: 'total-subscribers', title: 'Active Subscribers', value: String(data.data.activeSubscribers), change: 'Current total', changeType: 'neutral' as const },
    { id: 'total-receivable', title: 'Total Receivable', value: formatCurrency(data.data.totalReceivable), change: 'Outstanding balance', changeType: 'neutral' as const },
    { id: 'monthly-collection', title: 'Monthly Collection', value: formatCurrency(data.data.monthlyCollections), change: 'Collected this month', changeType: 'neutral' as const },
    { id: 'overdue-accounts', title: 'Overdue Accounts', value: String(data.data.overdueAccounts), change: 'With past due invoices', changeType: 'negative' as const },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => <KPICard key={kpi.id} {...kpi} />)}
    </div>
  );
}
