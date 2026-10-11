"use strict";
/**
 * BCIS Database Schema - Billing Tables
 * Billing cycles, invoices, invoice items, adjustments
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.adjustmentsRelations = exports.invoiceItemsRelations = exports.invoicesRelations = exports.billingCyclesRelations = exports.adjustments = exports.invoiceItems = exports.invoices = exports.billingCycles = exports.invoiceItemTypeEnum = exports.invoiceStatusEnum = exports.billingCycleStatusEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const security_1 = require("./security");
const services_1 = require("./services");
// ============================================
// Enums
// ============================================
exports.billingCycleStatusEnum = (0, pg_core_1.pgEnum)('billing_cycle_status', [
    'open',
    'generating',
    'finalized',
    'closed',
]);
exports.invoiceStatusEnum = (0, pg_core_1.pgEnum)('invoice_status', [
    'draft',
    'unpaid',
    'partially_paid',
    'paid',
    'overdue',
    'void',
    'credited',
]);
exports.invoiceItemTypeEnum = (0, pg_core_1.pgEnum)('invoice_item_type', [
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
exports.billingCycles = (0, pg_core_1.pgTable)('billing_cycles', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
    periodStart: (0, pg_core_1.date)('period_start').notNull(),
    periodEnd: (0, pg_core_1.date)('period_end').notNull(),
    dueDate: (0, pg_core_1.date)('due_date').notNull(),
    status: (0, exports.billingCycleStatusEnum)('status').default('open').notNull(),
    generatedAt: (0, pg_core_1.timestamp)('generated_at', { withTimezone: true }),
    generatedBy: (0, pg_core_1.uuid)('generated_by').references(() => security_1.users.id),
    finalizedAt: (0, pg_core_1.timestamp)('finalized_at', { withTimezone: true }),
    finalizedBy: (0, pg_core_1.uuid)('finalized_by').references(() => security_1.users.id),
    closedAt: (0, pg_core_1.timestamp)('closed_at', { withTimezone: true }),
    closedBy: (0, pg_core_1.uuid)('closed_by').references(() => security_1.users.id),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    periodIdx: (0, pg_core_1.uniqueIndex)('billing_cycles_period_idx').on(table.periodStart, table.periodEnd),
    statusIdx: (0, pg_core_1.index)('billing_cycles_status_idx').on(table.status),
    dueDateIdx: (0, pg_core_1.index)('billing_cycles_due_date_idx').on(table.dueDate),
}));
exports.invoices = (0, pg_core_1.pgTable)('invoices', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    invoiceNumber: (0, pg_core_1.varchar)('invoice_number', { length: 50 }).notNull().unique(),
    serviceAccountId: (0, pg_core_1.uuid)('service_account_id')
        .notNull()
        .references(() => services_1.serviceAccounts.id, { onDelete: 'restrict' }),
    billingCycleId: (0, pg_core_1.uuid)('billing_cycle_id')
        .notNull()
        .references(() => exports.billingCycles.id, { onDelete: 'restrict' }),
    status: (0, exports.invoiceStatusEnum)('status').default('draft').notNull(),
    periodStart: (0, pg_core_1.date)('period_start').notNull(),
    periodEnd: (0, pg_core_1.date)('period_end').notNull(),
    dueDate: (0, pg_core_1.date)('due_date').notNull(),
    subscriptionCharge: (0, pg_core_1.integer)('subscription_charge').notNull(), // in centavos
    installationFee: (0, pg_core_1.integer)('installation_fee').default(0).notNull(),
    reconnectionFee: (0, pg_core_1.integer)('reconnection_fee').default(0).notNull(),
    discount: (0, pg_core_1.integer)('discount').default(0).notNull(),
    penalty: (0, pg_core_1.integer)('penalty').default(0).notNull(),
    adjustments: (0, pg_core_1.integer)('adjustments').default(0).notNull(),
    totalAmount: (0, pg_core_1.integer)('total_amount').notNull(), // in centavos
    paidAmount: (0, pg_core_1.integer)('paid_amount').default(0).notNull(),
    balance: (0, pg_core_1.integer)('balance').notNull(), // in centavos
    notes: (0, pg_core_1.text)('notes'),
    generatedAt: (0, pg_core_1.timestamp)('generated_at', { withTimezone: true }).defaultNow().notNull(),
    generatedBy: (0, pg_core_1.uuid)('generated_by').notNull().references(() => security_1.users.id),
    finalizedAt: (0, pg_core_1.timestamp)('finalized_at', { withTimezone: true }),
    finalizedBy: (0, pg_core_1.uuid)('finalized_by').references(() => security_1.users.id),
    voidedAt: (0, pg_core_1.timestamp)('voided_at', { withTimezone: true }),
    voidedBy: (0, pg_core_1.uuid)('voided_by').references(() => security_1.users.id),
    voidReason: (0, pg_core_1.text)('void_reason'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    invoiceNumberIdx: (0, pg_core_1.uniqueIndex)('invoices_invoice_number_idx').on(table.invoiceNumber),
    serviceAccountIdx: (0, pg_core_1.index)('invoices_service_account_idx').on(table.serviceAccountId),
    billingCycleIdx: (0, pg_core_1.index)('invoices_billing_cycle_idx').on(table.billingCycleId),
    statusIdx: (0, pg_core_1.index)('invoices_status_idx').on(table.status),
    dueDateIdx: (0, pg_core_1.index)('invoices_due_date_idx').on(table.dueDate),
    periodIdx: (0, pg_core_1.index)('invoices_period_idx').on(table.periodStart, table.periodEnd),
    // Prevent duplicate billing for same service account and billing cycle
    uniqueServiceBilling: (0, pg_core_1.uniqueIndex)('invoices_unique_service_billing_idx').on(table.serviceAccountId, table.billingCycleId),
}));
exports.invoiceItems = (0, pg_core_1.pgTable)('invoice_items', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    invoiceId: (0, pg_core_1.uuid)('invoice_id')
        .notNull()
        .references(() => exports.invoices.id, { onDelete: 'cascade' }),
    description: (0, pg_core_1.varchar)('description', { length: 255 }).notNull(),
    quantity: (0, pg_core_1.integer)('quantity').default(1).notNull(),
    unitPrice: (0, pg_core_1.integer)('unit_price').notNull(), // in centavos
    amount: (0, pg_core_1.integer)('amount').notNull(), // in centavos
    type: (0, exports.invoiceItemTypeEnum)('type').notNull(),
    sortOrder: (0, pg_core_1.integer)('sort_order').default(0).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    invoiceIdx: (0, pg_core_1.index)('invoice_items_invoice_idx').on(table.invoiceId),
}));
exports.adjustments = (0, pg_core_1.pgTable)('adjustments', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    invoiceId: (0, pg_core_1.uuid)('invoice_id')
        .notNull()
        .references(() => exports.invoices.id, { onDelete: 'restrict' }),
    type: (0, pg_core_1.varchar)('type', { length: 50 }).notNull(), // discount, penalty, write_off, credit
    amount: (0, pg_core_1.integer)('amount').notNull(), // in centavos (positive for debit, negative for credit)
    reason: (0, pg_core_1.text)('reason').notNull(),
    referenceNumber: (0, pg_core_1.varchar)('reference_number', { length: 100 }),
    approvedBy: (0, pg_core_1.uuid)('approved_by').notNull().references(() => security_1.users.id),
    approvedAt: (0, pg_core_1.timestamp)('approved_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    invoiceIdx: (0, pg_core_1.index)('adjustments_invoice_idx').on(table.invoiceId),
    approvedByIdx: (0, pg_core_1.index)('adjustments_approved_by_idx').on(table.approvedBy),
}));
// ============================================
// Relations
// ============================================
exports.billingCyclesRelations = (0, drizzle_orm_1.relations)(exports.billingCycles, ({ one, many }) => ({
    generator: one(security_1.users, {
        fields: [exports.billingCycles.generatedBy],
        references: [security_1.users.id],
    }),
    finalizer: one(security_1.users, {
        fields: [exports.billingCycles.finalizedBy],
        references: [security_1.users.id],
    }),
    closer: one(security_1.users, {
        fields: [exports.billingCycles.closedBy],
        references: [security_1.users.id],
    }),
    invoices: many(exports.invoices),
}));
exports.invoicesRelations = (0, drizzle_orm_1.relations)(exports.invoices, ({ one, many }) => ({
    serviceAccount: one(services_1.serviceAccounts, {
        fields: [exports.invoices.serviceAccountId],
        references: [services_1.serviceAccounts.id],
    }),
    billingCycle: one(exports.billingCycles, {
        fields: [exports.invoices.billingCycleId],
        references: [exports.billingCycles.id],
    }),
    generator: one(security_1.users, {
        fields: [exports.invoices.generatedBy],
        references: [security_1.users.id],
    }),
    finalizer: one(security_1.users, {
        fields: [exports.invoices.finalizedBy],
        references: [security_1.users.id],
    }),
    voider: one(security_1.users, {
        fields: [exports.invoices.voidedBy],
        references: [security_1.users.id],
    }),
    items: many(exports.invoiceItems),
    adjustments: many(exports.adjustments),
    allocations: many(payments_1.paymentAllocations),
}));
exports.invoiceItemsRelations = (0, drizzle_orm_1.relations)(exports.invoiceItems, ({ one }) => ({
    invoice: one(exports.invoices, {
        fields: [exports.invoiceItems.invoiceId],
        references: [exports.invoices.id],
    }),
}));
exports.adjustmentsRelations = (0, drizzle_orm_1.relations)(exports.adjustments, ({ one }) => ({
    invoice: one(exports.invoices, {
        fields: [exports.adjustments.invoiceId],
        references: [exports.invoices.id],
    }),
    approver: one(security_1.users, {
        fields: [exports.adjustments.approvedBy],
        references: [security_1.users.id],
    }),
}));
// Need to import from payments
const payments_1 = require("./payments");
