/**
 * Shared Zod validation schemas for BCIS Billing System
 * These schemas are used across all packages for request/response validation
 */

import { z } from 'zod';
import type {
  SubscriberStatus,
  ServiceType,
  ServiceAccountStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  CollectionBatchStatus,
} from '../types';

// ============================================
// Primitive Schemas
// ============================================

export const CentavosSchema = z.number().int().min(0).describe('Amount in centavos (integer)');

export const DateStringSchema = z.string().datetime({ offset: true }).describe('ISO 8601 date string');

export const UUIDSchema = z.string().uuid().describe('UUID v4');

export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const DateRangeSchema = z.object({
  startDate: DateStringSchema,
  endDate: DateStringSchema,
});

// ============================================
// Auth Schemas
// ============================================

export const LoginRequestSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(128),
  rememberMe: z.boolean().optional(),
});

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export const AuthResponseSchema = z.object({
  user: z.object({
    id: UUIDSchema,
    username: z.string(),
    email: z.string().email(),
    fullName: z.string(),
    roleId: UUIDSchema,
    role: z.object({
      id: UUIDSchema,
      name: z.string(),
      permissions: z.array(z.object({
        id: UUIDSchema,
        code: z.string(),
        name: z.string(),
        module: z.string(),
      })),
    }),
    isActive: z.boolean(),
  }),
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: DateStringSchema,
});

// ============================================
// Subscriber Schemas
// ============================================

export const SubscriberAddressSchema = z.object({
  id: UUIDSchema.optional(),
  type: z.enum(['billing', 'installation', 'mailing']),
  street: z.string().min(1).max(255),
  barangay: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  province: z.string().min(1).max(100),
  zipCode: z.string().regex(/^\d{4}$/),
  isPrimary: z.boolean(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const CreateSubscriberRequestSchema = z.object({
  accountNumber: z.string().min(1).max(50).regex(/^[A-Z0-9-]+$/),
  firstName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  lastName: z.string().min(1).max(100),
  contactNumber: z.string().regex(/^(\+63|0)[0-9]{10}$/),
  email: z.string().email().optional().or(z.literal('')),
  billingDay: z.number().int().min(1).max(28).default(1),
  collectionAreaId: UUIDSchema.optional(),
  collectorId: UUIDSchema.optional(),
  notes: z.string().max(1000).optional(),
  addresses: z.array(SubscriberAddressSchema).min(1),
});

export const UpdateSubscriberRequestSchema = CreateSubscriberRequestSchema.partial().omit({ accountNumber: true });

export const SubscriberSearchSchema = PaginationSchema.extend({
  query: z.string().optional(),
  accountNumber: z.string().optional(),
  name: z.string().optional(),
  contactNumber: z.string().optional(),
  status: z.enum(['active', 'inactive', 'terminated', 'archived']).optional(),
  collectionAreaId: UUIDSchema.optional(),
  collectorId: UUIDSchema.optional(),
});

// ============================================
// Plan Schemas
// ============================================

const PlanRequestSchema = z.object({
  code: z.string().min(1).max(20).regex(/^[A-Z0-9_-]+$/),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(['internet', 'cable', 'combo']),
  monthlyRate: CentavosSchema,
  installationFee: CentavosSchema.optional().default(0),
  reconnectionFee: CentavosSchema.optional().default(0),
  speedMbps: z.number().int().positive().optional(),
  dataCapGb: z.number().int().positive().optional(),
  channelCount: z.number().int().positive().optional(),
  hdChannelCount: z.number().int().positive().optional(),
  isActive: z.boolean().default(true),
  effectiveFrom: DateStringSchema,
  effectiveTo: DateStringSchema.optional(),
});

export const CreatePlanRequestSchema = PlanRequestSchema.refine((data) => {
  if (data.type === 'internet' && !data.speedMbps) {
    return false;
  }
  if (data.type === 'cable' && !data.channelCount) {
    return false;
  }
  if (data.type === 'combo' && (!data.speedMbps || !data.channelCount)) {
    return false;
  }
  return true;
}, {
  message: 'Internet plans require speedMbps, Cable plans require channelCount, Combo plans require both',
  path: ['type'],
});

export const UpdatePlanRequestSchema = PlanRequestSchema.partial().omit({ code: true });

export const PlanSearchSchema = PaginationSchema.extend({
  query: z.string().optional(),
  type: z.enum(['internet', 'cable', 'combo']).optional(),
  isActive: z.boolean().optional(),
});

// ============================================
// Service Account Schemas
// ============================================

export const CreateServiceAccountRequestSchema = z.object({
  subscriberId: UUIDSchema,
  planId: UUIDSchema,
  installationAddressId: UUIDSchema,
  billingDay: z.number().int().min(1).max(28),
  currentRate: CentavosSchema.optional(),
  collectorId: UUIDSchema.optional(),
  activationDate: DateStringSchema,
  billingStartDate: DateStringSchema,
});

export const UpdateServiceAccountRequestSchema = z.object({
  planId: UUIDSchema.optional(),
  installationAddressId: UUIDSchema.optional(),
  status: z.enum(['active', 'suspended', 'disconnected', 'pending_installation']).optional(),
  billingDay: z.number().int().min(1).max(28).optional(),
  currentRate: CentavosSchema.optional(),
  collectorId: UUIDSchema.optional().nullable(),
  suspensionReason: z.string().max(500).optional(),
});

export const ServiceAccountSearchSchema = PaginationSchema.extend({
  subscriberId: UUIDSchema.optional(),
  planId: UUIDSchema.optional(),
  status: z.enum(['active', 'suspended', 'disconnected', 'pending_installation']).optional(),
  collectorId: UUIDSchema.optional(),
  areaId: UUIDSchema.optional(),
});

// ============================================
// Billing Schemas
// ============================================

export const CreateBillingCycleRequestSchema = z.object({
  name: z.string().min(1).max(100),
  periodStart: DateStringSchema,
  periodEnd: DateStringSchema,
  dueDate: DateStringSchema,
});

export const BillingGenerationRequestSchema = z.object({
  billingCycleId: UUIDSchema,
  serviceAccountIds: z.array(UUIDSchema).optional(),
  collectorId: UUIDSchema.optional(),
  areaId: UUIDSchema.optional(),
  dryRun: z.boolean().default(false),
});

export const InvoiceItemSchema = z.object({
  description: z.string().min(1).max(255),
  quantity: z.number().int().positive(),
  unitPrice: CentavosSchema,
  type: z.enum(['subscription', 'installation', 'reconnection', 'discount', 'penalty', 'adjustment']),
  sortOrder: z.number().int().default(0),
});

export const CreateInvoiceRequestSchema = z.object({
  serviceAccountId: UUIDSchema,
  billingCycleId: UUIDSchema,
  periodStart: DateStringSchema,
  periodEnd: DateStringSchema,
  dueDate: DateStringSchema,
  subscriptionCharge: CentavosSchema,
  installationFee: CentavosSchema.default(0),
  reconnectionFee: CentavosSchema.default(0),
  discount: CentavosSchema.default(0),
  penalty: CentavosSchema.default(0),
  adjustments: CentavosSchema.default(0),
  notes: z.string().max(1000).optional(),
  items: z.array(InvoiceItemSchema).optional(),
});

export const UpdateInvoiceRequestSchema = z.object({
  status: z.enum(['draft', 'unpaid', 'partially_paid', 'paid', 'overdue', 'void', 'credited']).optional(),
  discount: CentavosSchema.optional(),
  penalty: CentavosSchema.optional(),
  adjustments: CentavosSchema.optional(),
  notes: z.string().max(1000).optional(),
  voidReason: z.string().max(500).optional(),
});

export const InvoiceSearchSchema = PaginationSchema.extend({
  serviceAccountId: UUIDSchema.optional(),
  subscriberId: UUIDSchema.optional(),
  billingCycleId: UUIDSchema.optional(),
  status: z.enum(['draft', 'unpaid', 'partially_paid', 'paid', 'overdue', 'void', 'credited']).optional(),
  dateFrom: DateStringSchema.optional(),
  dateTo: DateStringSchema.optional(),
  dueDateFrom: DateStringSchema.optional(),
  dueDateTo: DateStringSchema.optional(),
});

// ============================================
// Payment Schemas
// ============================================

export const PaymentAllocationSchema = z.object({
  invoiceId: UUIDSchema,
  amount: CentavosSchema,
});

export const CreatePaymentRequestSchema = z.object({
  subscriberId: UUIDSchema,
  amount: CentavosSchema,
  method: z.enum(['cash', 'gcash', 'bank_transfer', 'cheque', 'other']),
  referenceNumber: z.string().max(100).optional(),
  paymentDate: DateStringSchema,
  notes: z.string().max(1000).optional(),
  allocations: z.array(PaymentAllocationSchema).optional(),
});

export const UpdatePaymentRequestSchema = z.object({
  status: z.enum(['pending', 'posted', 'verified', 'rejected', 'reversed', 'void']).optional(),
  notes: z.string().max(1000).optional(),
  rejectReason: z.string().max(500).optional(),
});

export const PaymentSearchSchema = PaginationSchema.extend({
  subscriberId: UUIDSchema.optional(),
  method: z.enum(['cash', 'gcash', 'bank_transfer', 'cheque', 'other']).optional(),
  status: z.enum(['pending', 'posted', 'verified', 'rejected', 'reversed', 'void']).optional(),
  dateFrom: DateStringSchema.optional(),
  dateTo: DateStringSchema.optional(),
  referenceNumber: z.string().optional(),
  receiptNumber: z.string().optional(),
  postedBy: UUIDSchema.optional(),
});

export const GCashVerificationRequestSchema = z.object({
  referenceNumber: z.string().min(1).max(100),
  senderName: z.string().min(1).max(200),
  senderNumber: z.string().regex(/^(\+63|0)[0-9]{10}$/),
  amount: CentavosSchema,
  transactionDate: DateStringSchema,
  proofFile: z.instanceof(File).optional(), // Handled separately in multipart
  proofFileId: UUIDSchema.optional(),
});

export const GCashVerifyActionSchema = z.object({
  action: z.enum(['verify', 'reject']),
  rejectReason: z.string().max(500).optional(),
  subscriberId: UUIDSchema.optional(),
});

export const PaymentReversalRequestSchema = z.object({
  reason: z.string().min(1).max(500),
});

// ============================================
// Collection Schemas
// ============================================

export const CreateCollectionAreaRequestSchema = z.object({
  code: z.string().min(1).max(20).regex(/^[A-Z0-9_-]+$/),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  collectorId: UUIDSchema.optional(),
});

export const UpdateCollectionAreaRequestSchema = CreateCollectionAreaRequestSchema.partial().omit({ code: true });

export const CreateCollectionBatchRequestSchema = z.object({
  collectorId: UUIDSchema,
  areaId: UUIDSchema,
  collectionDate: DateStringSchema,
  serviceAccountIds: z.array(UUIDSchema).min(1),
});

export const UpdateCollectionBatchRequestSchema = z.object({
  status: z.enum(['open', 'in_progress', 'submitted', 'remitted', 'reconciled', 'closed']).optional(),
  notes: z.string().max(1000).optional(),
});

export const CollectionBatchAccountUpdateSchema = z.object({
  collectedAmount: CentavosSchema,
  collectedMethod: z.enum(['cash', 'gcash', 'bank_transfer', 'cheque', 'other']).optional(),
  collectedAt: DateStringSchema.optional(),
  notes: z.string().max(500).optional(),
  receiptNumber: z.string().max(50).optional(),
});

export const CollectorRemittanceRequestSchema = z.object({
  batchId: UUIDSchema,
  cashAmount: CentavosSchema,
  nonCashAmount: CentavosSchema,
  remittanceDate: DateStringSchema,
  notes: z.string().max(500).optional(),
});

export const ReconcileBatchRequestSchema = z.object({
  actualCash: CentavosSchema,
  actualNonCash: CentavosSchema,
  notes: z.string().max(1000).optional(),
});

// ============================================
// Suspension/Reconnection Schemas
// ============================================

export const CreateSuspensionRequestSchema = z.object({
  serviceAccountId: UUIDSchema,
  reason: z.string().min(1).max(500),
  effectiveDate: DateStringSchema,
  notes: z.string().max(1000).optional(),
});

export const CreateReconnectionRequestSchema = z.object({
  suspensionId: UUIDSchema,
  fee: CentavosSchema,
  paymentId: UUIDSchema.optional(),
  technicianId: UUIDSchema.optional(),
  scheduledDate: DateStringSchema.optional(),
  notes: z.string().max(1000).optional(),
});

export const UpdateReconnectionRequestSchema = z.object({
  status: z.enum(['pending', 'scheduled', 'completed', 'cancelled']).optional(),
  technicianId: UUIDSchema.optional().nullable(),
  scheduledDate: DateStringSchema.optional().nullable(),
  completedDate: DateStringSchema.optional().nullable(),
  notes: z.string().max(1000).optional(),
});

// ============================================
// Report Schemas
// ============================================

export const ReportPeriodSchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly', 'annual']),
  date: DateStringSchema,
  collectorId: UUIDSchema.optional(),
  areaId: UUIDSchema.optional(),
});

export const AgingReportRequestSchema = z.object({
  asOfDate: DateStringSchema,
  collectorId: UUIDSchema.optional(),
  areaId: UUIDSchema.optional(),
  planId: UUIDSchema.optional(),
  serviceType: z.enum(['internet', 'cable', 'combo']).optional(),
});

export const StatementOfAccountRequestSchema = z.object({
  subscriberId: UUIDSchema,
  serviceAccountId: UUIDSchema.optional(),
  dateFrom: DateStringSchema.optional(),
  dateTo: DateStringSchema.optional(),
});

// ============================================
// Settings & Backup Schemas
// ============================================

export const UpdateSettingRequestSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().max(1000),
  description: z.string().max(500).optional(),
});

export const CreateBackupRequestSchema = z.object({
  type: z.enum(['full', 'incremental', 'manual']).default('manual'),
});

export const RestoreBackupRequestSchema = z.object({
  backupId: UUIDSchema,
  confirm: z.literal(true),
});

// ============================================
// Type Exports
// ============================================

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
export type CreateSubscriberRequest = z.infer<typeof CreateSubscriberRequestSchema>;
export type UpdateSubscriberRequest = z.infer<typeof UpdateSubscriberRequestSchema>;
export type CreatePlanRequest = z.infer<typeof CreatePlanRequestSchema>;
export type UpdatePlanRequest = z.infer<typeof UpdatePlanRequestSchema>;
export type CreateServiceAccountRequest = z.infer<typeof CreateServiceAccountRequestSchema>;
export type UpdateServiceAccountRequest = z.infer<typeof UpdateServiceAccountRequestSchema>;
export type CreateBillingCycleRequest = z.infer<typeof CreateBillingCycleRequestSchema>;
export type BillingGenerationRequest = z.infer<typeof BillingGenerationRequestSchema>;
export type CreateInvoiceRequest = z.infer<typeof CreateInvoiceRequestSchema>;
export type UpdateInvoiceRequest = z.infer<typeof UpdateInvoiceRequestSchema>;
export type CreatePaymentRequest = z.infer<typeof CreatePaymentRequestSchema>;
export type UpdatePaymentRequest = z.infer<typeof UpdatePaymentRequestSchema>;
export type PaymentSearchParams = z.infer<typeof PaymentSearchSchema>;
export type GCashVerificationRequest = z.infer<typeof GCashVerificationRequestSchema>;
export type GCashVerifyAction = z.infer<typeof GCashVerifyActionSchema>;
export type PaymentReversalRequest = z.infer<typeof PaymentReversalRequestSchema>;
export type CreateCollectionAreaRequest = z.infer<typeof CreateCollectionAreaRequestSchema>;
export type CreateCollectionBatchRequest = z.infer<typeof CreateCollectionBatchRequestSchema>;
export type CreateSuspensionRequest = z.infer<typeof CreateSuspensionRequestSchema>;
export type CreateReconnectionRequest = z.infer<typeof CreateReconnectionRequestSchema>;
export type ReportPeriodParams = z.infer<typeof ReportPeriodSchema>;
export type AgingReportParams = z.infer<typeof AgingReportRequestSchema>;
export type StatementOfAccountParams = z.infer<typeof StatementOfAccountRequestSchema>;