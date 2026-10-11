/**
 * Allocation Preview Component
 */
import React from 'react';
import { formatCurrency } from '@bcis/shared';

interface AllocationItem {
  invoiceId: string;
  invoiceNumber: string;
  serviceType: string;
  planName: string;
  period: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  allocationAmount: number;
  remainingAfterAllocation: number;
}

interface AllocationPreviewProps {
  items: AllocationItem[];
}

export function AllocationPreview({ items }: AllocationPreviewProps) {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted">
        No allocation needed
      </div>
    );
  }

  const billableItems = items.filter(i => i.invoiceId && i.allocationAmount > 0);
  const advanceItem = items.find(i => i.invoiceId === '');

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs font-medium text-text-muted uppercase">
            <th className="px-3 py-2">Invoice</th>
            <th className="px-3 py-2">Plan</th>
            <th className="px-3 py-2">Period</th>
            <th className="px-3 py-2 text-right">Balance</th>
            <th className="px-3 py-2 text-right">Allocation</th>
            <th className="px-3 py-2 text-right">Remaining</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {billableItems.map((item) => (
            <tr key={item.invoiceId} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-mono text-text-primary">{item.invoiceNumber}</td>
              <td className="px-3 py-2 text-text-secondary">{item.planName}</td>
              <td className="px-3 py-2 text-text-muted">{item.period}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCurrency(item.balance)}</td>
              <td className="px-3 py-2 text-right font-mono font-medium text-primary">{formatCurrency(item.allocationAmount)}</td>
              <td className="px-3 py-2 text-right font-mono text-text-muted">{formatCurrency(item.remainingAfterAllocation)}</td>
            </tr>
          ))}
          {advanceItem && (
            <tr className="bg-blue-50">
              <td className="px-3 py-2 font-medium text-blue-800" colSpan={4}>Advance Payment / Credit</td>
              <td className="px-3 py-2 text-right font-mono font-medium text-blue-800">{formatCurrency(advanceItem.allocationAmount)}</td>
              <td className="px-3 py-2 text-right text-text-muted">-</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}