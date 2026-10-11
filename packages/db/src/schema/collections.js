"use strict";
/**
 * BCIS Database Schema - Collections Tables
 * Collection areas, collectors, batches, remittances
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectorRemittancesRelations = exports.collectionBatchAccountsRelations = exports.collectionBatchesRelations = exports.collectorAssignmentsRelations = exports.collectionAreasRelations = exports.collectorRemittances = exports.collectionBatchAccounts = exports.collectionBatches = exports.collectorAssignments = exports.collectionAreas = exports.collectionBatchStatusEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const security_1 = require("./security");
const services_1 = require("./services");
// ============================================
// Enums
// ============================================
exports.collectionBatchStatusEnum = (0, pg_core_1.pgEnum)('collection_batch_status', [
    'open',
    'in_progress',
    'submitted',
    'remitted',
    'reconciled',
    'closed',
]);
// ============================================
// Tables
// ============================================
exports.collectionAreas = (0, pg_core_1.pgTable)('collection_areas', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    code: (0, pg_core_1.varchar)('code', { length: 20 }).notNull().unique(),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
    description: (0, pg_core_1.text)('description'),
    collectorId: (0, pg_core_1.uuid)('collector_id').references(() => security_1.users.id),
    isActive: (0, pg_core_1.boolean)('is_active').default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => security_1.users.id),
    updatedBy: (0, pg_core_1.uuid)('updated_by').references(() => security_1.users.id),
}, (table) => ({
    codeIdx: (0, pg_core_1.uniqueIndex)('collection_areas_code_idx').on(table.code),
    collectorIdx: (0, pg_core_1.index)('collection_areas_collector_idx').on(table.collectorId),
}));
exports.collectorAssignments = (0, pg_core_1.pgTable)('collector_assignments', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    collectorId: (0, pg_core_1.uuid)('collector_id')
        .notNull()
        .references(() => security_1.users.id, { onDelete: 'cascade' }),
    areaId: (0, pg_core_1.uuid)('area_id')
        .notNull()
        .references(() => exports.collectionAreas.id, { onDelete: 'cascade' }),
    assignedAt: (0, pg_core_1.timestamp)('assigned_at', { withTimezone: true }).defaultNow().notNull(),
    assignedBy: (0, pg_core_1.uuid)('assigned_by').notNull().references(() => security_1.users.id),
    isActive: (0, pg_core_1.boolean)('is_active').default(true).notNull(),
    endedAt: (0, pg_core_1.timestamp)('ended_at', { withTimezone: true }),
}, (table) => ({
    collectorAreaIdx: (0, pg_core_1.uniqueIndex)('collector_assignments_collector_area_idx').on(table.collectorId, table.areaId, table.isActive),
    collectorIdx: (0, pg_core_1.index)('collector_assignments_collector_idx').on(table.collectorId),
    areaIdx: (0, pg_core_1.index)('collector_assignments_area_idx').on(table.areaId),
}));
exports.collectionBatches = (0, pg_core_1.pgTable)('collection_batches', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    batchNumber: (0, pg_core_1.varchar)('batch_number', { length: 50 }).notNull().unique(),
    collectorId: (0, pg_core_1.uuid)('collector_id')
        .notNull()
        .references(() => security_1.users.id, { onDelete: 'restrict' }),
    areaId: (0, pg_core_1.uuid)('area_id')
        .notNull()
        .references(() => exports.collectionAreas.id, { onDelete: 'restrict' }),
    status: (0, exports.collectionBatchStatusEnum)('status').default('open').notNull(),
    collectionDate: (0, pg_core_1.date)('collection_date').notNull(),
    expectedCash: (0, pg_core_1.integer)('expected_cash').default(0).notNull(), // in centavos
    expectedNonCash: (0, pg_core_1.integer)('expected_non_cash').default(0).notNull(), // in centavos
    actualCash: (0, pg_core_1.integer)('actual_cash').default(0).notNull(), // in centavos
    actualNonCash: (0, pg_core_1.integer)('actual_non_cash').default(0).notNull(), // in centavos
    shortage: (0, pg_core_1.integer)('shortage').default(0).notNull(), // in centavos
    overage: (0, pg_core_1.integer)('overage').default(0).notNull(), // in centavos
    notes: (0, pg_core_1.text)('notes'),
    openedAt: (0, pg_core_1.timestamp)('opened_at', { withTimezone: true }).defaultNow().notNull(),
    openedBy: (0, pg_core_1.uuid)('opened_by').notNull().references(() => security_1.users.id),
    submittedAt: (0, pg_core_1.timestamp)('submitted_at', { withTimezone: true }),
    submittedBy: (0, pg_core_1.uuid)('submitted_by').references(() => security_1.users.id),
    remittedAt: (0, pg_core_1.timestamp)('remitted_at', { withTimezone: true }),
    remittedBy: (0, pg_core_1.uuid)('remitted_by').references(() => security_1.users.id),
    reconciledAt: (0, pg_core_1.timestamp)('reconciled_at', { withTimezone: true }),
    reconciledBy: (0, pg_core_1.uuid)('reconciled_by').references(() => security_1.users.id),
    closedAt: (0, pg_core_1.timestamp)('closed_at', { withTimezone: true }),
    closedBy: (0, pg_core_1.uuid)('closed_by').references(() => security_1.users.id),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    batchNumberIdx: (0, pg_core_1.uniqueIndex)('collection_batches_batch_number_idx').on(table.batchNumber),
    collectorIdx: (0, pg_core_1.index)('collection_batches_collector_idx').on(table.collectorId),
    areaIdx: (0, pg_core_1.index)('collection_batches_area_idx').on(table.areaId),
    statusIdx: (0, pg_core_1.index)('collection_batches_status_idx').on(table.status),
    collectionDateIdx: (0, pg_core_1.index)('collection_batches_collection_date_idx').on(table.collectionDate),
}));
exports.collectionBatchAccounts = (0, pg_core_1.pgTable)('collection_batch_accounts', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    batchId: (0, pg_core_1.uuid)('batch_id')
        .notNull()
        .references(() => exports.collectionBatches.id, { onDelete: 'cascade' }),
    serviceAccountId: (0, pg_core_1.uuid)('service_account_id')
        .notNull()
        .references(() => services_1.serviceAccounts.id, { onDelete: 'restrict' }),
    currentBill: (0, pg_core_1.integer)('current_bill').default(0).notNull(), // in centavos
    arrears: (0, pg_core_1.integer)('arrears').default(0).notNull(), // in centavos
    totalDue: (0, pg_core_1.integer)('total_due').default(0).notNull(), // in centavos
    collectedAmount: (0, pg_core_1.integer)('collected_amount').default(0).notNull(), // in centavos
    collectedMethod: (0, pg_core_1.varchar)('collected_method', { length: 20 }), // cash, gcash, etc.
    collectedAt: (0, pg_core_1.timestamp)('collected_at', { withTimezone: true }),
    receiptNumber: (0, pg_core_1.varchar)('receipt_number', { length: 50 }),
    paymentId: (0, pg_core_1.uuid)('payment_id').references(() => payments_1.payments.id),
    notes: (0, pg_core_1.text)('notes'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    batchIdx: (0, pg_core_1.index)('collection_batch_accounts_batch_idx').on(table.batchId),
    serviceAccountIdx: (0, pg_core_1.index)('collection_batch_accounts_service_account_idx').on(table.serviceAccountId),
    paymentIdx: (0, pg_core_1.index)('collection_batch_accounts_payment_idx').on(table.paymentId),
    receiptIdx: (0, pg_core_1.index)('collection_batch_accounts_receipt_idx').on(table.receiptNumber),
    uniqueBatchAccount: (0, pg_core_1.uniqueIndex)('collection_batch_accounts_unique_idx').on(table.batchId, table.serviceAccountId),
}));
exports.collectorRemittances = (0, pg_core_1.pgTable)('collector_remittances', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    batchId: (0, pg_core_1.uuid)('batch_id')
        .notNull()
        .references(() => exports.collectionBatches.id, { onDelete: 'cascade' }),
    collectorId: (0, pg_core_1.uuid)('collector_id')
        .notNull()
        .references(() => security_1.users.id, { onDelete: 'restrict' }),
    cashAmount: (0, pg_core_1.integer)('cash_amount').notNull(), // in centavos
    nonCashAmount: (0, pg_core_1.integer)('non_cash_amount').default(0).notNull(), // in centavos
    remittanceDate: (0, pg_core_1.date)('remittance_date').notNull(),
    remittedBy: (0, pg_core_1.uuid)('remitted_by').notNull().references(() => security_1.users.id),
    receivedBy: (0, pg_core_1.uuid)('received_by').references(() => security_1.users.id),
    notes: (0, pg_core_1.text)('notes'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    batchIdx: (0, pg_core_1.index)('collector_remittances_batch_idx').on(table.batchId),
    collectorIdx: (0, pg_core_1.index)('collector_remittances_collector_idx').on(table.collectorId),
    remittanceDateIdx: (0, pg_core_1.index)('collector_remittances_remittance_date_idx').on(table.remittanceDate),
}));
// Need to import payments
const payments_1 = require("./payments");
// ============================================
// Relations
// ============================================
exports.collectionAreasRelations = (0, drizzle_orm_1.relations)(exports.collectionAreas, ({ one, many }) => ({
    collector: one(security_1.users, {
        fields: [exports.collectionAreas.collectorId],
        references: [security_1.users.id],
    }),
    creator: one(security_1.users, {
        fields: [exports.collectionAreas.createdBy],
        references: [security_1.users.id],
    }),
    updater: one(security_1.users, {
        fields: [exports.collectionAreas.updatedBy],
        references: [security_1.users.id],
    }),
    assignments: many(exports.collectorAssignments),
    batches: many(exports.collectionBatches),
}));
exports.collectorAssignmentsRelations = (0, drizzle_orm_1.relations)(exports.collectorAssignments, ({ one }) => ({
    collector: one(security_1.users, {
        fields: [exports.collectorAssignments.collectorId],
        references: [security_1.users.id],
    }),
    area: one(exports.collectionAreas, {
        fields: [exports.collectorAssignments.areaId],
        references: [exports.collectionAreas.id],
    }),
    assigner: one(security_1.users, {
        fields: [exports.collectorAssignments.assignedBy],
        references: [security_1.users.id],
    }),
}));
exports.collectionBatchesRelations = (0, drizzle_orm_1.relations)(exports.collectionBatches, ({ one, many }) => ({
    collector: one(security_1.users, {
        fields: [exports.collectionBatches.collectorId],
        references: [security_1.users.id],
    }),
    area: one(exports.collectionAreas, {
        fields: [exports.collectionBatches.areaId],
        references: [exports.collectionAreas.id],
    }),
    opener: one(security_1.users, {
        fields: [exports.collectionBatches.openedBy],
        references: [security_1.users.id],
    }),
    submitter: one(security_1.users, {
        fields: [exports.collectionBatches.submittedBy],
        references: [security_1.users.id],
    }),
    remitter: one(security_1.users, {
        fields: [exports.collectionBatches.remittedBy],
        references: [security_1.users.id],
    }),
    reconciler: one(security_1.users, {
        fields: [exports.collectionBatches.reconciledBy],
        references: [security_1.users.id],
    }),
    closer: one(security_1.users, {
        fields: [exports.collectionBatches.closedBy],
        references: [security_1.users.id],
    }),
    accounts: many(exports.collectionBatchAccounts),
    remittances: many(exports.collectorRemittances),
}));
exports.collectionBatchAccountsRelations = (0, drizzle_orm_1.relations)(exports.collectionBatchAccounts, ({ one }) => ({
    batch: one(exports.collectionBatches, {
        fields: [exports.collectionBatchAccounts.batchId],
        references: [exports.collectionBatches.id],
    }),
    serviceAccount: one(services_1.serviceAccounts, {
        fields: [exports.collectionBatchAccounts.serviceAccountId],
        references: [services_1.serviceAccounts.id],
    }),
    payment: one(payments_1.payments, {
        fields: [exports.collectionBatchAccounts.paymentId],
        references: [payments_1.payments.id],
    }),
}));
exports.collectorRemittancesRelations = (0, drizzle_orm_1.relations)(exports.collectorRemittances, ({ one }) => ({
    batch: one(exports.collectionBatches, {
        fields: [exports.collectorRemittances.batchId],
        references: [exports.collectionBatches.id],
    }),
    collector: one(security_1.users, {
        fields: [exports.collectorRemittances.collectorId],
        references: [security_1.users.id],
    }),
    remitter: one(security_1.users, {
        fields: [exports.collectorRemittances.remittedBy],
        references: [security_1.users.id],
    }),
    receiver: one(security_1.users, {
        fields: [exports.collectorRemittances.receivedBy],
        references: [security_1.users.id],
    }),
}));
