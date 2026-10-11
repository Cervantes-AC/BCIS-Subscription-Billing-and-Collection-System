/**
 * Subscribers Page - Search, View, Create, Edit Subscribers
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Search, Plus, User, Phone, Mail, MapPin,
  Edit, Eye, Loader2, AlertCircle,
  CreditCard, ChevronDown, ChevronUp
} from 'lucide-react';
import { formatCurrency } from '@bcis/shared';
import { api } from '../lib/api';

interface Subscriber {
  id: string;
  accountNumber: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  contactNumber: string;
  email?: string;
  status: 'active' | 'inactive' | 'terminated' | 'archived';
  collectionAreaId?: string;
  collectorId?: string;
  addresses?: any[];
  contacts?: any[];
  serviceAccounts?: any[];
  totalArrears?: number;
}

export function SubscribersPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubscriber, setSelectedSubscriber] = useState<Subscriber | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'detail'>('list');

  const { data: subscribersData, isLoading, error: subscribersError } = useQuery({
    queryKey: ['subscribers', 'list', searchQuery],
    queryFn: () => api.listSubscribers({ query: searchQuery, page: 1, limit: 50 }),
  });

  const { data: areas } = useQuery({
    queryKey: ['collection-areas'],
    queryFn: () => api.listCollectionAreas({ limit: 100 }),
  });

  const { data: collectors } = useQuery({
    queryKey: ['collectors'],
    queryFn: () => api.listCollectionCollectors(),
  });

  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.listPlans({ isActive: true, limit: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.createSubscriber(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      setShowCreateModal(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateSubscriber(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      setShowEditModal(false);
      setSelectedSubscriber(null);
    },
  });

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleSelect = (subscriber: Subscriber) => {
    setSelectedSubscriber(subscriber);
    setActiveTab('detail');
  };

  const handleCreate = async (data: any) => {
    const payload = prepareSubscriberPayload(data);
    await createMutation.mutateAsync(payload);
  };

  const handleUpdate = async (id: string, data: any) => {
    await updateMutation.mutateAsync({ id, data: prepareSubscriberPayload(data) });
  };

  if (activeTab === 'detail' && selectedSubscriber) {
    return (
      <SubscriberDetailView
        subscriber={selectedSubscriber}
        onClose={() => { setActiveTab('list'); setSelectedSubscriber(null); }}
        plans={plans?.items || []}
        areas={areas?.items || []}
        collectors={collectors?.items || []}
        onUpdate={handleUpdate}
        isUpdating={updateMutation.isPending}
      />
    );
  }

  return (
    <section className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="page-title">Subscribers</h2>
        <button
          onClick={() => { setShowCreateModal(true); setSelectedSubscriber(null); }}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Subscriber
        </button>
      </div>

      {/* Search */}
      <div className="bg-surface rounded-lg p-4 mb-6">
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by name, account #, phone, email..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Subscriber List */}
      <div className="bg-surface rounded-lg overflow-hidden">
        {subscribersError && <p role="alert" className="m-4 rounded bg-red-50 p-3 text-sm text-red-700">Could not load subscribers: {(subscribersError as Error).message}</p>}
        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-2" />
            <p className="text-text-muted">Loading subscribers...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Account #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Total Due</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Services</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {subscribersData?.items?.map((subscriber: Subscriber) => (
                  <tr key={subscriber.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleSelect(subscriber)}>
                    <td className="px-4 py-3 font-mono text-sm">{subscriber.accountNumber}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{subscriber.firstName} {subscriber.middleName ? subscriber.middleName + ' ' : ''}{subscriber.lastName}</p></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-text-muted" />
                        <span>{subscriber.contactNumber}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {subscriber.email ? (
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-text-muted" />
                          <span className="text-sm">{subscriber.email}</span>
                        </div>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        subscriber.status === 'active' ? 'bg-green-100 text-green-800' :
                        subscriber.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                        subscriber.status === 'terminated' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {subscriber.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-red-600">
                      {formatCurrency(subscriber.totalArrears || 0)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {subscriber.serviceAccounts?.map((sa: any) => (
                          <span key={sa.id} className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                            {sa.plan?.name} ({sa.accountNumber})
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={(event) => { event.stopPropagation(); handleSelect(subscriber); }} className="p-1 hover:bg-gray-100 rounded" title="View" aria-label={`View ${subscriber.firstName} ${subscriber.lastName}`}>
                          <Eye className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedSubscriber(subscriber); setShowEditModal(true); }} className="p-1 hover:bg-gray-100 rounded" title="Edit" aria-label={`Edit ${subscriber.firstName} ${subscriber.lastName}`}>
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {subscribersData?.items?.length === 0 && !isLoading && (
          <div className="p-12 text-center">
            <User className="w-12 h-12 mx-auto text-text-muted mb-4" />
            <p className="text-text-muted">No subscribers found</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 px-4 py-2 bg-primary text-white rounded-lg"
            >
              Create First Subscriber
            </button>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <SubscriberFormModal
          title="Create Subscriber"
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreate}
          isSubmitting={createMutation.isPending}
          error={createMutation.error}
          areas={areas?.items || []}
          collectors={collectors?.items || []}
        />
      )}

      {/* Edit Modal */}
      {showEditModal && selectedSubscriber && (
        <SubscriberFormModal
          title="Edit Subscriber"
          initialData={selectedSubscriber}
          onClose={() => { setShowEditModal(false); setSelectedSubscriber(null); }}
          onSubmit={(data: any) => handleUpdate(selectedSubscriber.id, data)}
          isSubmitting={updateMutation.isPending}
          error={updateMutation.error}
          areas={areas?.items || []}
          collectors={collectors?.items || []}
        />
      )}
    </section>
  );
}

function SubscriberDetailView({ subscriber, onClose, plans, areas, collectors, onUpdate, isUpdating }: any) {
  const [activeServiceTab, setActiveServiceTab] = useState<'services' | 'invoices' | 'payments'>('services');

  return (
    <section className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onClose} className="text-text-muted hover:text-text-primary">
          ← Back to List
        </button>
        <div>
          <h2 className="page-title">{subscriber.firstName} {subscriber.lastName}</h2>
          <p className="text-text-muted">Account: {subscriber.accountNumber}</p>
        </div>
      </div>

      {/* Header Info */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface rounded-lg p-4">
          <p className="text-xs text-text-muted">Contact</p>
          <p className="font-medium">{subscriber.contactNumber}</p>
        </div>
        <div className="bg-surface rounded-lg p-4">
          <p className="text-xs text-text-muted">Email</p>
          <p className="font-medium">{subscriber.email || 'N/A'}</p>
        </div>
        <div className="bg-surface rounded-lg p-4">
          <p className="text-xs text-text-muted">Status</p>
          <p className="font-medium capitalize">{subscriber.status}</p>
        </div>
        <div className="bg-surface rounded-lg p-4">
          <p className="text-xs text-text-muted">Total Due</p>
          <p className="font-bold text-red-600">{formatCurrency(subscriber.totalArrears || 0)}</p>
        </div>
      </div>

      {/* Address */}
      {subscriber.addresses?.length > 0 && (
        <div className="bg-surface rounded-lg p-4 mb-6">
          <h3 className="font-semibold mb-2">Primary Address</h3>
          <p className="text-text-muted">
            {subscriber.addresses[0].street}, {subscriber.addresses[0].barangay}, 
            {subscriber.addresses[0].city} {subscriber.addresses[0].zipCode}
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-surface rounded-lg overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            {['services', 'invoices', 'payments'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveServiceTab(tab as any)}
                className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                  activeServiceTab === tab
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-muted hover:text-text-primary'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeServiceTab === 'services' && (
            <ServiceAccountsView services={subscriber.serviceAccounts || []} />
          )}
          {activeServiceTab === 'invoices' && (
            <InvoicesView invoices={subscriber.serviceAccounts?.flatMap((sa: any) => sa.invoices || []) || []} />
          )}
          {activeServiceTab === 'payments' && (
            <PaymentsView payments={subscriber.serviceAccounts?.flatMap((sa: any) => sa.payments || []) || []} />
          )}
        </div>
      </div>
    </section>
  );
}

function ServiceAccountsView({ services }: any) {
  if (!services.length) return <p className="text-center text-text-muted py-8">No service accounts</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Account #</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Plan</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Type</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Monthly Rate</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Total Due</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {services.map((sa: any) => (
            <tr key={sa.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-mono text-sm">{sa.accountNumber}</td>
              <td className="px-4 py-3">{sa.plan?.name}</td>
              <td className="px-4 py-3 capitalize">{sa.plan?.type}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                  sa.status === 'active' ? 'bg-green-100 text-green-800' :
                  sa.status === 'suspended' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {sa.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-mono">{formatCurrency(sa.currentRate || sa.plan?.monthlyRate || 0)}</td>
              <td className="px-4 py-3 text-right font-mono text-red-600">{formatCurrency(sa.totalArrears || 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvoicesView({ invoices }: any) {
  if (!invoices.length) return <p className="text-center text-text-muted py-8">No invoices</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Invoice #</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Service</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Period</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Due Date</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Total</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Paid</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Balance</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {invoices.map((inv: any) => (
            <tr key={inv.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-mono text-sm">{inv.invoiceNumber}</td>
              <td className="px-4 py-3">{inv.serviceAccount?.plan?.name}</td>
              <td className="px-4 py-3 text-sm">{new Date(inv.periodStart).toLocaleDateString()} - {new Date(inv.periodEnd).toLocaleDateString()}</td>
              <td className="px-4 py-3">{new Date(inv.dueDate).toLocaleDateString()}</td>
              <td className="px-4 py-3 text-right font-mono">{formatCurrency(inv.totalAmount)}</td>
              <td className="px-4 py-3 text-right font-mono">{formatCurrency(inv.paidAmount)}</td>
              <td className="px-4 py-3 text-right font-mono font-bold text-red-600">{formatCurrency(inv.balance)}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                  inv.status === 'paid' ? 'bg-green-100 text-green-800' :
                  inv.status === 'partially_paid' ? 'bg-yellow-100 text-yellow-800' :
                  inv.status === 'overdue' ? 'bg-red-100 text-red-800' :
                  inv.status === 'void' ? 'bg-gray-100 text-gray-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {inv.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentsView({ payments }: any) {
  if (!payments.length) return <p className="text-center text-text-muted py-8">No payments</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Receipt #</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Method</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Amount</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {payments.map((p: any) => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-mono text-sm">{p.receiptNumber}</td>
              <td className="px-4 py-3">{new Date(p.paymentDate).toLocaleDateString()}</td>
              <td className="px-4 py-3 capitalize">{p.method}</td>
              <td className="px-4 py-3 text-right font-mono">{formatCurrency(p.amount)}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                  p.status === 'posted' ? 'bg-green-100 text-green-800' :
                  p.status === 'verified' ? 'bg-blue-100 text-blue-800' :
                  p.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                  p.status === 'reversed' ? 'bg-gray-100 text-gray-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {p.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function prepareSubscriberPayload(data: any) {
  return {
    ...data,
    email: data.email?.trim() || undefined,
    collectionAreaId: data.collectionAreaId || undefined,
    collectorId: data.collectorId || undefined,
    addresses: data.addresses,
  };
}

function SubscriberFormModal({ title, initialData, onClose, onSubmit, isSubmitting, error, areas, collectors }: any) {
  const [formData, setFormData] = useState({
    firstName: initialData?.firstName || '',
    middleName: initialData?.middleName || '',
    lastName: initialData?.lastName || '',
    contactNumber: initialData?.contactNumber || '',
    email: initialData?.email || '',
    status: initialData?.status || 'active',
    collectionAreaId: initialData?.collectionAreaId || '',
    collectorId: initialData?.collectorId || '',
    addresses: initialData?.addresses || [{
      type: 'billing',
      isPrimary: true,
      street: '',
      barangay: '',
      city: '',
      province: '',
      zipCode: '',
    }],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-surface rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-surface z-10">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">Could not save subscriber: {error.message}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">First Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Middle Name</label>
              <input
                type="text"
                value={formData.middleName}
                onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Last Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Contact Number <span className="text-red-500">*</span></label>
              <input
                type="tel"
                value={formData.contactNumber}
                onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="terminated">Terminated</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Collection Area</label>
              <select
                value={formData.collectionAreaId}
                onChange={(e) => setFormData({ ...formData, collectionAreaId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select Area</option>
                {areas.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Assigned Collector</label>
              <select
                value={formData.collectorId}
                onChange={(e) => setFormData({ ...formData, collectorId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Unassigned</option>
                {collectors.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.fullName}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Addresses */}
          <div className="border-t pt-6">
            <h4 className="font-semibold mb-4">Addresses</h4>
            {formData.addresses.map((addr: any, idx: number) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Street</label>
                  <input
                    type="text"
                    value={addr.street}
                    onChange={(e) => {
                      const newAddrs = [...formData.addresses];
                      newAddrs[idx] = { ...newAddrs[idx], street: e.target.value };
                      setFormData({ ...formData, addresses: newAddrs });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Barangay</label>
                  <input
                    type="text"
                    value={addr.barangay}
                    onChange={(e) => {
                      const newAddrs = [...formData.addresses];
                      newAddrs[idx] = { ...newAddrs[idx], barangay: e.target.value };
                      setFormData({ ...formData, addresses: newAddrs });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">City</label>
                  <input
                    type="text"
                    value={addr.city}
                    onChange={(e) => {
                      const newAddrs = [...formData.addresses];
                      newAddrs[idx] = { ...newAddrs[idx], city: e.target.value };
                      setFormData({ ...formData, addresses: newAddrs });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Province</label>
                  <input
                    type="text"
                    value={addr.province}
                    onChange={(e) => {
                      const newAddrs = [...formData.addresses];
                      newAddrs[idx] = { ...newAddrs[idx], province: e.target.value };
                      setFormData({ ...formData, addresses: newAddrs });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Zip Code</label>
                  <input
                    type="text"
                    value={addr.zipCode}
                    onChange={(e) => {
                      const newAddrs = [...formData.addresses];
                      newAddrs[idx] = { ...newAddrs[idx], zipCode: e.target.value };
                      setFormData({ ...formData, addresses: newAddrs });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={addr.isPrimary}
                      onChange={(e) => {
                        const newAddrs = [...formData.addresses];
                        newAddrs[idx] = { ...newAddrs[idx], isPrimary: e.target.checked };
                        setFormData({ ...formData, addresses: newAddrs });
                      }}
                      className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                    />
                    <span className="text-sm">Primary</span>
                  </label>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setFormData({ ...formData, addresses: [...formData.addresses, { type: 'billing', isPrimary: false, street: '', barangay: '', city: '', province: '', zipCode: '' }] })}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              + Add Address
            </button>
          </div>

          <div className="flex justify-end gap-4 pt-4 border-t sticky bottom-0 bg-surface pb-6">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {initialData ? 'Update' : 'Create'} Subscriber
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
