/**
 * Collections Page - Collection Batches, Route Sheets, Remittance
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, Search, Filter, Download, Eye, Truck, 
  CheckCircle, AlertCircle, Clock, DollarSign, 
  Loader2, FileText, ChevronDown, ChevronUp,
  MapPin, User, Package
} from 'lucide-react';
import { formatCurrency } from '@bcis/shared';
import { api } from '../lib/api';

interface CollectionBatch {
  id: string;
  batchNumber: string;
  collectorId: string;
  collector?: { id: string; fullName: string };
  areaId: string;
  area?: { id: string; name: string };
  status: 'open' | 'in_progress' | 'submitted' | 'remitted' | 'reconciled' | 'closed';
  collectionDate: string;
  expectedCash: number;
  expectedNonCash: number;
  actualCash: number;
  actualNonCash: number;
  shortage: number;
  overage: number;
  accounts?: CollectionBatchAccount[];
}

interface CollectionBatchAccount {
  id: string;
  serviceAccountId: string;
  serviceAccount?: {
    id: string;
    accountNumber: string;
    subscriber?: { firstName: string; lastName: string; accountNumber: string };
    plan?: { name: string; type: string };
  };
  currentBill: number;
  arrears: number;
  totalDue: number;
  collectedAmount: number;
  collectedMethod?: string;
  collectedAt?: string;
  receiptNumber?: string;
  status: 'uncollected' | 'collected' | 'partial';
}

const STATUS_BADGES: Record<string, { label: string; class: string }> = {
  open: { label: 'Open', class: 'bg-gray-100 text-gray-800' },
  in_progress: { label: 'In Progress', class: 'bg-blue-100 text-blue-800' },
  submitted: { label: 'Submitted', class: 'bg-yellow-100 text-yellow-800' },
  remitted: { label: 'Remitted', class: 'bg-orange-100 text-orange-800' },
  reconciled: { label: 'Reconciled', class: 'bg-purple-100 text-purple-800' },
  closed: { label: 'Closed', class: 'bg-green-100 text-green-800' },
};

export function CollectionsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'batches' | 'create' | 'remittance'>('batches');
  const [selectedBatch, setSelectedBatch] = useState<CollectionBatch | null>(null);
  const [showRouteSheet, setShowRouteSheet] = useState(false);

  const { data: batchesData } = useQuery({
    queryKey: ['collection-batches'],
    queryFn: () => api.listCollectionBatches({ page: 1, limit: 50 }),
  });

  const { data: collectors } = useQuery({
    queryKey: ['collectors'],
    queryFn: () => api.listUsers({ role: 'collector' }),
  });

  const { data: areas } = useQuery({
    queryKey: ['collection-areas'],
    queryFn: () => api.listCollectionAreas({ page: 1, limit: 100 }),
  });

  const createBatchMutation = useMutation({
    mutationFn: (data: any) => api.createCollectionBatch(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-batches'] });
      setActiveTab('batches');
    },
  });

  const recordCollectionMutation = useMutation({
    mutationFn: ({ batchId, accountId, data }: { batchId: string; accountId: string; data: any }) =>
      api.recordCollection(batchId, accountId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-batch', selectedBatch?.id] });
      queryClient.invalidateQueries({ queryKey: ['collection-batches'] });
    },
  });

  const submitRemittanceMutation = useMutation({
    mutationFn: (data: any) => api.submitRemittance(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-batches'] });
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: (data: any) => api.reconcileBatch(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-batches'] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: (batchId: string) => api.closeBatch(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-batches'] });
    },
  });

  const getStatusBadge = (status: string) => {
    const badge = STATUS_BADGES[status] || { label: status, class: 'bg-gray-100 text-gray-800' };
    return (
      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${badge.class}`}>
        {badge.label}
      </span>
    );
  };

  const getAccountStatusBadge = (status: string) => {
    const badges = {
      uncollected: { label: 'Uncollected', class: 'bg-gray-100 text-gray-800' },
      collected: { label: 'Collected', class: 'bg-green-100 text-green-800' },
      partial: { label: 'Partial', class: 'bg-yellow-100 text-yellow-800' },
    };
    const badge = badges[status as keyof typeof badges] || { label: status, class: 'bg-gray-100 text-gray-800' };
    return (
      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${badge.class}`}>
        {badge.label}
      </span>
    );
  };

  const handleCreateBatch = async (batchData: any) => {
    await createBatchMutation.mutateAsync(batchData);
  };

  const handleRecordCollection = async (account: CollectionBatchAccount, collectedAmount: number, method: string, receiptNumber: string) => {
    if (!selectedBatch) return;
    await recordCollectionMutation.mutateAsync({
      batchId: selectedBatch.id,
      accountId: account.id,
      data: {
        collectedAmount,
        collectedMethod: method,
        collectedAt: new Date().toISOString(),
        receiptNumber,
      },
    });
  };

  const handleSubmitRemittance = async (batchId: string, cashAmount: number, nonCashAmount: number) => {
    await submitRemittanceMutation.mutateAsync({
      batchId,
      cashAmount,
      nonCashAmount,
      remittanceDate: new Date().toISOString(),
    });
  };

  const handleReconcile = async (batchId: string, actualCash: number, actualNonCash: number) => {
    await reconcileMutation.mutateAsync({
      batchId,
      actualCash,
      actualNonCash,
    });
  };

  const handleClose = async (batchId: string) => {
    if (confirm('Close this batch? This action cannot be undone.')) {
      await closeMutation.mutateAsync(batchId);
    }
  };

  if (activeTab === 'create') {
    return (
      <section className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="page-title">Create Collection Batch</h2>
          <button
            onClick={() => setActiveTab('batches')}
            className="text-text-muted hover:text-text-primary"
          >
            ← Back to Batches
          </button>
        </div>

        <CreateBatchForm
          collectors={collectors?.items || []}
          areas={areas?.items || []}
          onSubmit={handleCreateBatch}
          isSubmitting={createBatchMutation.isPending}
        />
      </section>
    );
  }

  if (activeTab === 'remittance' && selectedBatch) {
    return (
      <section className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="page-title">Remittance - {selectedBatch.batchNumber}</h2>
          <button
            onClick={() => { setSelectedBatch(null); setActiveTab('batches'); }}
            className="text-text-muted hover:text-text-primary"
          >
            ← Back to Batches
          </button>
        </div>

        <RemittanceForm
          batch={selectedBatch}
          onSubmit={handleSubmitRemittance}
          onReconcile={handleReconcile}
          onClose={handleClose}
          isSubmitting={submitRemittanceMutation.isPending || reconcileMutation.isPending || closeMutation.isPending}
        />
      </section>
    );
  }

  return (
    <section className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="page-title">Collections</h2>
        <button
          onClick={() => setActiveTab('create')}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Batch
        </button>
      </div>

      {/* Batch List */}
      <div className="bg-surface rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search batches..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <span>Filters</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Batch #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Collector</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Area</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Expected Cash</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Actual Cash</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Shortage</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {batchesData?.items?.map((batch: CollectionBatch) => (
                <tr key={batch.id} className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => { setSelectedBatch(batch); setActiveTab('remittance'); }}
                >
                  <td className="px-4 py-3 font-mono text-sm font-medium">{batch.batchNumber}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-primary" />
                      <span>{batch.collector?.fullName || 'Unassigned'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" />
                      <span>{batch.area?.name || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">{new Date(batch.collectionDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{getStatusBadge(batch.status)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(batch.expectedCash)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(batch.actualCash)}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-600">{formatCurrency(batch.shortage)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button className="p-1 hover:bg-gray-100 rounded" title="View Route Sheet">
                        <FileText className="w-4 h-4" />
                      </button>
                      <button className="p-1 hover:bg-gray-100 rounded" title="View Details">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {batchesData?.items?.length === 0 && (
          <div className="p-12 text-center">
            <Package className="w-12 h-12 mx-auto text-text-muted mb-4" />
            <p className="text-text-muted">No collection batches found</p>
            <button
              onClick={() => setActiveTab('create')}
              className="mt-4 px-4 py-2 bg-primary text-white rounded-lg"
            >
              Create First Batch
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function CreateBatchForm({ collectors, areas, onSubmit, isSubmitting }: any) {
  const [formData, setFormData] = useState({
    collectorId: '',
    areaId: '',
    collectionDate: new Date().toISOString().split('T')[0],
    serviceAccountIds: [] as string[],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-lg p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">Collector <span className="text-red-500">*</span></label>
          <select
            value={formData.collectorId}
            onChange={(e) => setFormData({ ...formData, collectorId: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            required
          >
            <option value="">Select collector</option>
            {collectors.map((c: any) => (
              <option key={c.id} value={c.id}>{c.fullName}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">Area <span className="text-red-500">*</span></label>
          <select
            value={formData.areaId}
            onChange={(e) => setFormData({ ...formData, areaId: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            required
          >
            <option value="">Select area</option>
            {areas.map((a: any) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">Collection Date <span className="text-red-500">*</span></label>
          <input
            type="date"
            value={formData.collectionDate}
            onChange={(e) => setFormData({ ...formData, collectionDate: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">Service Accounts</label>
          <div className="p-4 border border-gray-300 rounded-lg bg-gray-50">
            <p className="text-sm text-text-muted">
              Service accounts will be auto-assigned based on collector and area assignment.
              <br />Expected: All active accounts in the area assigned to the collector.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-4 pt-4 border-t">
        <button type="button" onClick={() => setFormData({ collectorId: '', areaId: '', collectionDate: new Date().toISOString().split('T')[0], serviceAccountIds: [] })} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          Clear
        </button>
        <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Create Batch
        </button>
      </div>
    </form>
  );
}

function RemittanceForm({ batch, onSubmit, onReconcile, onClose, isSubmitting }: any) {
  const [cashAmount, setCashAmount] = useState('');
  const [nonCashAmount, setNonCashAmount] = useState('');
  const [showReconcile, setShowReconcile] = useState(false);
  const [actualCash, setActualCash] = useState('');
  const [actualNonCash, setActualNonCash] = useState('');

  return (
    <div className="bg-surface rounded-lg p-6 space-y-6">
      {/* Batch Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
        <div>
          <p className="text-xs text-text-muted">Batch Number</p>
          <p className="font-mono font-semibold">{batch.batchNumber}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Collector</p>
          <p className="font-medium">{batch.collector?.fullName}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Area</p>
          <p className="font-medium">{batch.area?.name}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Date</p>
          <p className="font-medium">{new Date(batch.collectionDate).toLocaleDateString()}</p>
        </div>
      </div>

      {/* Expected vs Actual */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-blue-50 rounded-lg">
          <p className="text-xs text-blue-800 font-medium">Expected Cash</p>
          <p className="text-2xl font-bold text-blue-900">{formatCurrency(batch.expectedCash)}</p>
        </div>
        <div className="p-4 bg-green-50 rounded-lg">
          <p className="text-xs text-green-800 font-medium">Expected Non-Cash</p>
          <p className="text-2xl font-bold text-green-900">{formatCurrency(batch.expectedNonCash)}</p>
        </div>
        <div className="p-4 bg-yellow-50 rounded-lg">
          <p className="text-xs text-yellow-800 font-medium">Current Status</p>
          <p className="text-xl font-bold text-yellow-900">{batch.status}</p>
        </div>
      </div>

      {!showReconcile && batch.status !== 'closed' ? (
        <div className="space-y-4">
          <h3 className="font-semibold text-text-primary">Submit Remittance</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Cash Amount <span className="text-red-500">*</span></label>
              <input
                type="number"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Non-Cash Amount</label>
              <input
                type="number"
                value={nonCashAmount}
                onChange={(e) => setNonCashAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <button
            onClick={() => onSubmit(batch.id, parseFloat(cashAmount) * 100, parseFloat(nonCashAmount) * 100 || 0)}
            disabled={!cashAmount || isSubmitting}
            className="w-full py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <DollarSign className="w-5 h-5" />}
            Submit Remittance
          </button>
        </div>
      ) : showReconcile ? (
        <div className="space-y-4 border-t pt-6">
          <h3 className="font-semibold text-text-primary">Reconcile Batch</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Actual Cash Count</label>
              <input
                type="number"
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                placeholder="0.00"
                step="0.01"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Actual Non-Cash</label>
              <input
                type="number"
                value={actualNonCash}
                onChange={(e) => setActualNonCash(e.target.value)}
                placeholder="0.00"
                step="0.01"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => onReconcile(batch.id, parseFloat(actualCash) * 100 || 0, parseFloat(actualNonCash) * 100 || 0)}
              className="flex-1 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700"
            >
              Reconcile
            </button>
            <button
              onClick={() => { setShowReconcile(false); setActualCash(''); setActualNonCash(''); }}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-4 pt-4 border-t">
          {batch.status !== 'reconciled' && batch.status !== 'closed' && (
            <button
              onClick={() => setShowReconcile(true)}
              className="flex-1 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700"
            >
              Reconcile
            </button>
          )}
          {batch.status === 'reconciled' && batch.shortage === 0 && (
            <button
              onClick={() => onClose(batch.id)}
              className="flex-1 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
            >
              Close Batch
            </button>
          )}
          {batch.shortage > 0 && batch.status === 'reconciled' && (
            <div className="flex-1 p-4 bg-red-50 rounded-lg text-red-800 text-sm">
              Cannot close: Batch has shortage of {formatCurrency(batch.shortage)}. Requires authorization override.
            </div>
          )}
          {batch.status === 'closed' && (
            <div className="flex-1 p-4 bg-green-50 rounded-lg text-green-800 text-sm">
              Batch is closed
            </div>
          )}
        </div>
      )}
    </div>
  );
}