"use strict";
/**
 * BCIS Database Schema - Payments Tables
 * Payments, allocations, proofs, reversals, GCash verification
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.gcashVerificationQueueRelations = exports.paymentReversalsRelations = exports.paymentProofsRelations = exports.paymentAllocationsRelations = exports.paymentsRelations = exports.gcashVerificationQueue = exports.paymentReversals = exports.paymentProofs = exports.paymentAllocations = exports.payments = exports.paymentStatusEnum = exports.paymentMethodEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const security_1 = require("./security");
const subscribers_1 = require("./subscribers");
const billing_1 = require("./billing");
// ============================================
// Enums
// ============================================
exports.paymentMethodEnum = (0, pg_core_1.pgEnum)('payment_method', [
    'cash',
    'gcash',
    'bank_transfer',
    'cheque',
    'other',
]);
exports.paymentStatusEnum = (0, pg_core_1.pgEnum)('payment_status', [
    'pending',
    'posted',
    'verified',
    'rejected',
    'reversed',
    'void',
]);
// ============================================
// Tables
// ============================================
exports.payments = (0, pg_core_1.pgTable)('payments', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    receiptNumber: (0, pg_core_1.varchar)('receipt_number', { length: 50 }).notNull().unique(),
    subscriberId: (0, pg_core_1.uuid)('subscriber_id')
        .notNull()
        .references(() => subscribers_1.subscribers.id, { onDelete: 'restrict' }),
    amount: (0, pg_core_1.integer)('amount').notNull(), // in centavos
    method: (0, exports.paymentMethodEnum)('method').notNull(),
    referenceNumber: (0, pg_core_1.varchar)('reference_number', { length: 100 }),
    paymentDate: (0, pg_core_1.timestamp)('payment_date', { withTimezone: true }).notNull(),
    postedDate: (0, pg_core_1.timestamp)('posted_date', { withTimezone: true }).defaultNow().notNull(),
    postedBy: (0, pg_core_1.uuid)('posted_by').notNull().references(() => security_1.users.id),
    status: (0, exports.paymentStatusEnum)('status').default('pending').notNull(),
    notes: (0, pg_core_1.text)('notes'),
    proofAttachmentId: (0, pg_core_1.uuid)('proof_attachment_id'),
    verifiedAt: (0, pg_core_1.timestamp)('verified_at', { withTimezone: true }),
    verifiedBy: (0, pg_core_1.uuid)('verified_by').references(() => security_1.users.id),
    rejectedAt: (0, pg_core_1.timestamp)('rejected_at', { withTimezone: true }),
    rejectedBy: (0, pg_core_1.uuid)('rejected_by').references(() => security_1.users.id),
    rejectReason: (0, pg_core_1.text)('reject_reason'),
    reversedAt: (0, pg_core_1.timestamp)('reversed_at', { withTimezone: true }),
    reversedBy: (0, pg_core_1.uuid)('reversed_by').references(() => security_1.users.id),
    reverseReason: (0, pg_core_1.text)('reverse_reason'),
    reversalPaymentId: (0, pg_core_1.uuid)('reversal_payment_id').references(() => exports.payments.id),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    receiptNumberIdx: (0, pg_core_1.uniqueIndex)('payments_receipt_number_idx').on(table.receiptNumber),
    subscriberIdx: (0, pg_core_1.index)('payments_subscriber_idx').on(table.subscriberId),
    methodIdx: (0, pg_core_1.index)('payments_method_idx').on(table.method),
    statusIdx: (0, pg_core_1.index)('payments_status_idx').on(table.status),
    paymentDateIdx: (0, pg_core_1.index)('payments_payment_date_idx').on(table.paymentDate),
    postedByIdx: (0, pg_core_1.index)('payments_posted_by_idx').on(table.postedBy),
    referenceNumberIdx: (0, pg_core_1.index)('payments_reference_number_idx').on(table.referenceNumber),
    reversalIdx: (0, pg_core_1.index)('payments_reversal_idx').on(table.reversalPaymentId),
}));
exports.paymentAllocations = (0, pg_core_1.pgTable)('payment_allocations', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    paymentId: (0, pg_core_1.uuid)('payment_id')
        .notNull()
        .references(() => exports.payments.id, { onDelete: 'cascade' }),
    invoiceId: (0, pg_core_1.uuid)('invoice_id')
        .notNull()
        .references(() => billing_1.invoices.id, { onDelete: 'restrict' }),
    amount: (0, pg_core_1.integer)('amount').notNull(), // in centavos
    allocatedAt: (0, pg_core_1.timestamp)('allocated_at', { withTimezone: true }).defaultNow().notNull(),
    allocatedBy: (0, pg_core_1.uuid)('allocated_by').notNull().references(() => security_1.users.id),
}, (table) => ({
    paymentIdx: (0, pg_core_1.index)('payment_allocations_payment_idx').on(table.paymentId),
    invoiceIdx: (0, pg_core_1.index)('payment_allocations_invoice_idx').on(table.invoiceId),
    // Each payment-invoice pair should be unique
    uniquePaymentInvoice: (0, pg_core_1.uniqueIndex)('payment_allocations_unique_idx').on(table.paymentId, table.invoiceId),
}));
exports.paymentProofs = (0, pg_core_1.pgTable)('payment_proofs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    paymentId: (0, pg_core_1.uuid)('payment_id')
        .notNull()
        .references(() => exports.payments.id, { onDelete: 'cascade' }),
    fileName: (0, pg_core_1.varchar)('file_name', { length: 255 }).notNull(),
    filePath: (0, pg_core_1.varchar)('file_path', { length: 500 }).notNull(),
    fileSize: (0, pg_core_1.integer)('file_size').notNull(),
    mimeType: (0, pg_core_1.varchar)('mime_type', { length: 100 }).notNull(),
    uploadedAt: (0, pg_core_1.timestamp)('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
    uploadedBy: (0, pg_core_1.uuid)('uploaded_by').notNull().references(() => security_1.users.id),
}, (table) => ({
    paymentIdx: (0, pg_core_1.uniqueIndex)('payment_proofs_payment_idx').on(table.paymentId),
}));
exports.paymentReversals = (0, pg_core_1.pgTable)('payment_reversals', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    originalPaymentId: (0, pg_core_1.uuid)('original_payment_id')
        .notNull()
        .references(() => exports.payments.id, { onDelete: 'restrict' }),
    reversalPaymentId: (0, pg_core_1.uuid)('reversal_payment_id')
        .notNull()
        .references(() => exports.payments.id, { onDelete: 'restrict' }),
    reason: (0, pg_core_1.text)('reason').notNull(),
    reversedBy: (0, pg_core_1.uuid)('reversed_by').notNull().references(() => security_1.users.id),
    reversedAt: (0, pg_core_1.timestamp)('reversed_at', { withTimezone: true }).defaultNow().notNull(),
    approvedBy: (0, pg_core_1.uuid)('approved_by').references(() => security_1.users.id),
    approvedAt: (0, pg_core_1.timestamp)('approved_at', { withTimezone: true }),
}, (table) => ({
    originalIdx: (0, pg_core_1.uniqueIndex)('payment_reversals_original_idx').on(table.originalPaymentId),
    reversalIdx: (0, pg_core_1.uniqueIndex)('payment_reversals_reversal_idx').on(table.reversalPaymentId),
}));
exports.gcashVerificationQueue = (0, pg_core_1.pgTable)('gcash_verification_queue', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    referenceNumber: (0, pg_core_1.varchar)('reference_number', { length: 100 }).notNull(),
    senderName: (0, pg_core_1.varchar)('sender_name', { length: 200 }).notNull(),
    senderNumber: (0, pg_core_1.varchar)('sender_number', { length: 20 }).notNull(),
    amount: (0, pg_core_1.integer)('amount').notNull(), // in centavos
    transactionDate: (0, pg_core_1.timestamp)('transaction_date', { withTimezone: true }).notNull(),
    proofAttachmentId: (0, pg_core_1.uuid)('proof_attachment_id').notNull().references(() => exports.paymentProofs.id),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).default('pending').notNull(), // pending, verified, rejected
    subscriberId: (0, pg_core_1.uuid)('subscriber_id').references(() => subscribers_1.subscribers.id),
    verifiedAt: (0, pg_core_1.timestamp)('verified_at', { withTimezone: true }),
    verifiedBy: (0, pg_core_1.uuid)('verified_by').references(() => security_1.users.id),
    rejectReason: (0, pg_core_1.text)('reject_reason'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    referenceIdx: (0, pg_core_1.uniqueIndex)('gcash_verification_reference_idx').on(table.referenceNumber),
    statusIdx: (0, pg_core_1.index)('gcash_verification_status_idx').on(table.status),
    subscriberIdx: (0, pg_core_1.index)('gcash_verification_subscriber_idx').on(table.subscriberId),
    transactionDateIdx: (0, pg_core_1.index)('gcash_verification_transaction_date_idx').on(table.transactionDate),
}));
// ============================================
// Relations
// ============================================
exports.paymentsRelations = (0, drizzle_orm_1.relations)(exports.payments, ({ one, many }) => ({
    subscriber: one(subscribers_1.subscribers, {
        fields: [exports.payments.subscriberId],
        references: [subscribers_1.subscribers.id],
    }),
    poster: one(security_1.users, {
        fields: [exports.payments.postedBy],
        references: [security_1.users.id],
    }),
    verifier: one(security_1.users, {
        fields: [exports.payments.verifiedBy],
        references: [security_1.users.id],
    }),
    rejecter: one(security_1.users, {
        fields: [exports.payments.rejectedBy],
        references: [security_1.users.id],
    }),
    reverser: one(security_1.users, {
        fields: [exports.payments.reversedBy],
        references: [security_1.users.id],
    }),
    reversalPayment: one(exports.payments, {
        fields: [exports.payments.reversalPaymentId],
        references: [exports.payments.id],
        relationName: 'reversal',
    }),
    originalPayment: one(exports.payments, {
        fields: [exports.payments.reversalPaymentId],
        references: [exports.payments.id],
        relationName: 'original',
    }),
    proof: one(exports.paymentProofs, {
        fields: [exports.payments.proofAttachmentId],
        references: [exports.paymentProofs.id],
    }),
    allocations: many(exports.paymentAllocations),
    reversals: many(exports.paymentReversals, { relationName: 'original' }),
    reversalRecords: many(exports.paymentReversals, { relationName: 'reversal' }),
}));
exports.paymentAllocationsRelations = (0, drizzle_orm_1.relations)(exports.paymentAllocations, ({ one }) => ({
    payment: one(exports.payments, {
        fields: [exports.paymentAllocations.paymentId],
        references: [exports.payments.id],
    }),
    invoice: one(billing_1.invoices, {
        fields: [exports.paymentAllocations.invoiceId],
        references: [billing_1.invoices.id],
    }),
    allocator: one(security_1.users, {
        fields: [exports.paymentAllocations.allocatedBy],
        references: [security_1.users.id],
    }),
}));
exports.paymentProofsRelations = (0, drizzle_orm_1.relations)(exports.paymentProofs, ({ one }) => ({
    payment: one(exports.payments, {
        fields: [exports.paymentProofs.paymentId],
        references: [exports.payments.id],
    }),
    uploader: one(security_1.users, {
        fields: [exports.paymentProofs.uploadedBy],
        references: [security_1.users.id],
    }),
}));
exports.paymentReversalsRelations = (0, drizzle_orm_1.relations)(exports.paymentReversals, ({ one }) => ({
    originalPayment: one(exports.payments, {
        fields: [exports.paymentReversals.originalPaymentId],
        references: [exports.payments.id],
    }),
    reversalPayment: one(exports.payments, {
        fields: [exports.paymentReversals.reversalPaymentId],
        references: [exports.payments.id],
    }),
    reverser: one(security_1.users, {
        fields: [exports.paymentReversals.reversedBy],
        references: [security_1.users.id],
    }),
    approver: one(security_1.users, {
        fields: [exports.paymentReversals.approvedBy],
        references: [security_1.users.id],
    }),
}));
exports.gcashVerificationQueueRelations = (0, drizzle_orm_1.relations)(exports.gcashVerificationQueue, ({ one }) => ({
    proof: one(exports.paymentProofs, {
        fields: [exports.gcashVerificationQueue.proofAttachmentId],
        references: [exports.paymentProofs.id],
    }),
    subscriber: one(subscribers_1.subscribers, {
        fields: [exports.gcashVerificationQueue.subscriberId],
        references: [subscribers_1.subscribers.id],
    }),
    verifier: one(security_1.users, {
        fields: [exports.gcashVerificationQueue.verifiedBy],
        references: [security_1.users.id],
    }),
}));
