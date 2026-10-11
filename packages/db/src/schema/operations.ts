/**
 * BCIS Database Schema - Operations Tables
 * Suspension, reconnection, receipts, audit logs, settings, backup history
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
import { payments } from './payments';

// ============================================
// Enums
// ============================================

export const suspensionReasonEnum = pgEnum('suspension_reason', [
  'non_payment',
  'request',
  'violation',
  'technical',
  'other',
]);

export const reconnectionStatusEnum = pgEnum('reconnection_status', [
  'pending',
  'scheduled',
  'completed',
  'cancelled',
]);

// ============================================
// Tables
// ============================================

export const suspensionRecords = pgTable(
  'suspension_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serviceAccountId: uuid('service_account_id')
      .notNull()
      .references(() => serviceAccounts.id, { onDelete: 'restrict' }),
    reason: suspensionReasonEnum('reason').notNull(),
    customReason: text('custom_reason'),
    effectiveDate: date('effective_date').notNull(),
    approvedBy: uuid('approved_by').notNull().references(() => users.id),
    notes: text('notes'),
    liftedAt: timestamp('lifted_at', { withTimezone: true }),
    liftedBy: uuid('lifted_by').references(() => users.id),
    liftReason: text('lift_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    serviceAccountIdx: index('suspension_records_service_account_idx').on(table.serviceAccountId),
    effectiveDateIdx: index('suspension_records_effective_date_idx').on(table.effectiveDate),
    approvedByIdx: index('suspension_records_approved_by_idx').on(table.approvedBy),
  })
);

export const reconnectionRecords = pgTable(
  'reconnection_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    suspensionId: uuid('suspension_id')
      .notNull()
      .references(() => suspensionRecords.id, { onDelete: 'restrict' }),
    serviceAccountId: uuid('service_account_id')
      .notNull()
      .references(() => serviceAccounts.id, { onDelete: 'restrict' }),
    requestDate: timestamp('request_date', { withTimezone: true }).defaultNow().notNull(),
    requestedBy: uuid('requested_by').notNull().references(() => users.id),
    fee: integer('fee').default(0).notNull(), // in centavos
    paymentId: uuid('payment_id').references(() => payments.id),
    technicianId: uuid('technician_id').references(() => users.id),
    scheduledDate: timestamp('scheduled_date', { withTimezone: true }),
    completedDate: timestamp('completed_date', { withTimezone: true }),
    status: reconnectionStatusEnum('status').default('pending').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    suspensionIdx: uniqueIndex('reconnection_records_suspension_idx').on(table.suspensionId),
    serviceAccountIdx: index('reconnection_records_service_account_idx').on(table.serviceAccountId),
    statusIdx: index('reconnection_records_status_idx').on(table.status),
    technicianIdx: index('reconnection_records_technician_idx').on(table.technicianId),
    scheduledDateIdx: index('reconnection_records_scheduled_date_idx').on(table.scheduledDate),
  })
);

export const receipts = pgTable(
  'receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    receiptNumber: varchar('receipt_number', { length: 50 }).notNull().unique(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),
    template: varchar('template', { length: 50 }).default('standard').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
    generatedBy: uuid('generated_by').notNull().references(() => users.id),
    printedCount: integer('printed_count').default(0).notNull(),
    lastPrintedAt: timestamp('last_printed_at', { withTimezone: true }),
    lastPrintedBy: uuid('last_printed_by').references(() => users.id),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => users.id),
    voidReason: text('void_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    receiptNumberIdx: uniqueIndex('receipts_receipt_number_idx').on(table.receiptNumber),
    paymentIdx: uniqueIndex('receipts_payment_idx').on(table.paymentId),
    generatedByIdx: index('receipts_generated_by_idx').on(table.generatedBy),
  })
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id),
    action: varchar('action', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    oldValues: jsonb('old_values'),
    newValues: jsonb('new_values'),
    reason: text('reason'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    actorIdx: index('audit_logs_actor_idx').on(table.actorId),
    entityIdx: index('audit_logs_entity_idx').on(table.entityType, table.entityId),
    actionIdx: index('audit_logs_action_idx').on(table.action),
    createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
  })
);

export const applicationSettings = pgTable(
  'application_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 100 }).notNull().unique(),
    value: text('value').notNull(),
    description: text('description'),
    isPublic: boolean('is_public').default(false).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    updatedBy: uuid('updated_by').notNull().references(() => users.id),
  },
  (table) => ({
    keyIdx: uniqueIndex('application_settings_key_idx').on(table.key),
  })
);

export const backupHistory = pgTable(
  'backup_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    filePath: varchar('file_path', { length: 500 }).notNull(),
    fileSize: integer('file_size').notNull(),
    type: varchar('type', { length: 20 }).notNull(), // full, incremental, manual, scheduled
    status: varchar('status', { length: 20 }).notNull(), // success, failed, in_progress
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    createdByIdx: index('backup_history_created_by_idx').on(table.createdBy),
    startedAtIdx: index('backup_history_started_at_idx').on(table.startedAt),
    statusIdx: index('backup_history_status_idx').on(table.status),
  })
);

// ============================================
// Relations
// ============================================

export const suspensionRecordsRelations = relations(suspensionRecords, ({ one, many }) => ({
  serviceAccount: one(serviceAccounts, {
    fields: [suspensionRecords.serviceAccountId],
    references: [serviceAccounts.id],
  }),
  approver: one(users, {
    fields: [suspensionRecords.approvedBy],
    references: [users.id],
  }),
  lifter: one(users, {
    fields: [suspensionRecords.liftedBy],
    references: [users.id],
  }),
  reconnectionRecords: many(reconnectionRecords),
}));

export const reconnectionRecordsRelations = relations(reconnectionRecords, ({ one }) => ({
  suspension: one(suspensionRecords, {
    fields: [reconnectionRecords.suspensionId],
    references: [suspensionRecords.id],
  }),
  serviceAccount: one(serviceAccounts, {
    fields: [reconnectionRecords.serviceAccountId],
    references: [serviceAccounts.id],
  }),
  requester: one(users, {
    fields: [reconnectionRecords.requestedBy],
    references: [users.id],
  }),
  payment: one(payments, {
    fields: [reconnectionRecords.paymentId],
    references: [payments.id],
  }),
  technician: one(users, {
    fields: [reconnectionRecords.technicianId],
    references: [users.id],
  }),
}));

export const receiptsRelations = relations(receipts, ({ one }) => ({
  payment: one(payments, {
    fields: [receipts.paymentId],
    references: [payments.id],
  }),
  generator: one(users, {
    fields: [receipts.generatedBy],
    references: [users.id],
  }),
  lastPrinter: one(users, {
    fields: [receipts.lastPrintedBy],
    references: [users.id],
  }),
  voider: one(users, {
    fields: [receipts.voidedBy],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [auditLogs.actorId],
    references: [users.id],
  }),
}));

export const applicationSettingsRelations = relations(applicationSettings, ({ one }) => ({
  updater: one(users, {
    fields: [applicationSettings.updatedBy],
    references: [users.id],
  }),
}));

export const backupHistoryRelations = relations(backupHistory, ({ one }) => ({
  creator: one(users, {
    fields: [backupHistory.createdBy],
    references: [users.id],
  }),
}));

// ============================================
// Types
// ============================================

export type SuspensionRecord = typeof suspensionRecords.$inferSelect;
export type NewSuspensionRecord = typeof suspensionRecords.$inferInsert;
export type ReconnectionRecord = typeof reconnectionRecords.$inferSelect;
export type NewReconnectionRecord = typeof reconnectionRecords.$inferInsert;
export type Receipt = typeof receipts.$inferSelect;
export type NewReceipt = typeof receipts.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type ApplicationSetting = typeof applicationSettings.$inferSelect;
export type NewApplicationSetting = typeof applicationSettings.$inferInsert;
export type BackupHistory = typeof backupHistory.$inferSelect;
export type NewBackupHistory = typeof backupHistory.$inferInsert;
