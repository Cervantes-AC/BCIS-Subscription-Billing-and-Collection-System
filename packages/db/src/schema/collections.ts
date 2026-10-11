/**
 * BCIS Database Schema - Collections Tables
 * Collection areas, collectors, batches, remittances
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
import { subscribers } from './subscribers';
import { serviceAccounts } from './services';

// ============================================
// Enums
// ============================================

export const collectionBatchStatusEnum = pgEnum('collection_batch_status', [
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

export const collectionAreas = pgTable(
  'collection_areas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 20 }).notNull().unique(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    collectorId: uuid('collector_id').references(() => users.id),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (table) => ({
    codeIdx: uniqueIndex('collection_areas_code_idx').on(table.code),
    collectorIdx: index('collection_areas_collector_idx').on(table.collectorId),
  })
);

export const collectorAssignments = pgTable(
  'collector_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    collectorId: uuid('collector_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    areaId: uuid('area_id')
      .notNull()
      .references(() => collectionAreas.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
    assignedBy: uuid('assigned_by').notNull().references(() => users.id),
    isActive: boolean('is_active').default(true).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => ({
    collectorAreaIdx: uniqueIndex('collector_assignments_collector_area_idx').on(
      table.collectorId,
      table.areaId,
      table.isActive
    ),
    collectorIdx: index('collector_assignments_collector_idx').on(table.collectorId),
    areaIdx: index('collector_assignments_area_idx').on(table.areaId),
  })
);

export const collectionBatches = pgTable(
  'collection_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchNumber: varchar('batch_number', { length: 50 }).notNull().unique(),
    collectorId: uuid('collector_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    areaId: uuid('area_id')
      .notNull()
      .references(() => collectionAreas.id, { onDelete: 'restrict' }),
    status: collectionBatchStatusEnum('status').default('open').notNull(),
    collectionDate: date('collection_date').notNull(),
    expectedCash: integer('expected_cash').default(0).notNull(), // in centavos
    expectedNonCash: integer('expected_non_cash').default(0).notNull(), // in centavos
    actualCash: integer('actual_cash').default(0).notNull(), // in centavos
    actualNonCash: integer('actual_non_cash').default(0).notNull(), // in centavos
    shortage: integer('shortage').default(0).notNull(), // in centavos
    overage: integer('overage').default(0).notNull(), // in centavos
    notes: text('notes'),
    openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
    openedBy: uuid('opened_by').notNull().references(() => users.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    submittedBy: uuid('submitted_by').references(() => users.id),
    remittedAt: timestamp('remitted_at', { withTimezone: true }),
    remittedBy: uuid('remitted_by').references(() => users.id),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
    reconciledBy: uuid('reconciled_by').references(() => users.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    batchNumberIdx: uniqueIndex('collection_batches_batch_number_idx').on(table.batchNumber),
    collectorIdx: index('collection_batches_collector_idx').on(table.collectorId),
    areaIdx: index('collection_batches_area_idx').on(table.areaId),
    statusIdx: index('collection_batches_status_idx').on(table.status),
    collectionDateIdx: index('collection_batches_collection_date_idx').on(table.collectionDate),
  })
);

export const collectionBatchAccounts = pgTable(
  'collection_batch_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => collectionBatches.id, { onDelete: 'cascade' }),
    serviceAccountId: uuid('service_account_id')
      .notNull()
      .references(() => serviceAccounts.id, { onDelete: 'restrict' }),
    currentBill: integer('current_bill').default(0).notNull(), // in centavos
    arrears: integer('arrears').default(0).notNull(), // in centavos
    totalDue: integer('total_due').default(0).notNull(), // in centavos
    collectedAmount: integer('collected_amount').default(0).notNull(), // in centavos
    collectedMethod: varchar('collected_method', { length: 20 }), // cash, gcash, etc.
    collectedAt: timestamp('collected_at', { withTimezone: true }),
    receiptNumber: varchar('receipt_number', { length: 50 }),
    paymentId: uuid('payment_id').references(() => payments.id),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    batchIdx: index('collection_batch_accounts_batch_idx').on(table.batchId),
    serviceAccountIdx: index('collection_batch_accounts_service_account_idx').on(table.serviceAccountId),
    paymentIdx: index('collection_batch_accounts_payment_idx').on(table.paymentId),
    receiptIdx: index('collection_batch_accounts_receipt_idx').on(table.receiptNumber),
    uniqueBatchAccount: uniqueIndex('collection_batch_accounts_unique_idx').on(table.batchId, table.serviceAccountId),
  })
);

export const collectorRemittances = pgTable(
  'collector_remittances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => collectionBatches.id, { onDelete: 'cascade' }),
    collectorId: uuid('collector_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    cashAmount: integer('cash_amount').notNull(), // in centavos
    nonCashAmount: integer('non_cash_amount').default(0).notNull(), // in centavos
    remittanceDate: date('remittance_date').notNull(),
    remittedBy: uuid('remitted_by').notNull().references(() => users.id),
    receivedBy: uuid('received_by').references(() => users.id),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    batchIdx: index('collector_remittances_batch_idx').on(table.batchId),
    collectorIdx: index('collector_remittances_collector_idx').on(table.collectorId),
    remittanceDateIdx: index('collector_remittances_remittance_date_idx').on(table.remittanceDate),
  })
);

// Need to import payments
import { payments } from './payments';

// ============================================
// Relations
// ============================================

export const collectionAreasRelations = relations(collectionAreas, ({ one, many }) => ({
  collector: one(users, {
    fields: [collectionAreas.collectorId],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [collectionAreas.createdBy],
    references: [users.id],
  }),
  updater: one(users, {
    fields: [collectionAreas.updatedBy],
    references: [users.id],
  }),
  assignments: many(collectorAssignments),
  batches: many(collectionBatches),
}));

export const collectorAssignmentsRelations = relations(collectorAssignments, ({ one }) => ({
  collector: one(users, {
    fields: [collectorAssignments.collectorId],
    references: [users.id],
  }),
  area: one(collectionAreas, {
    fields: [collectorAssignments.areaId],
    references: [collectionAreas.id],
  }),
  assigner: one(users, {
    fields: [collectorAssignments.assignedBy],
    references: [users.id],
  }),
}));

export const collectionBatchesRelations = relations(collectionBatches, ({ one, many }) => ({
  collector: one(users, {
    fields: [collectionBatches.collectorId],
    references: [users.id],
  }),
  area: one(collectionAreas, {
    fields: [collectionBatches.areaId],
    references: [collectionAreas.id],
  }),
  opener: one(users, {
    fields: [collectionBatches.openedBy],
    references: [users.id],
  }),
  submitter: one(users, {
    fields: [collectionBatches.submittedBy],
    references: [users.id],
  }),
  remitter: one(users, {
    fields: [collectionBatches.remittedBy],
    references: [users.id],
  }),
  reconciler: one(users, {
    fields: [collectionBatches.reconciledBy],
    references: [users.id],
  }),
  closer: one(users, {
    fields: [collectionBatches.closedBy],
    references: [users.id],
  }),
  accounts: many(collectionBatchAccounts),
  remittances: many(collectorRemittances),
}));

export const collectionBatchAccountsRelations = relations(collectionBatchAccounts, ({ one }) => ({
  batch: one(collectionBatches, {
    fields: [collectionBatchAccounts.batchId],
    references: [collectionBatches.id],
  }),
  serviceAccount: one(serviceAccounts, {
    fields: [collectionBatchAccounts.serviceAccountId],
    references: [serviceAccounts.id],
  }),
  payment: one(payments, {
    fields: [collectionBatchAccounts.paymentId],
    references: [payments.id],
  }),
}));

export const collectorRemittancesRelations = relations(collectorRemittances, ({ one }) => ({
  batch: one(collectionBatches, {
    fields: [collectorRemittances.batchId],
    references: [collectionBatches.id],
  }),
  collector: one(users, {
    fields: [collectorRemittances.collectorId],
    references: [users.id],
  }),
  remitter: one(users, {
    fields: [collectorRemittances.remittedBy],
    references: [users.id],
  }),
  receiver: one(users, {
    fields: [collectorRemittances.receivedBy],
    references: [users.id],
  }),
}));

// ============================================
// Types
// ============================================

export type CollectionArea = typeof collectionAreas.$inferSelect;
export type NewCollectionArea = typeof collectionAreas.$inferInsert;
export type CollectorAssignment = typeof collectorAssignments.$inferSelect;
export type NewCollectorAssignment = typeof collectorAssignments.$inferInsert;
export type CollectionBatch = typeof collectionBatches.$inferSelect;
export type NewCollectionBatch = typeof collectionBatches.$inferInsert;
export type CollectionBatchAccount = typeof collectionBatchAccounts.$inferSelect;
export type NewCollectionBatchAccount = typeof collectionBatchAccounts.$inferInsert;
export type CollectorRemittance = typeof collectorRemittances.$inferSelect;
export type NewCollectorRemittance = typeof collectorRemittances.$inferInsert;