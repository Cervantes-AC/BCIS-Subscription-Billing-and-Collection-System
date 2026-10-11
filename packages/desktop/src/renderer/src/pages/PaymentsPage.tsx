/**
 * Payments Page - Receive Payment, GCash Verification
 */
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, CreditCard, DollarSign, AlertCircle, CheckCircle, XCircle, Loader2, Plus, Eye, Download } from 'lucide-react';
import { formatCurrency, formatCentavos } from '@bcis/shared';
import { api } from '../lib/api';
import { SubscriberSearch, PaymentForm, GCashVerificationQueue, AllocationPreview } from '../components';

interface PaymentPageProps {
  onNavigate?: (path: string) => void;
}

export function PaymentsPage({ onNavigate }: PaymentPageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'receive' | 'gcash' | 'history'>('receive');
  const [selectedSubscriber, setSelectedSubscriber] = useState<SubscriberSearchResult | null>(null);
  const [showAllocationPreview, setShowAllocationPreview] = useState(false);
  const [previewAmount, setPreviewAmount] = useState(0);

  // Search subscribers
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['subscribers', 'search'],
    queryFn: () => api.searchSubscribers({ q: '' }),
    enabled: false,
  });

  // Get allocation preview
  const { data: allocationPreview } = useQuery({
    queryKey: ['allocation-preview', selectedSubscriber?.id, previewAmount],
    queryFn: () => api.getAllocationPreview(selectedSubscriber!.id, previewAmount),
    enabled: !!selectedSubscriber && previewAmount > 0,
  });

  // Submit payment mutation
  const submitPaymentMutation = useMutation({
    mutationFn: (data: any) => api.createPayment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      setSelectedSubscriber(null);
      setPreviewAmount(0);
    },
  });

  // GCash verification queue
  const { data: gcashQueue } = useQuery({
    queryKey: ['gcash', 'queue'],
    queryFn: () => api.getGCashQueue({ page: 1, limit: 50 }),
    refetchInterval: 30000,
  });

  // Verify GCash mutation
  const verifyGCashMutation = useMutation({
    mutationFn: ({ id, action, reason, subscriberId }: { id: string; action: 'verify' | 'reject'; reason?: string; subscriberId?: string }) =>
      api.processGCashVerification(id, action, reason, subscriberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gcash', 'queue'] });
    },
  });

  // Payment history
  const { data: paymentHistory } = useQuery({
    queryKey: ['payments', 'history'],
    queryFn: () => api.listPayments({ page: 1, limit: 100 }),
  });

  const handleSubscriberSelect = (subscriber: SubscriberSearchResult) => {
    setSelectedSubscriber(subscriber);
  };

  const handlePaymentSubmit = async (paymentData: any) => {
    try {
      await submitPaymentMutation.mutateAsync({
        ...paymentData,
        subscriberId: selectedSubscriber?.id,
        paymentDate: new Date(),
      });
      // Navigate to receipt or show success
    } catch (error) {
      console.error('Payment failed:', error);
    }
  };

  const formatStatus = (status: string) => {
    const statusMap: Record<string, { label: string; class: string }> = {
      posted: { label: 'Posted', class: 'bg-green-100 text-green-800' },
      pending: { label: 'Pending', class: 'bg-yellow-100 text-yellow-800' },
      verified: { label: 'Verified', class: 'bg-blue-100 text-blue-800' },
      rejected: { label: 'Rejected', class: 'bg-red-100 text-red-800' },
      reversed: { label: 'Reversed', class: 'bg-gray-100 text-gray-800' },
    };
    return statusMap[status] || { label: status, class: 'bg-gray-100 text-gray-800' };
  };

  return (
    <section className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="page-title">Payments</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('receive')}
            className={`px-4 py-2 rounded-lg transition-colors ${activeTab === 'receive' ? 'bg-primary text-white' : 'bg-surface hover:bg-gray-100'}`}
          >
            <CreditCard className="w-4 h-4 mr-2 inline" />
            Receive Payment
          </button>
          <button
            onClick={() => setActiveTab('gcash')}
            className={`px-4 py-2 rounded-lg transition-colors ${activeTab === 'gcash' ? 'bg-primary text-white' : 'bg-surface hover:bg-gray-100'}`}
          >
            <AlertCircle className="w-4 h-4 mr-2 inline" />
            GCash Verification
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg transition-colors ${activeTab === 'history' ? 'bg-primary text-white' : 'bg-surface hover:bg-gray-100'}`}
          >
            <Eye className="w-4 h-4 mr-2 inline" />
            History
          </button>
        </div>
      </div>

      {activeTab === 'receive' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Subscriber Search */}
          <div className="lg:col-span-1">
            <div className="bg-surface rounded-lg p-4">
              <h3 className="font-semibold text-text-primary mb-4">Find Subscriber</h3>
              <SubscriberSearch
                onSelect={handleSubscriberSelect}
                selected={selectedSubscriber}
              />
              {selectedSubscriber && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="font-medium">{selectedSubscriber.firstName} {selectedSubscriber.lastName}</p>
                  <p className="text-sm text-text-muted">Account: {selectedSubscriber.accountNumber}</p>
                  <p className="text-sm text-text-muted">{selectedSubscriber.contactNumber}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-primary" />
                    <span className="font-semibold">{formatCurrency(selectedSubscriber.totalArrears || 0)}</span>
                    <span className="text-xs text-text-muted">Total Due</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Payment Form & Allocation Preview */}
          <div className="lg:col-span-2 space-y-6">
            {selectedSubscriber ? (
              <>
                <PaymentForm
                  subscriber={selectedSubscriber}
                  allocationPreview={allocationPreview?.items || []}
                  previewAmount={previewAmount}
                  onPreviewAmountChange={setPreviewAmount}
                  onSubmit={handlePaymentSubmit}
                  isSubmitting={submitPaymentMutation.isPending}
                />

                {/* Allocation Preview */}
                {previewAmount > 0 && allocationPreview && (
                  <div className="bg-surface rounded-lg p-4">
                    <h3 className="font-semibold text-text-primary mb-4">Allocation Preview (Oldest First)</h3>
                    <AllocationPreview items={allocationPreview.items} />
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-800">
                        Total Payment: <strong>{formatCurrency(previewAmount)}</strong>
                        {allocationPreview.items.some(i => i.invoiceId === '') && (
                          <span className="ml-2">Includes advance payment</span>
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-surface rounded-lg p-12 text-center">
                <Search className="w-12 h-12 mx-auto text-text-muted mb-4" />
                <p className="text-text-muted">Select a subscriber to receive payment</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'gcash' && (
        <GCashVerificationQueue
          queue={gcashQueue?.items || []}
          onAction={({ id, action, reason, subscriberId }) =>
            verifyGCashMutation.mutate({ id, action, reason, subscriberId })
          }
          isProcessing={verifyGCashMutation.isPending}
        />
      )}

      {activeTab === 'history' && (
        <div className="bg-surface rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Receipt</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Subscriber</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Method</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paymentHistory?.items?.map((payment: any) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-sm">{payment.receiptNumber}</td>
                    <td className="px-4 py-3 text-sm">{new Date(payment.paymentDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-sm">
                      {payment.subscriber?.firstName} {payment.subscriber?.lastName}
                      <br />
                      <span className="text-xs text-text-muted">{payment.subscriber?.accountNumber}</span>
                    </td>
                    <td className="px-4 py-3 text-sm capitalize">{payment.method}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm">{formatCurrency(payment.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${formatStatus(payment.status).class}`}>
                        {formatStatus(payment.status).label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

interface SubscriberSearchResult {
  id: string;
  accountNumber: string;
  firstName: string;
  lastName: string;
  contactNumber: string;
  totalArrears?: number;
  serviceAccounts?: any[];
}