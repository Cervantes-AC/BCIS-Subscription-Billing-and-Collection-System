import React from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { useAppStore } from '../stores/useStore';
import { KPICard } from './KPICard';

export function KPICards() {
  const { user } = useAuthStore();
  const sidebarCollapsed = useAppStore.getState().sidebarCollapsed;

  // Mock KPI data - will be replaced with API calls
  const kpis: Array<{
    id: string;
    title: string;
    value: string;
    change: string;
    changeType: 'positive' | 'negative';
    icon: string;
  }> = [
    {
      id: 'total-subscribers',
      title: 'Total Subscribers',
      value: '50',
      change: '+12 this month',
      changeType: 'positive',
      icon: 'Users',
    },
    {
      id: 'total-receivable',
      title: 'Total Receivable',
      value: '₱125,400.00',
      change: '+₱8,200.00',
      changeType: 'positive',
      icon: 'TrendingUp',
    },
    {
      id: 'monthly-collection',
      title: 'Monthly Collection',
      value: '₱89,200.00',
      change: '+₱5,600.00',
      changeType: 'positive',
      icon: 'Cash',
    },
    {
      id: 'overdue-accounts',
      title: 'Overdue Accounts',
      value: '12',
      change: '+3 this month',
      changeType: 'negative',
      icon: 'AlertCircle',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <KPICard key={kpi.id} {...kpi} />
      ))}
    </div>
  );
}