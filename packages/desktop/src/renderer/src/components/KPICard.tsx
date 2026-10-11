import React from 'react';

export function KPICard({
  id,
  title,
  value,
  change,
  changeType,
}: {
  id: string;
  title: string;
  value: string;
  change: string;
  changeType: 'positive' | 'negative' | 'neutral';
}) {
  const changeClass = changeType === 'positive' ? 'text-success' : changeType === 'negative' ? 'text-danger' : 'text-text-secondary';

  return (
    <div className="kpi-card p-5 rounded-lg border border-border">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium text-text-secondary">{title}</h3>
          <p className="kpi-value" id={id}>{value}</p>
        </div>
        <div className="mt-2">
          <span className={`text-xs font-medium ${changeClass}`}>
            {change}
          </span>
        </div>
      </div>
    </div>
  );
}
