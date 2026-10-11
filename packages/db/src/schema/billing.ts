/**
 * BCIS Database Schema - Billing Tables
 * Billing cycles, invoices, invoice items, adjustments
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
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './security';
import { serviceAccounts } from './services';

// ============================================
// Enums
// ============================================

export const billingCycleStatusEnum = pgEnum('billing_cycle_status', [
  'open',
  'generating',
  'finalized',
  'closed',
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'unpaid',
  'partially_paid',
  'paid',
  'overdue',
  'void',
  'credited',
]);

export const invoiceItemTypeEnum = pgEnum('invoice_item_type', [
  'subscription',
  'installation',
  'reconnection',
  'discount',
  'penalty',
  'adjustment',
]);

// ============================================
// Tables
// ============================================

export const billingCycles = pgTable(
  'billing_cycles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    dueDate: date('due_date').notNull(),
    status: billingCycleStatusEnum('status').default('open').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    generatedBy: uuid('generated_by').references(() => users.id),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    finalizedBy: uuid('finalized_by').references(() => users.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    periodIdx: uniqueIndex('billing_cycles_period_idx').on(table.periodStart, table.periodEnd),
    statusIdx: index('billing_cycles_status_idx').on(table.status),
    dueDateIdx: index('billing_cycles_due_date_idx').on(table.dueDate),
  })
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceNumber: varchar('invoice_number', { length: 50 }).notNull().unique(),
    serviceAccountId: uuid('service_account_id')
      .notNull()
      .references(() => serviceAccounts.id, { onDelete: 'restrict' }),
    billingCycleId: uuid('billing_cycle_id')
      .notNull()
      .references(() => billingCycles.id, { onDelete: 'restrict' }),
    status: invoiceStatusEnum('status').default('draft').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    dueDate: date('due_date').notNull(),
    subscriptionCharge: integer('subscription_charge').notNull(), // in centavos
    installationFee: integer('installation_fee').default(0).notNull(),
    reconnectionFee: integer('reconnection_fee').default(0).notNull(),
    discount: integer('discount').default(0).notNull(),
    penalty: integer('penalty').default(0).notNull(),
    adjustments: integer('adjustments').default(0).notNull(),
    totalAmount: integer('total_amount').notNull(), // in centavos
    paidAmount: integer('paid_amount').default(0).notNull(),
    balance: integer('balance').notNull(), // in centavos
    notes: text('notes'),
    generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
    generatedBy: uuid('generated_by').notNull().references(() => users.id),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    finalizedBy: uuid('finalized_by').references(() => users.id),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => users.id),
    voidReason: text('void_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    invoiceNumberIdx: uniqueIndex('invoices_invoice_number_idx').on(table.invoiceNumber),
    serviceAccountIdx: index('invoices_service_account_idx').on(table.serviceAccountId),
    billingCycleIdx: index('invoices_billing_cycle_idx').on(table.billingCycleId),
    statusIdx: index('invoices_status_idx').on(table.status),
    dueDateIdx: index('invoices_due_date_idx').on(table.dueDate),
    periodIdx: index('invoices_period_idx').on(table.periodStart, table.periodEnd),
    // Prevent duplicate billing for same service account and billing cycle
    uniqueServiceBilling: uniqueIndex('invoices_unique_service_billing_idx').on(
      table.serviceAccountId,
      table.billingCycleId
    ),
  })
);

export const invoiceItems = pgTable(
  'invoice_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    description: varchar('description', { length: 255 }).notNull(),
    quantity: integer('quantity').default(1).notNull(),
    unitPrice: integer('unit_price').notNull(), // in centavos
    amount: integer('amount').notNull(), // in centavos
    type: invoiceItemTypeEnum('type').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    invoiceIdx: index('invoice_items_invoice_idx').on(table.invoiceId),
  })
);

export const adjustments = pgTable(
  'adjustments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'restrict' }),
    type: varchar('type', { length: 50 }).notNull(), // discount, penalty, write_off, credit
    amount: integer('amount').notNull(), // in centavos (positive for debit, negative for credit)
    reason: text('reason').notNull(),
    referenceNumber: varchar('reference_number', { length: 100 }),
    approvedBy: uuid('approved_by').notNull().references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    invoiceIdx: index('adjustments_invoice_idx').on(table.invoiceId),
    approvedByIdx: index('adjustments_approved_by_idx').on(table.approvedBy),
  })
);

// ============================================
// Relations
// ============================================

export const billingCyclesRelations = relations(billingCycles, ({ one, many }) => ({
  generator: one(users, {
    fields: [billingCycles.generatedBy],
    references: [users.id],
  }),
  finalizer: one(users, {
    fields: [billingCycles.finalizedBy],
    references: [users.id],
  }),
  closer: one(users, {
    fields: [billingCycles.closedBy],
    references: [users.id],
  }),
  invoices: many(invoices),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  serviceAccount: one(serviceAccounts, {
    fields: [invoices.serviceAccountId],
    references: [serviceAccounts.id],
  }),
  billingCycle: one(billingCycles, {
    fields: [invoices.billingCycleId],
    references: [billingCycles.id],
  }),
  generator: one(users, {
    fields: [invoices.generatedBy],
    references: [users.id],
  }),
  finalizer: one(users, {
    fields: [invoices.finalizedBy],
    references: [users.id],
  }),
  voider: one(users, {
    fields: [invoices.voidedBy],
    references: [users.id],
  }),
  items: many(invoiceItems),
  adjustments: many(adjustments),
  allocations: many(paymentAllocations),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
}));

export const adjustmentsRelations = relations(adjustments, ({ one }) => ({
  invoice: one(invoices, {
    fields: [adjustments.invoiceId],
    references: [invoices.id],
  }),
  approver: one(users, {
    fields: [adjustments.approvedBy],
    references: [users.id],
  }),
}));

// Need to import from payments
import { paymentAllocations } from './payments';

// ============================================
// Types
// ============================================

export type BillingCycle = typeof billingCycles.$inferSelect;
export type NewBillingCycle = typeof billingCycles.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type NewInvoiceItem = typeof invoiceItems.$inferInsert;
export type Adjustment = typeof adjustments.$inferSelect;
export type NewAdjustment = typeof adjustments.$inferInsert;
