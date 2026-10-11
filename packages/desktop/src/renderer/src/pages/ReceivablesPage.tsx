/**
 * Receivables Page - AR Aging, Overdue Accounts, Suspension Candidates
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Search, Filter, Download, AlertTriangle, 
  UserX, CreditCard, Calendar, DollarSign,
  Loader2, Eye, ChevronDown, ChevronUp,
  TrendingDown, AlertCircle, UserCheck
} from 'lucide-react';
import { formatCurrency } from '@bcis/shared';
import { api } from '../lib/api';

interface OverdueAccount {
  id: string;
  subscriber: {
    id: string;
    accountNumber: string;
    firstName: string;
    lastName: string;
    contactNumber: string;
    status: string;
  };
  serviceAccount: {
    id: string;
    accountNumber: string;
    plan: { id: string; code: string; name: string; type: string };
    status: string;
    collectorId?: string;
  };
  collector?: { id: string; fullName: string };
  area?: { id: string; name: string };
  monthsUnpaid: number;
  oldestUnpaidInvoice: {
    id: string;
    invoiceNumber: string;
    dueDate: string;
    balance: number;
  } | null;
  lastPayment: {
    id: string;
    receiptNumber: string;
    paymentDate: string;
    amount: number;
  } | null;
  totalArrears: number;
  currentBill: number;
  agingBuckets: Array<{
    bucket: string;
    label: string;
    count: number;
    amount: number;
  }>;
}

export function ReceivablesPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'aging' | 'overdue' | 'suspension'>('aging');
  const [filters, setFilters] = useState({
    collectorId: '',
    areaId: '',
    planId: '',
    serviceType: '',
    minMonthsUnpaid: 0,
  });
  const [selectedAccount, setSelectedAccount] = useState<OverdueAccount | null>(null);
  const [showSuspendModal, setShowSuspendModal] = useState(false);

  const { data: agingData } = useQuery({
    queryKey: ['receivables', 'aging', filters],
    queryFn: () => api.getAgingReport(filters),
  });

  const { data: overdueData } = useQuery({
    queryKey: ['receivables', 'overdue', filters],
    queryFn: () => api.getOverdueAccounts({ ...filters, page: 1, limit: 100 }),
  });

  const { data: suspensionData } = useQuery({
    queryKey: ['receivables', 'suspension'],
    queryFn: () => api.getSuspensionCandidates({ page: 1, limit: 100 }),
  });

  const suspendMutation = useMutation({
    mutationFn: (data: any) => api.suspendServiceAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      setShowSuspendModal(false);
    },
  });

  const reconnectMutation = useMutation({
    mutationFn: (data: any) => api.reconnectServiceAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
    },
  });

  const getAgingBucketTotal = (bucket: string) => {
    const details = (agingData as any)?.details as OverdueAccount[] | undefined;
    if (!details) return 0;
    return details.reduce((sum: number, acc: OverdueAccount) => {
      const b = acc.agingBuckets.find((x: any) => x.bucket === bucket);
      return sum + (b?.amount || 0);
    }, 0);
  };

  return (
    <section className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="page-title">Receivables</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('aging')}
            className={`px-4 py-2 rounded-lg transition-colors ${activeTab === 'aging' ? 'bg-primary text-white' : 'bg-surface hover:bg-gray-100'}`}
          >
            <TrendingDown className="w-4 h-4 mr-2 inline" />
            AR Aging
          </button>
          <button
            onClick={() => setActiveTab('overdue')}
            className={`px-4 py-2 rounded-lg transition-colors ${activeTab === 'overdue' ? 'bg-primary text-white' : 'bg-surface hover:bg-gray-100'}`}
          >
            <AlertTriangle className="w-4 h-4 mr-2 inline" />
            Overdue Accounts
          </button>
          <button
            onClick={() => setActiveTab('suspension')}
            className={`px-4 py-2 rounded-lg transition-colors ${activeTab === 'suspension' ? 'bg-primary text-white' : 'bg-surface hover:bg-gray-100'}`}
          >
            <UserX className="w-4 h-4 mr-2 inline" />
            Suspension Candidates
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search by name, account #, phone..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <select
            value={filters.collectorId}
            onChange={(e) => setFilters({ ...filters, collectorId: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary min-w-[180px]"
          >
            <option value="">All Collectors</option>
            {/* Would populate from collectors list */}
          </select>
          <select
            value={filters.areaId}
            onChange={(e) => setFilters({ ...filters, areaId: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary min-w-[180px]"
          >
            <option value="">All Areas</option>
          </select>
          <input
            type="number"
            value={filters.minMonthsUnpaid}
            onChange={(e) => setFilters({ ...filters, minMonthsUnpaid: parseInt(e.target.value) || 0 })}
            placeholder="Min months unpaid"
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary w-40"
            min="0"
          />
          <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
            <Filter className="w-4 h-4" />
            <span>More Filters</span>
          </button>
          <button className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {activeTab === 'aging' && (
        <ARAgingView data={agingData} />
      )}

      {activeTab === 'overdue' && (
        <OverdueAccountsView 
          data={overdueData} 
          onSelect={setSelectedAccount}
          onSuspend={(account: OverdueAccount) => { setSelectedAccount(account); setShowSuspendModal(true); }}
        />
      )}

      {activeTab === 'suspension' && (
        <SuspensionCandidatesView 
          data={suspensionData}
          onSuspend={(account: OverdueAccount) => { setSelectedAccount(account); setShowSuspendModal(true); }}
        />
      )}

      {showSuspendModal && selectedAccount && (
        <SuspendModal
          account={selectedAccount}
          onClose={() => { setShowSuspendModal(false); setSelectedAccount(null); }}
          onSuspend={suspendMutation.mutateAsync}
          isLoading={suspendMutation.isPending}
        />
      )}
    </section>
  );
}

function formatAgingLabel(bucket: string) {
  const labels: Record<string, string> = { current: 'Current', '1-30': '1-30 Days', '31-60': '31-60 Days', '61-90': '61-90 Days', '90+': '90+ Days' };
  return labels[bucket] || bucket;
}

function ARAgingView({ data }: any) {
  if (!data) return <div className="text-center p-8">Loading...</div>;

  const { summary, details } = data;
  const buckets = ['current', '1-30', '31-60', '61-90', '90+'];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-surface rounded-lg p-4">
          <p className="text-xs text-text-muted">Total Receivable</p>
          <p className="text-2xl font-bold text-text-primary">{formatCurrency(summary.totalReceivable)}</p>
        </div>
        <div className="bg-surface rounded-lg p-4">
          <p className="text-xs text-text-muted">Current</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.currentReceivable)}</p>
        </div>
        <div className="bg-surface rounded-lg p-4">
          <p className="text-xs text-text-muted">Overdue</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(summary.overdueReceivable)}</p>
        </div>
        <div className="bg-surface rounded-lg p-4">
          <p className="text-xs text-text-muted">Overdue Count</p>
          <p className="text-2xl font-bold text-text-primary">{summary.overdueCount}</p>
        </div>
        <div className="bg-surface rounded-lg p-4">
          <p className="text-xs text-text-muted">Suspension Candidates</p>
          <p className="text-2xl font-bold text-orange-600">{summary.suspensionCandidates}</p>
        </div>
      </div>

      {/* Aging Buckets Summary */}
      <div className="bg-surface rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-200 font-semibold">Aging Summary</div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Bucket</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Count</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Amount</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">% of Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {buckets.map((bucket) => {
                const bucketData = summary.agingBuckets.find((b: any) => b.bucket === bucket);
                const pct = summary.totalReceivable > 0 
                  ? ((bucketData?.amount || 0) / summary.totalReceivable * 100).toFixed(1)
                  : '0.0';
                return (
                  <tr key={bucket} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{formatAgingLabel(bucket)}</td>
                    <td className="px-4 py-3 text-right">{bucketData?.count || 0}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(bucketData?.amount || 0)}</td>
                    <td className="px-4 py-3 text-right">{pct}%</td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50 font-bold">
                <td className="px-4 py-3">TOTAL</td>
                <td className="px-4 py-3 text-right">
                  {summary.agingBuckets.reduce((sum: number, b: any) => sum + b.count, 0)}
                </td>
                <td className="px-4 py-3 text-right font-mono">{formatCurrency(summary.totalReceivable)}</td>
                <td className="px-4 py-3 text-right">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Accounts */}
      <div className="bg-surface rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-200 font-semibold">Account Details</div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Account #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Subscriber</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Service</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Plan</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Current</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">1-30</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">31-60</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">61-90</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">90+</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Months Unpaid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {details?.map((acc: OverdueAccount) => (
                <tr key={acc.subscriber.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-sm">{acc.subscriber.accountNumber}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{acc.subscriber.firstName} {acc.subscriber.lastName}</p>
                    <p className="text-xs text-text-muted">{acc.subscriber.contactNumber}</p>
                  </td>
                  <td className="px-4 py-3 text-sm">{acc.serviceAccount.accountNumber}</td>
                  <td className="px-4 py-3 text-sm">{acc.serviceAccount.plan.name}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(acc.agingBuckets.find(b => b.bucket === 'current')?.amount || 0)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(acc.agingBuckets.find(b => b.bucket === '1-30')?.amount || 0)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(acc.agingBuckets.find(b => b.bucket === '31-60')?.amount || 0)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(acc.agingBuckets.find(b => b.bucket === '61-90')?.amount || 0)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(acc.agingBuckets.find(b => b.bucket === '90+')?.amount || 0)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold">{formatCurrency(acc.totalArrears)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${acc.monthsUnpaid >= 3 ? 'bg-red-100 text-red-800' : acc.monthsUnpaid >= 2 ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {acc.monthsUnpaid} months
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OverdueAccountsView({ data, onSelect, onSuspend }: any) {
  if (!data) return <div className="text-center p-8">Loading...</div>;

  return (
    <div className="bg-surface rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Account #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Subscriber</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Service</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Plan</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Total Due</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Months Unpaid</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Oldest Invoice</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Last Payment</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data?.items?.map((acc: OverdueAccount) => (
              <tr key={acc.subscriber.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onSelect(acc)}>
                <td className="px-4 py-3 font-mono text-sm">{acc.subscriber.accountNumber}</td>
                <td className="px-4 py-3">
                  <p className="font-medium">{acc.subscriber.firstName} {acc.subscriber.lastName}</p>
                  <p className="text-xs text-text-muted">{acc.subscriber.contactNumber}</p>
                </td>
                <td className="px-4 py-3 text-sm">{acc.serviceAccount.accountNumber}</td>
                <td className="px-4 py-3 text-sm">{acc.serviceAccount.plan.name}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-red-600">{formatCurrency(acc.totalArrears)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${acc.monthsUnpaid >= 3 ? 'bg-red-100 text-red-800' : acc.monthsUnpaid >= 2 ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {acc.monthsUnpaid} months
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {acc.oldestUnpaidInvoice ? (
                    <>
                      <p>{acc.oldestUnpaidInvoice.invoiceNumber}</p>
                      <p className="text-xs text-text-muted">Due: {new Date(acc.oldestUnpaidInvoice.dueDate).toLocaleDateString()}</p>
                    </>
                  ) : 'N/A'}
                </td>
                <td className="px-4 py-3 text-sm">
                  {acc.lastPayment ? (
                    <>
                      <p>{acc.lastPayment.receiptNumber}</p>
                      <p className="text-xs text-text-muted">{new Date(acc.lastPayment.paymentDate).toLocaleDateString()}</p>
                    </>
                  ) : 'No payments'}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); onSuspend(acc); }}
                    className="px-3 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200"
                  >
                    Suspend
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SuspensionCandidatesView({ data, onSuspend }: any) {
  if (!data) return <div className="text-center p-8">Loading...</div>;

  return (
    <div className="bg-surface rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold">Suspension Candidates ({data?.items?.length || 0})</h3>
        <span className="text-sm text-red-600 font-medium">
          {data?.items?.filter((a: any) => a.monthsUnpaid >= 3).length} critical (≥3 months)
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Account #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Subscriber</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Service</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Plan</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Total Due</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Months Unpaid</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Last Payment</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data?.items?.map((acc: OverdueAccount) => (
              <tr key={acc.subscriber.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-sm">{acc.subscriber.accountNumber}</td>
                <td className="px-4 py-3">
                  <p className="font-medium">{acc.subscriber.firstName} {acc.subscriber.lastName}</p>
                  <p className="text-xs text-text-muted">{acc.subscriber.contactNumber}</p>
                </td>
                <td className="px-4 py-3 text-sm">{acc.serviceAccount.accountNumber}</td>
                <td className="px-4 py-3 text-sm">{acc.serviceAccount.plan.name}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-red-600">{formatCurrency(acc.totalArrears)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${acc.monthsUnpaid >= 3 ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}`}>
                    {acc.monthsUnpaid} months
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {acc.lastPayment ? (
                    <>
                      <p>{acc.lastPayment.receiptNumber}</p>
                      <p className="text-xs text-text-muted">{new Date(acc.lastPayment.paymentDate).toLocaleDateString()}</p>
                    </>
                  ) : 'No payments'}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onSuspend(acc)}
                    className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Process Suspension
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SuspendModal({ account, onClose, onSuspend, isLoading }: any) {
  const [formData, setFormData] = useState({
    reason: 'non_payment',
    customReason: '',
    effectiveDate: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onSuspend({
        serviceAccountId: account.serviceAccount.id,
        ...formData,
      });
      onClose();
    } catch (error) {
      alert('Failed to suspend: ' + error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-semibold mb-4">Suspend Service Account</h3>
        <p className="text-sm text-text-muted mb-4">
          {account.subscriber.firstName} {account.subscriber.lastName} - {account.serviceAccount.accountNumber}
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Reason <span className="text-red-500">*</span></label>
            <select
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              required
            >
              <option value="non_payment">Non-payment</option>
              <option value="request">Customer Request</option>
              <option value="violation">Policy Violation</option>
              <option value="technical">Technical Issue</option>
              <option value="other">Other</option>
            </select>
          </div>

          {formData.reason === 'other' && (
            <div>
              <label className="block text-sm font-medium mb-2">Custom Reason <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.customReason}
                onChange={(e) => setFormData({ ...formData, customReason: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">Effective Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={formData.effectiveDate}
              onChange={(e) => setFormData({ ...formData, effectiveDate: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Suspend'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
