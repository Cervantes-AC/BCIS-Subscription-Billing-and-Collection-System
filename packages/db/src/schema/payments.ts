/**
 * BCIS Database Schema - Payments Tables
 * Payments, allocations, proofs, reversals, GCash verification
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  uniqueIndex,
  index,
  pgEnum,
  date,
  jsonb,
  type AnyPgColumn,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { users } from './security';
import { subscribers } from './subscribers';
import { invoices } from './billing';

// ============================================
// Enums
// ============================================

export const paymentMethodEnum = pgEnum('payment_method', [
  'cash',
  'gcash',
  'bank_transfer',
  'cheque',
  'other',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
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

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    receiptNumber: varchar('receipt_number', { length: 50 }).notNull().unique(),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id, { onDelete: 'restrict' }),
    amount: integer('amount').notNull(), // in centavos
    method: paymentMethodEnum('method').notNull(),
    referenceNumber: varchar('reference_number', { length: 100 }),
    paymentDate: timestamp('payment_date', { withTimezone: true }).notNull(),
    postedDate: timestamp('posted_date', { withTimezone: true }).defaultNow().notNull(),
    postedBy: uuid('posted_by').notNull().references(() => users.id),
    status: paymentStatusEnum('status').default('pending').notNull(),
    notes: text('notes'),
    proofAttachmentId: uuid('proof_attachment_id'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    verifiedBy: uuid('verified_by').references(() => users.id),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectedBy: uuid('rejected_by').references(() => users.id),
    rejectReason: text('reject_reason'),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reversedBy: uuid('reversed_by').references(() => users.id),
    reverseReason: text('reverse_reason'),
    reversalPaymentId: uuid('reversal_payment_id').references((): AnyPgColumn => payments.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    receiptNumberIdx: uniqueIndex('payments_receipt_number_idx').on(table.receiptNumber),
    subscriberIdx: index('payments_subscriber_idx').on(table.subscriberId),
    methodIdx: index('payments_method_idx').on(table.method),
    statusIdx: index('payments_status_idx').on(table.status),
    paymentDateIdx: index('payments_payment_date_idx').on(table.paymentDate),
    postedByIdx: index('payments_posted_by_idx').on(table.postedBy),
    referenceNumberIdx: index('payments_reference_number_idx').on(table.referenceNumber),
    reversalIdx: index('payments_reversal_idx').on(table.reversalPaymentId),
  })
);

export const paymentAllocations = pgTable(
  'payment_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'restrict' }),
    amount: integer('amount').notNull(), // in centavos
    allocatedAt: timestamp('allocated_at', { withTimezone: true }).defaultNow().notNull(),
    allocatedBy: uuid('allocated_by').notNull().references(() => users.id),
  },
  (table) => ({
    paymentIdx: index('payment_allocations_payment_idx').on(table.paymentId),
    invoiceIdx: index('payment_allocations_invoice_idx').on(table.invoiceId),
    // Each payment-invoice pair should be unique
    uniquePaymentInvoice: uniqueIndex('payment_allocations_unique_idx').on(table.paymentId, table.invoiceId),
  })
);

/** Unapplied advance portions of posted payments, kept as an auditable subscriber balance. */
export const subscriberCredits = pgTable('subscriber_credits', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriberId: uuid('subscriber_id').notNull().references(() => subscribers.id, { onDelete: 'restrict' }),
  sourcePaymentId: uuid('source_payment_id').notNull().unique().references(() => payments.id, { onDelete: 'restrict' }),
  amount: integer('amount').notNull(),
  remainingAmount: integer('remaining_amount').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  subscriberIdx: index('subscriber_credits_subscriber_idx').on(table.subscriberId),
  remainingCheck: check('subscriber_credits_remaining_nonnegative', sql`${table.remainingAmount} >= 0`),
  amountCheck: check('subscriber_credits_amount_positive', sql`${table.amount} > 0`),
}));

export const paymentProofs = pgTable(
  'payment_proofs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id')
      .references(() => payments.id, { onDelete: 'cascade' }),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    filePath: varchar('file_path', { length: 500 }).notNull(),
    fileSize: integer('file_size').notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
    uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  },
  (table) => ({
    paymentIdx: uniqueIndex('payment_proofs_payment_idx').on(table.paymentId),
  })
);

export const paymentReversals = pgTable(
  'payment_reversals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    originalPaymentId: uuid('original_payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),
    reversalPaymentId: uuid('reversal_payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    reversedBy: uuid('reversed_by').notNull().references(() => users.id),
    reversedAt: timestamp('reversed_at', { withTimezone: true }).defaultNow().notNull(),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
  },
  (table) => ({
    originalIdx: uniqueIndex('payment_reversals_original_idx').on(table.originalPaymentId),
    reversalIdx: uniqueIndex('payment_reversals_reversal_idx').on(table.reversalPaymentId),
  })
);

export const gcashVerificationQueue = pgTable(
  'gcash_verification_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    referenceNumber: varchar('reference_number', { length: 100 }).notNull(),
    senderName: varchar('sender_name', { length: 200 }).notNull(),
    senderNumber: varchar('sender_number', { length: 20 }).notNull(),
    amount: integer('amount').notNull(), // in centavos
    transactionDate: timestamp('transaction_date', { withTimezone: true }).notNull(),
    proofAttachmentId: uuid('proof_attachment_id').notNull().references(() => paymentProofs.id),
    status: varchar('status', { length: 20 }).default('pending').notNull(), // pending, verified, rejected
    subscriberId: uuid('subscriber_id').references(() => subscribers.id),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    verifiedBy: uuid('verified_by').references(() => users.id),
    rejectReason: text('reject_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    referenceIdx: uniqueIndex('gcash_verification_reference_idx').on(table.referenceNumber),
    statusIdx: index('gcash_verification_status_idx').on(table.status),
    subscriberIdx: index('gcash_verification_subscriber_idx').on(table.subscriberId),
    transactionDateIdx: index('gcash_verification_transaction_date_idx').on(table.transactionDate),
  })
);

// ============================================
// Relations
// ============================================

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  subscriber: one(subscribers, {
    fields: [payments.subscriberId],
    references: [subscribers.id],
  }),
  poster: one(users, {
    fields: [payments.postedBy],
    references: [users.id],
  }),
  verifier: one(users, {
    fields: [payments.verifiedBy],
    references: [users.id],
  }),
  rejecter: one(users, {
    fields: [payments.rejectedBy],
    references: [users.id],
  }),
  reverser: one(users, {
    fields: [payments.reversedBy],
    references: [users.id],
  }),
  reversalPayment: one(payments, {
    fields: [payments.reversalPaymentId],
    references: [payments.id],
    relationName: 'reversal',
  }),
  originalPayment: one(payments, {
    fields: [payments.reversalPaymentId],
    references: [payments.id],
    relationName: 'original',
  }),
  proof: one(paymentProofs, {
    fields: [payments.proofAttachmentId],
    references: [paymentProofs.id],
  }),
  allocations: many(paymentAllocations),
  credits: many(subscriberCredits),
  reversals: many(paymentReversals, { relationName: 'original' }),
  reversalRecords: many(paymentReversals, { relationName: 'reversal' }),
}));

export const subscriberCreditsRelations = relations(subscriberCredits, ({ one }) => ({
  subscriber: one(subscribers, { fields: [subscriberCredits.subscriberId], references: [subscribers.id] }),
  sourcePayment: one(payments, { fields: [subscriberCredits.sourcePaymentId], references: [payments.id] }),
  creator: one(users, { fields: [subscriberCredits.createdBy], references: [users.id] }),
}));

export const paymentAllocationsRelations = relations(paymentAllocations, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentAllocations.paymentId],
    references: [payments.id],
  }),
  invoice: one(invoices, {
    fields: [paymentAllocations.invoiceId],
    references: [invoices.id],
  }),
  allocator: one(users, {
    fields: [paymentAllocations.allocatedBy],
    references: [users.id],
  }),
}));

export const paymentProofsRelations = relations(paymentProofs, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentProofs.paymentId],
    references: [payments.id],
  }),
  uploader: one(users, {
    fields: [paymentProofs.uploadedBy],
    references: [users.id],
  }),
}));

export const paymentReversalsRelations = relations(paymentReversals, ({ one }) => ({
  originalPayment: one(payments, {
    fields: [paymentReversals.originalPaymentId],
    references: [payments.id],
  }),
  reversalPayment: one(payments, {
    fields: [paymentReversals.reversalPaymentId],
    references: [payments.id],
  }),
  reverser: one(users, {
    fields: [paymentReversals.reversedBy],
    references: [users.id],
  }),
  approver: one(users, {
    fields: [paymentReversals.approvedBy],
    references: [users.id],
  }),
}));

export const gcashVerificationQueueRelations = relations(gcashVerificationQueue, ({ one }) => ({
  proof: one(paymentProofs, {
    fields: [gcashVerificationQueue.proofAttachmentId],
    references: [paymentProofs.id],
  }),
  subscriber: one(subscribers, {
    fields: [gcashVerificationQueue.subscriberId],
    references: [subscribers.id],
  }),
  verifier: one(users, {
    fields: [gcashVerificationQueue.verifiedBy],
    references: [users.id],
  }),
}));

// ============================================
// Types
// ============================================

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type PaymentAllocation = typeof paymentAllocations.$inferSelect;
export type NewPaymentAllocation = typeof paymentAllocations.$inferInsert;
export type SubscriberCredit = typeof subscriberCredits.$inferSelect;
export type NewSubscriberCredit = typeof subscriberCredits.$inferInsert;
export type PaymentProof = typeof paymentProofs.$inferSelect;
export type NewPaymentProof = typeof paymentProofs.$inferInsert;
export type PaymentReversal = typeof paymentReversals.$inferSelect;
export type NewPaymentReversal = typeof paymentReversals.$inferInsert;
export type GCashVerificationQueue = typeof gcashVerificationQueue.$inferSelect;
export type NewGCashVerificationQueue = typeof gcashVerificationQueue.$inferInsert;
