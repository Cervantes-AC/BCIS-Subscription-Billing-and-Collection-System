/**
 * Shared type definitions for BCIS Billing System
 * These types are used across all packages (desktop, api, db)
 */

// ============================================
// User & Authentication Types
// ============================================

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  roleId: string;
  role?: Role;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: string;
  code: string;
  name: string;
  description: string;
  module: string;
}

export interface Session {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

// ============================================
// Subscriber Types
// ============================================

export type SubscriberStatus = 'active' | 'inactive' | 'terminated' | 'archived';

export interface Subscriber {
  id: string;
  accountNumber: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  contactNumber: string;
  email?: string;
  status: SubscriberStatus;
  billingDay: number; // 1-28
  collectionAreaId?: string;
  collectorId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  addresses?: SubscriberAddress[];
  serviceAccounts?: ServiceAccount[];
}

export interface SubscriberAddress {
  id: string;
  subscriberId: string;
  type: 'billing' | 'installation' | 'mailing';
  street: string;
  barangay: string;
  city: string;
  province: string;
  zipCode: string;
  isPrimary: boolean;
  latitude?: number;
  longitude?: number;
}

export interface SubscriberSearchParams {
  query?: string;
  accountNumber?: string;
  name?: string;
  contactNumber?: string;
  status?: SubscriberStatus;
  collectionAreaId?: string;
  collectorId?: string;
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ============================================
// Plan & Service Types
// ============================================

export type ServiceType = 'internet' | 'cable' | 'combo';

export interface ServicePlan {
  id: string;
  code: string;
  name: string;
  description?: string;
  type: ServiceType;
  monthlyRate: number; // in centavos
  installationFee?: number; // in centavos
  reconnectionFee?: number; // in centavos
  // Internet specific
  speedMbps?: number;
  dataCapGb?: number;
  // Cable specific
  channelCount?: number;
  hdChannelCount?: number;
  // Common
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ServiceAccountStatus = 'active' | 'suspended' | 'disconnected' | 'pending_installation';

export interface ServiceAccount {
  id: string;
  accountNumber: string;
  subscriberId: string;
  planId: string;
  plan?: ServicePlan;
  installationAddressId: string;
  installationAddress?: SubscriberAddress;
  status: ServiceAccountStatus;
  activationDate: Date;
  billingStartDate: Date;
  billingDay: number; // 1-28
  currentRate: number; // in centavos, overrides plan rate
  collectorId?: string;
  collector?: User;
  suspensionReason?: string;
  suspendedAt?: Date;
  suspendedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  invoices?: Invoice[];
}

// ============================================
// Billing Types
// ============================================

export type InvoiceStatus = 'draft' | 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'void' | 'credited';

export interface BillingCycle {
  id: string;
  name: string;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  status: 'open' | 'generating' | 'finalized' | 'closed';
  generatedAt?: Date;
  generatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  serviceAccountId: string;
  serviceAccount?: ServiceAccount;
  billingCycleId: string;
  billingCycle?: BillingCycle;
  status: InvoiceStatus;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  subscriptionCharge: number; // in centavos
  installationFee: number;
  reconnectionFee: number;
  discount: number;
  penalty: number;
  adjustments: number;
  totalAmount: number; // in centavos
  paidAmount: number; // in centavos
  balance: number; // in centavos
  notes?: string;
  generatedAt: Date;
  generatedBy: string;
  finalizedAt?: Date;
  finalizedBy?: string;
  voidedAt?: Date;
  voidedBy?: string;
  voidReason?: string;
  createdAt: Date;
  updatedAt: Date;
  items?: InvoiceItem[];
  allocations?: PaymentAllocation[];
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number; // in centavos
  amount: number; // in centavos
  type: 'subscription' | 'installation' | 'reconnection' | 'discount' | 'penalty' | 'adjustment';
  sortOrder: number;
}

export interface BillingGenerationParams {
  billingCycleId: string;
  serviceAccountIds?: string[];
  collectorId?: string;
  areaId?: string;
  dryRun?: boolean;
}

// ============================================
// Payment Types
// ============================================

export type PaymentMethod = 'cash' | 'gcash' | 'bank_transfer' | 'cheque' | 'other';

export type PaymentStatus = 'pending' | 'posted' | 'verified' | 'rejected' | 'reversed' | 'void';

export interface Payment {
  id: string;
  receiptNumber: string;
  subscriberId: string;
  subscriber?: Subscriber;
  amount: number; // in centavos
  method: PaymentMethod;
  referenceNumber?: string;
  paymentDate: Date;
  postedDate: Date;
  postedBy: string;
  postedByUser?: User;
  status: PaymentStatus;
  notes?: string;
  proofAttachmentId?: string;
  proofAttachment?: PaymentProof;
  verifiedAt?: Date;
  verifiedBy?: string;
  verifiedByUser?: User;
  rejectedAt?: Date;
  rejectedBy?: string;
  rejectReason?: string;
  reversedAt?: Date;
  reversedBy?: string;
  reverseReason?: string;
  reversalPaymentId?: string;
  createdAt: Date;
  updatedAt: Date;
  allocations?: PaymentAllocation[];
}

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  payment?: Payment;
  invoiceId: string;
  invoice?: Invoice;
  amount: number; // in centavos
  allocatedAt: Date;
  allocatedBy: string;
}

export interface PaymentProof {
  id: string;
  paymentId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;
  uploadedBy: string;
}

export interface GCashVerificationQueueItem {
  id: string;
  referenceNumber: string;
  senderName: string;
  senderNumber: string;
  amount: number; // in centavos
  transactionDate: Date;
  proofAttachmentId: string;
  proofAttachment?: PaymentProof;
  status: 'pending' | 'verified' | 'rejected';
  verifiedAt?: Date;
  verifiedBy?: string;
  rejectReason?: string;
  subscriberId?: string;
  subscriber?: Subscriber;
  createdAt: Date;
}

export interface PaymentParams {
  subscriberId: string;
  amount: number;
  method: PaymentMethod;
  referenceNumber?: string;
  paymentDate: Date;
  notes?: string;
  proofFile?: File;
  allocations?: { invoiceId: string; amount: number }[];
}

export interface PaymentAllocationPreview {
  invoiceId: string;
  invoiceNumber: string;
  serviceAccountId: string;
  serviceType: ServiceType;
  planName: string;
  period: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  allocationAmount: number;
  remainingAfterAllocation: number;
}

// ============================================
// Collection Types
// ============================================

export interface CollectionArea {
  id: string;
  code: string;
  name: string;
  description?: string;
  collectorId?: string;
  collector?: User;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CollectorAssignment {
  id: string;
  collectorId: string;
  collector?: User;
  areaId: string;
  area?: CollectionArea;
  assignedAt: Date;
  assignedBy: string;
  isActive: boolean;
}

export type CollectionBatchStatus = 'open' | 'in_progress' | 'submitted' | 'remitted' | 'reconciled' | 'closed';

export interface CollectionBatch {
  id: string;
  batchNumber: string;
  collectorId: string;
  collector?: User;
  areaId: string;
  area?: CollectionArea;
  status: CollectionBatchStatus;
  collectionDate: Date;
  expectedCash: number; // in centavos
  expectedNonCash: number; // in centavos
  actualCash: number; // in centavos
  actualNonCash: number; // in centavos
  shortage: number; // in centavos
  overage: number; // in centavos
  notes?: string;
  openedAt: Date;
  openedBy: string;
  submittedAt?: Date;
  submittedBy?: string;
  remittedAt?: Date;
  remittedBy?: string;
  reconciledAt?: Date;
  reconciledBy?: string;
  closedAt?: Date;
  closedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  accounts?: CollectionBatchAccount[];
  remittances?: CollectorRemittance[];
}

export interface CollectionBatchAccount {
  id: string;
  batchId: string;
  serviceAccountId: string;
  serviceAccount?: ServiceAccount;
  currentBill: number; // in centavos
  arrears: number; // in centavos
  totalDue: number; // in centavos
  collectedAmount: number; // in centavos
  collectedMethod?: PaymentMethod;
  collectedAt?: Date;
  notes?: string;
  receiptNumber?: string;
}

export interface CollectorRemittance {
  id: string;
  batchId: string;
  batch?: CollectionBatch;
  collectorId: string;
  cashAmount: number; // in centavos
  nonCashAmount: number; // in centavos
  remittanceDate: Date;
  remittedBy: string;
  receivedBy?: string;
  notes?: string;
  createdAt: Date;
}

export interface RouteSheetItem {
  serviceAccount: ServiceAccount;
  subscriber: Subscriber;
  address: SubscriberAddress;
  currentBill: number;
  arrears: number;
  totalDue: number;
  collectorName: string;
}

// ============================================
// Receivables & Aging Types
// ============================================

export interface AgingBucket {
  bucket: 'current' | '1-30' | '31-60' | '61-90' | '90+';
  label: string;
  count: number;
  amount: number; // in centavos
}

export interface OverdueAccount {
  subscriber: Subscriber;
  serviceAccount: ServiceAccount;
  collector?: User;
  area?: CollectionArea;
  monthsUnpaid: number;
  oldestUnpaidInvoice?: Invoice;
  lastPayment?: Payment;
  totalArrears: number; // in centavos
  currentBill: number; // in centavos
}

export interface ReceivablesSummary {
  totalReceivable: number;
  currentReceivable: number;
  overdueReceivable: number;
  overdueCount: number;
  suspensionCandidates: number;
  agingBuckets: AgingBucket[];
}

// ============================================
// Suspension & Reconnection Types
// ============================================

export interface SuspensionRecord {
  id: string;
  serviceAccountId: string;
  serviceAccount?: ServiceAccount;
  reason: string;
  effectiveDate: Date;
  approvedBy: string;
  approvedByUser?: User;
  notes?: string;
  createdAt: Date;
}

export interface ReconnectionRecord {
  id: string;
  suspensionId: string;
  suspension?: SuspensionRecord;
  serviceAccountId: string;
  serviceAccount?: ServiceAccount;
  requestDate: Date;
  requestedBy: string;
  fee: number; // in centavos
  paymentId?: string;
  payment?: Payment;
  technicianId?: string;
  technician?: User;
  scheduledDate?: Date;
  completedDate?: Date;
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Receipt & Document Types
// ============================================

export interface Receipt {
  id: string;
  receiptNumber: string;
  paymentId: string;
  payment?: Payment;
  template: string;
  generatedAt: Date;
  generatedBy: string;
  printedCount: number;
  lastPrintedAt?: Date;
  lastPrintedBy?: string;
  voidedAt?: Date;
  voidedBy?: string;
  voidReason?: string;
}

// ============================================
// Audit & System Types
// ============================================

export interface AuditLog {
  id: string;
  actorId: string;
  actor?: User;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface ApplicationSettings {
  id: string;
  key: string;
  value: string;
  description?: string;
  isPublic: boolean;
  updatedAt: Date;
  updatedBy: string;
}

export interface BackupHistory {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  type: 'full' | 'incremental' | 'manual' | 'scheduled';
  status: 'success' | 'failed' | 'in_progress';
  startedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
  createdBy: string;
}

// ============================================
// Report Types
// ============================================

export interface DashboardKPIs {
  totalSubscribers: number;
  activeSubscribers: number;
  totalReceivable: number;
  overdueReceivable: number;
  monthlyCollection: number;
  monthlyBilling: number;
  collectionRate: number;
  cashCollection: number;
  gcashCollection: number;
  otherCollection: number;
  overdueCount: number;
  suspensionCandidates: number;
  recentPayments: Payment[];
  collectorPerformance: CollectorPerformance[];
}

export interface CollectorPerformance {
  collectorId: string;
  collectorName: string;
  areaName: string;
  assignedAccounts: number;
  collectedAccounts: number;
  expectedCash: number;
  actualCash: number;
  expectedNonCash: number;
  actualNonCash: number;
  shortage: number;
  overage: number;
  collectionRate: number;
}

export interface MonthlyCollectionReport {
  period: string;
  totalCollection: number;
  cashCollection: number;
  gcashCollection: number;
  bankTransferCollection: number;
  chequeCollection: number;
  otherCollection: number;
  byCollector: CollectorCollectionSummary[];
  byArea: AreaCollectionSummary[];
  byMethod: MethodCollectionSummary[];
}

export interface CollectorCollectionSummary {
  collectorId: string;
  collectorName: string;
  cashAmount: number;
  nonCashAmount: number;
  totalAmount: number;
  receiptCount: number;
}

export interface AreaCollectionSummary {
  areaId: string;
  areaName: string;
  cashAmount: number;
  nonCashAmount: number;
  totalAmount: number;
  receiptCount: number;
}

export interface MethodCollectionSummary {
  method: PaymentMethod;
  amount: number;
  count: number;
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  statusCode: number;
}

export interface ResponseMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: ResponseMeta;
}

// ============================================
// Financial Utilities
// ============================================

export const CENTAVOS_PER_PESO = 100;

export function pesosToCentavos(pesos: number): number {
  return Math.round(pesos * CENTAVOS_PER_PESO);
}

export function centavosToPesos(centavos: number): number {
  return centavos / CENTAVOS_PER_PESO;
}

export function formatCurrency(centavos: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(centavosToPesos(centavos));
}

export function formatCentavos(centavos: number): string {
  const pesos = centavosToPesos(centavos);
  return pesos.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}