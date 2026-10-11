/**
 * Payment Form Component
 */
import React, { useState, useEffect } from 'react';
import { CreditCard, Smartphone, Building2, Check, Loader2, Calculator } from 'lucide-react';
import { formatCurrency, formatCentavos } from '@bcis/shared';

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

interface PaymentFormProps {
  subscriber: any;
  allocationPreview: AllocationItem[];
  previewAmount: number;
  onPreviewAmountChange: (amount: number) => void;
  onSubmit: (data: any) => Promise<void>;
  isSubmitting: boolean;
}

const METHODS = [
  { value: 'cash', label: 'Cash', icon: CreditCard },
  { value: 'gcash', label: 'GCash', icon: Smartphone },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: Building2 },
  { value: 'cheque', label: 'Cheque', icon: Check },
  { value: 'other', label: 'Other', icon: Calculator },
];

export function PaymentForm({
  subscriber,
  allocationPreview,
  previewAmount,
  onPreviewAmountChange,
  onSubmit,
  isSubmitting,
}: PaymentFormProps) {
  const [method, setMethod] = useState<'cash' | 'gcash' | 'bank_transfer' | 'cheque' | 'other'>('cash');
  const [amount, setAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [autoAllocate, setAutoAllocate] = useState(true);
  const [manualAllocations, setManualAllocations] = useState<Record<string, number>>({});

  // Update preview amount when amount changes
  useEffect(() => {
    const numAmount = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;
    onPreviewAmountChange(numAmount);
  }, [amount, onPreviewAmountChange]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Format as pesos while typing
    const value = e.target.value.replace(/[^0-9]/g, '');
    setAmount(value);
  };

  const handleManualAllocationChange = (invoiceId: string, value: string) => {
    const numValue = parseInt(value.replace(/[^0-9]/g, ''), 10) || 0;
    const invoice = allocationPreview.find(i => i.invoiceId === invoiceId);
    const maxAllocation = invoice?.balance || 0;
    
    setManualAllocations(prev => ({
      ...prev,
      [invoiceId]: Math.min(numValue, maxAllocation),
    }));
  };

  const calculateTotalAllocated = () => {
    if (autoAllocate) return previewAmount;
    return Object.values(manualAllocations).reduce((sum, v) => sum + v, 0);
  };

  const isValid = () => {
    if (!subscriber) return false;
    const numAmount = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;
    if (numAmount <= 0) return false;
    if (method === 'gcash' && !referenceNumber.trim()) return false;
    if (method === 'cheque' && !referenceNumber.trim()) return false;
    if (method === 'bank_transfer' && !referenceNumber.trim()) return false;
    return true;
  };

  const prepareSubmitData = () => {
    const numAmount = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;
    const allocations = autoAllocate 
      ? allocationPreview
          .filter(i => i.invoiceId && i.allocationAmount > 0)
          .map(i => ({ invoiceId: i.invoiceId, amount: i.allocationAmount }))
      : Object.entries(manualAllocations)
          .filter(([, v]) => v > 0)
          .map(([invoiceId, amount]) => ({ invoiceId, amount }));

    return {
      subscriberId: subscriber.id,
      amount: numAmount,
      method,
      referenceNumber: referenceNumber.trim() || undefined,
      paymentDate: new Date(),
      notes: notes.trim() || undefined,
      allocations: allocations.length > 0 ? allocations : undefined,
    };
  };

  const totalDue = subscriber.serviceAccounts?.reduce(
    (sum: number, sa: any) => sum + (sa.totalArrears || 0), 0
  ) || 0;

  return (
    <div className="bg-surface rounded-lg p-6 space-y-6">
      {/* Payment Method */}
      <div>
        <label className="block text-sm font-medium text-text-primary mb-3">Payment Method</label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {METHODS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setMethod(value)}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                method === value
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Icon className={`w-6 h-6 ${method === value ? 'text-primary' : 'text-text-muted'}`} />
              <span className="text-sm font-medium text-text-primary">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Amount */}
      <div>
        <label className="block text-sm font-medium text-text-primary mb-2">
          Amount <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">₱</span>
          <input
            type="text"
            value={amount ? formatCentavos(parseInt(amount, 10)).replace('₱', '') : ''}
            onChange={handleAmountChange}
            placeholder="0.00"
            className="w-full pl-8 pr-4 py-3 text-right text-lg font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            inputMode="decimal"
          />
        </div>
        <p className="mt-1 text-sm text-text-muted">
          Total due: <strong>{formatCurrency(totalDue)}</strong>
        </p>
      </div>

      {/* Reference Number */}
      {(method === 'gcash' || method === 'cheque' || method === 'bank_transfer') && (
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Reference Number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder={method === 'gcash' ? 'GCash Reference #' : method === 'cheque' ? 'Cheque #' : 'Transaction ID'}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-text-primary mb-2">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes..."
          rows={2}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
      </div>

      {/* Allocation Mode */}
      <div className="border-t pt-6">
        <label className="block text-sm font-medium text-text-primary mb-3">Allocation</label>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              checked={autoAllocate}
              onChange={() => { setAutoAllocate(true); setManualAllocations({}); }}
              className="w-4 h-4 text-primary border-gray-300 focus:ring-primary"
            />
            <span className="text-text-primary">Auto-allocate (Oldest First)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              checked={!autoAllocate}
              onChange={() => setAutoAllocate(false)}
              className="w-4 h-4 text-primary border-gray-300 focus:ring-primary"
            />
            <span className="text-text-primary">Manual Allocation</span>
          </label>

          {!autoAllocate && allocationPreview.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-auto">
              {allocationPreview
                .filter(i => i.invoiceId && i.balance > 0)
                .map((item) => (
                  <div key={item.invoiceId} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{item.invoiceNumber}</p>
                      <p className="text-xs text-text-muted">{item.planName} - {item.period}</p>
                    </div>
                    <div className="text-right w-32">
                      <p className="text-xs text-text-muted">Balance: {formatCurrency(item.balance)}</p>
                    </div>
                    <input
                      type="text"
                      value={manualAllocations[item.invoiceId] 
                        ? formatCentavos(manualAllocations[item.invoiceId]).replace('₱', '')
                        : ''}
                      onChange={(e) => handleManualAllocationChange(item.invoiceId, e.target.value)}
                      placeholder="0.00"
                      className="w-24 px-2 py-1 text-right text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                      inputMode="decimal"
                    />
                  </div>
                ))}
            </div>
          )}

          {autoAllocate && allocationPreview.length > 0 && (
            <div className="space-y-1 text-sm">
              {allocationPreview
                .filter(i => i.allocationAmount > 0)
                .map((item) => (
                  <div key={item.invoiceId} className="flex justify-between py-1 border-b border-gray-100">
                    <span className="text-text-secondary">{item.invoiceNumber}</span>
                    <span className="font-medium text-text-primary">{formatCurrency(item.allocationAmount)}</span>
                  </div>
                ))}
              {allocationPreview.some(i => i.invoiceId === '') && (
                <div className="flex justify-between py-1 text-sm text-blue-600">
                  <span>Advance Payment</span>
                  <span className="font-medium">
                    {formatCurrency(allocationPreview.find(i => i.invoiceId === '')?.allocationAmount || 0)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Total Allocated */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex justify-between items-center">
          <span className="font-medium text-text-primary">Total Allocated</span>
          <span className="text-xl font-bold text-text-primary">{formatCurrency(calculateTotalAllocated())}</span>
        </div>
        <div className="mt-1 text-sm text-text-muted">
          Remaining: {formatCurrency(previewAmount - calculateTotalAllocated())}
        </div>
      </div>

      {/* Submit Button */}
      <button
        onClick={() => onSubmit(prepareSubmitData())}
        disabled={!isValid() || isSubmitting}
        className="w-full py-3 px-6 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <Check className="w-5 h-5" />
            Submit Payment
          </>
        )}
      </button>
    </div>
  );
}