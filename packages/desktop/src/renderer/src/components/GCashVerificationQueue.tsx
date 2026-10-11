/**
 * GCash Verification Queue Component
 */
import React from 'react';
import { Eye, CheckCircle, XCircle, AlertCircle, Clock, User, Smartphone, Loader2 } from 'lucide-react';
import { formatCurrency } from '@bcis/shared';

interface GCashQueueItem {
  id: string;
  referenceNumber: string;
  senderName: string;
  senderNumber: string;
  amount: number;
  transactionDate: string;
  status: 'pending' | 'verified' | 'rejected';
  subscriberId?: string;
  subscriber?: {
    id: string;
    accountNumber: string;
    firstName: string;
    lastName: string;
  };
  proofAttachment?: {
    id: string;
    fileName: string;
    filePath: string;
  };
}

interface GCashVerificationQueueProps {
  queue: GCashQueueItem[];
  onAction: (action: { id: string; action: 'verify' | 'reject'; reason?: string; subscriberId?: string }) => void;
  isProcessing: boolean;
}

export function GCashVerificationQueue({ queue, onAction, isProcessing }: GCashVerificationQueueProps) {
  const pendingItems = queue.filter(item => item.status === 'pending');
  const verifiedItems = queue.filter(item => item.status === 'verified');
  const rejectedItems = queue.filter(item => item.status === 'rejected');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
      case 'verified':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3" />
            Verified
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      default:
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  const handleVerify = (item: GCashQueueItem) => {
    if (!item.subscriberId) {
      // Need to select subscriber
      alert('Please select a subscriber for this payment');
      return;
    }
    onAction({ id: item.id, action: 'verify', subscriberId: item.subscriberId });
  };

  const handleReject = (item: GCashQueueItem) => {
    const reason = prompt('Reason for rejection:');
    if (reason !== null) {
      onAction({ id: item.id, action: 'reject', reason });
    }
  };

  const renderQueue = (items: GCashQueueItem[], title: string) => {
    if (items.length === 0) return null;

    return (
      <div className="mb-6">
        <h3 className="font-semibold text-text-primary mb-3">{title} ({items.length})</h3>
        <div className="bg-surface rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Reference</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Sender</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Phone</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Subscriber</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Proof</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-sm text-text-primary">{item.referenceNumber}</td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-primary" />
                      <span>{item.senderName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono">{item.senderNumber}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-text-primary">{formatCurrency(item.amount)}</td>
                  <td className="px-4 py-3 text-sm text-text-muted">{new Date(item.transactionDate).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {item.subscriber ? (
                      <div>
                        <p className="text-sm font-medium">{item.subscriber.firstName} {item.subscriber.lastName}</p>
                        <p className="text-xs text-text-muted">{item.subscriber.accountNumber}</p>
                      </div>
                    ) : (
                      <span className="text-text-muted">Not assigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {item.proofAttachment ? (
                      <button className="text-primary hover:underline text-sm flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        View Proof
                      </button>
                    ) : (
                      <span className="text-gray-400 text-sm">No proof</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {item.status === 'pending' && !isProcessing && (
                        <>
                          <button
                            onClick={() => handleVerify(item)}
                            className="px-3 py-1 text-xs bg-green-100 text-green-800 rounded hover:bg-green-200 transition-colors"
                          >
                            Verify
                          </button>
                          <button
                            onClick={() => handleReject(item)}
                            className="px-3 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200 transition-colors"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {item.status !== 'pending' && getStatusBadge(item.status)}
                      {isProcessing && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="page-title">GCash Verification Queue</h2>
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <AlertCircle className="w-4 h-4" />
          <span>Pending items require manual verification before posting</span>
        </div>
      </div>

      {renderQueue(pendingItems, 'Pending Verification')}
      {renderQueue(verifiedItems, 'Verified')}
      {renderQueue(rejectedItems, 'Rejected')}

      {queue.length === 0 && (
        <div className="bg-surface rounded-lg p-12 text-center">
          <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-4" />
          <p className="text-text-secondary">No GCash payments in queue</p>
        </div>
      )}
    </div>
  );
}