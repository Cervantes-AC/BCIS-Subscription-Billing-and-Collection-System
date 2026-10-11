/**
 * Billing Page - Billing Cycles, Invoice Management, Generation
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, Search, Filter, Download, Eye, 
  Loader2, Calendar, DollarSign, AlertCircle,
  CheckCircle, XCircle, FileText, ChevronDown,
  RotateCcw, Zap
} from 'lucide-react';
import { formatCurrency } from '@bcis/shared';
import { api } from '../lib/api';

interface BillingCycle {
  id: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  status: 'open' | 'generating' | 'finalized' | 'closed';
  generatedAt?: string;
  generatedBy?: string;
  finalizedAt?: string;
  finalizedBy?: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  serviceAccountId: string;
  serviceAccount?: {
    id: string;
    accountNumber: string;
    subscriber?: { accountNumber: string; firstName: string; lastName: string };
    plan?: { name: string; type: string };
  };
  billingCycleId: string;
  billingCycle?: { name: string };
  status: 'draft' | 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'void' | 'credited';
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  subscriptionCharge: number;
  installationFee: number;
  reconnectionFee: number;
  discount: number;
  penalty: number;
  adjustments: number;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  generatedAt: string;
}

const CYCLE_STATUS_BADGES: Record<string, { label: string; class: string }> = {
  open: { label: 'Open', class: 'bg-gray-100 text-gray-800' },
  generating: { label: 'Generating', class: 'bg-blue-100 text-blue-800' },
  finalized: { label: 'Finalized', class: 'bg-purple-100 text-purple-800' },
  closed: { label: 'Closed', class: 'bg-green-100 text-green-800' },
};

const INVOICE_STATUS_BADGES: Record<string, { label: string; class: string }> = {
  draft: { label: 'Draft', class: 'bg-gray-100 text-gray-800' },
  unpaid: { label: 'Unpaid', class: 'bg-blue-100 text-blue-800' },
  partially_paid: { label: 'Partial', class: 'bg-yellow-100 text-yellow-800' },
  paid: { label: 'Paid', class: 'bg-green-100 text-green-800' },
  overdue: { label: 'Overdue', class: 'bg-red-100 text-red-800' },
  void: { label: 'Void', class: 'bg-gray-100 text-gray-800' },
  credited: { label: 'Credited', class: 'bg-purple-100 text-purple-800' },
};

export function BillingPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'cycles' | 'invoices' | 'generate'>('cycles');
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: cyclesData } = useQuery({
    queryKey: ['billing-cycles'],
    queryFn: () => api.listBillingCycles({ page: 1, limit: 50 }),
  });

  const { data: invoicesData } = useQuery({
    queryKey: ['invoices', 'list', searchQuery],
    queryFn: () => api.listInvoices({ query: searchQuery, page: 1, limit: 100 }),
  });

  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.listPlans({ isActive: true, limit: 200 }),
  });

  const generateMutation = useMutation({
    mutationFn: (data: any) => api.generateBilling(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-cycles'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setActiveTab('invoices');
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: (cycleId: string) => api.finalizeBillingCycle(cycleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-cycles'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const createCycleMutation = useMutation({
    mutationFn: (data: any) => api.createBillingCycle(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-cycles'] });
    },
  });

  const voidInvoiceMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.voidInvoice(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setSelectedInvoice(null);
    },
  });

  const getCycleStatusBadge = (status: string) => {
    const badge = CYCLE_STATUS_BADGES[status] || { label: status, class: 'bg-gray-100 text-gray-800' };
    return <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${badge.class}`}>{badge.label}</span>;
  };

  const getInvoiceStatusBadge = (status: string) => {
    const badge = INVOICE_STATUS_BADGES[status] || { label: status, class: 'bg-gray-100 text-gray-800' };
    return <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${badge.class}`}>{badge.label}</span>;
  };

  const handleGenerateBilling = async (cycleId: string, options: any) => {
    await generateMutation.mutateAsync({ billingCycleId: cycleId, ...options });
  };

  const handleFinalize = async (cycleId: string) => {
    if (confirm('Finalize this billing cycle? This will make all invoices immutable.')) {
      await finalizeMutation.mutateAsync(cycleId);
    }
  };

  const handleVoidInvoice = async (invoiceId: string) => {
    const reason = prompt('Reason for voiding:');
    if (reason) {
      await voidInvoiceMutation.mutateAsync({ id: invoiceId, reason });
    }
  };

  if (activeTab === 'generate') {
    return (
      <section className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="page-title">Generate Monthly Billing</h2>
          <button onClick={() => setActiveTab('cycles')} className="text-text-muted hover:text-text-primary">← Back</button>
        </div>

        <GenerateBillingForm
          cycles={cyclesData?.items || []}
          plans={plans?.items || []}
          onGenerate={handleGenerateBilling}
          isGenerating={generateMutation.isPending}
          setActiveTab={setActiveTab}
        />
      </section>
    );
  }

  if (activeTab === 'invoices') {
    return (
      <section className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="page-title">Invoices</h2>
          <div className="flex gap-2">
            <button onClick={() => setActiveTab('cycles')} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cycles</button>
            <button onClick={() => setActiveTab('generate')} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2">
              <Zap className="w-4 h-4" /> Generate
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="bg-surface rounded-lg p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search invoices..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Invoice List */}
        <div className="bg-surface rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Invoice #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Subscriber</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Service</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Cycle</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Period</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Due Date</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Paid</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Balance</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invoicesData?.items?.map((inv: Invoice) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-sm">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{inv.serviceAccount?.subscriber?.firstName} {inv.serviceAccount?.subscriber?.lastName}</p>
                      <p className="text-xs text-text-muted">{inv.serviceAccount?.subscriber?.accountNumber}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{inv.serviceAccount?.plan?.name}</p>
                      <p className="text-xs text-text-muted">{inv.serviceAccount?.accountNumber}</p>
                    </td>
                    <td className="px-4 py-3">{inv.billingCycle?.name}</td>
                    <td className="px-4 py-3 text-sm">{new Date(inv.periodStart).toLocaleDateString()} - {new Date(inv.periodEnd).toLocaleDateString()}</td>
                    <td className="px-4 py-3">{new Date(inv.dueDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(inv.totalAmount)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(inv.paidAmount)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-red-600">{formatCurrency(inv.balance)}</td>
                    <td className="px-4 py-3">{getInvoiceStatusBadge(inv.status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button className="p-1 hover:bg-gray-100 rounded" title="View Details">
                          <Eye className="w-4 h-4" />
                        </button>
                        {inv.status === 'unpaid' || inv.status === 'partially_paid' ? (
                          <button
                            onClick={() => handleVoidInvoice(inv.id)}
                            className="p-1 hover:bg-red-50 text-red-600 rounded"
                            title="Void"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {invoicesData?.items?.length === 0 && (
            <div className="p-12 text-center">
              <FileText className="w-12 h-12 mx-auto text-text-muted mb-4" />
              <p className="text-text-muted">No invoices found</p>
              <button onClick={() => setActiveTab('generate')} className="mt-4 px-4 py-2 bg-primary text-white rounded-lg">Generate Billing</button>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="page-title">Billing Cycles</h2>
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('invoices')} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Invoices</button>
          <button onClick={() => setActiveTab('generate')} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Generate
          </button>
          <button onClick={() => setShowCreateCycle(true)} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Cycle
          </button>
        </div>
      </div>

      {/* Cycle List */}
      <div className="bg-surface rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Cycle Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Period</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Due Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Generated</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Finalized</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {cyclesData?.items?.map((cycle: BillingCycle) => (
                <tr key={cycle.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{cycle.name}</td>
                  <td className="px-4 py-3">{new Date(cycle.periodStart).toLocaleDateString()} - {new Date(cycle.periodEnd).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{new Date(cycle.dueDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{getCycleStatusBadge(cycle.status)}</td>
                  <td className="px-4 py-3">{cycle.generatedAt ? new Date(cycle.generatedAt).toLocaleString() : '-'}</td>
                  <td className="px-4 py-3">{cycle.finalizedAt ? new Date(cycle.finalizedAt).toLocaleString() : '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setSelectedCycle(cycle); setActiveTab('generate'); }}
                        className="px-3 py-1 text-xs bg-primary text-white rounded hover:bg-primary/90"
                      >
                        Generate
                      </button>
                      {cycle.status === 'generating' && (
                        <button
                          onClick={() => handleFinalize(cycle.id)}
                          disabled={finalizeMutation.isPending}
                          className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                        >
                          Finalize
                        </button>
                      )}
                      {cycle.status === 'open' && (
                        <button
                          onClick={() => { setSelectedCycle(cycle); setActiveTab('generate'); }}
                          className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                        >
                          View
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {cyclesData?.items?.length === 0 && (
          <div className="p-12 text-center">
            <Calendar className="w-12 h-12 mx-auto text-text-muted mb-4" />
            <p className="text-text-muted">No billing cycles found</p>
            <button onClick={() => setShowCreateCycle(true)} className="mt-4 px-4 py-2 bg-primary text-white rounded-lg">Create First Cycle</button>
          </div>
        )}
      </div>

      {/* Create Cycle Modal */}
      {showCreateCycle && (
        <CreateCycleModal
          onClose={() => setShowCreateCycle(false)}
          onSubmit={async (data: any) => { await createCycleMutation.mutateAsync(data); setShowCreateCycle(false); }}
          isSubmitting={createCycleMutation.isPending}
        />
      )}
    </section>
  );
}

const [showCreateCycle, setShowCreateCycle] = useState(false);

function GenerateBillingForm({ cycles, plans, onGenerate, isGenerating, setActiveTab }: any) {
  const [formData, setFormData] = useState({
    billingCycleId: '',
    serviceAccountIds: [] as string[],
    collectorId: '',
    areaId: '',
    dryRun: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onGenerate(formData.billingCycleId, {
      serviceAccountIds: formData.serviceAccountIds.length > 0 ? formData.serviceAccountIds : undefined,
      collectorId: formData.collectorId || undefined,
      areaId: formData.areaId || undefined,
      dryRun: formData.dryRun,
    });
  };

  const openCycles = cycles.filter((c: any) => c.status === 'open');

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-lg p-6 space-y-6">
      <div>
        <h3 className="font-semibold mb-4">Select Billing Cycle</h3>
        <select
          value={formData.billingCycleId}
          onChange={(e) => setFormData({ ...formData, billingCycleId: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          required
        >
          <option value="">Select an open billing cycle</option>
          {openCycles.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name} ({new Date(c.periodStart).toLocaleDateString()} - {new Date(c.periodEnd).toLocaleDateString()})
            </option>
          ))}
        </select>
        {openCycles.length === 0 && (
          <p className="text-red-500 text-sm mt-1">No open billing cycles available. Create one first.</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Filter by Collector (Optional)</label>
          <select
            value={formData.collectorId}
            onChange={(e) => setFormData({ ...formData, collectorId: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All Collectors</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Filter by Area (Optional)</label>
          <select
            value={formData.areaId}
            onChange={(e) => setFormData({ ...formData, areaId: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All Areas</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="dryRun"
          checked={formData.dryRun}
          onChange={(e) => setFormData({ ...formData, dryRun: e.target.checked })}
          className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
        />
        <label htmlFor="dryRun" className="text-sm text-text-secondary">
          Dry Run (Preview only, don't create invoices)
        </label>
      </div>

      <div className="flex justify-end gap-4 pt-4 border-t">
        <button type="button" onClick={() => setActiveTab('cycles')} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" disabled={!formData.billingCycleId || isGenerating || openCycles.length === 0} className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          Generate Billing
        </button>
      </div>
    </form>
  );
}

function CreateCycleModal({ onClose, onSubmit, isSubmitting }: any) {
  const [formData, setFormData] = useState({
    name: '',
    periodStart: '',
    periodEnd: '',
    dueDate: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-semibold mb-4">Create Billing Cycle</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Cycle Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., January 2026 Billing"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Period Start <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={formData.periodStart}
                onChange={(e) => setFormData({ ...formData, periodStart: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Period End <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={formData.periodEnd}
                onChange={(e) => setFormData({ ...formData, periodEnd: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Due Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
