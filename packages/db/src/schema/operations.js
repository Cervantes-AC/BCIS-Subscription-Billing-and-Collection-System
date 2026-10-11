"use strict";
/**
 * BCIS Database Schema - Operations Tables
 * Suspension, reconnection, receipts, audit logs, settings, backup history
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.backupHistoryRelations = exports.applicationSettingsRelations = exports.auditLogsRelations = exports.receiptsRelations = exports.reconnectionRecordsRelations = exports.suspensionRecordsRelations = exports.backupHistory = exports.applicationSettings = exports.auditLogs = exports.receipts = exports.reconnectionRecords = exports.suspensionRecords = exports.reconnectionStatusEnum = exports.suspensionReasonEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const security_1 = require("./security");
const services_1 = require("./services");
const payments_1 = require("./payments");
// ============================================
// Enums
// ============================================
exports.suspensionReasonEnum = (0, pg_core_1.pgEnum)('suspension_reason', [
    'non_payment',
    'request',
    'violation',
    'technical',
    'other',
]);
exports.reconnectionStatusEnum = (0, pg_core_1.pgEnum)('reconnection_status', [
    'pending',
    'scheduled',
    'completed',
    'cancelled',
]);
// ============================================
// Tables
// ============================================
exports.suspensionRecords = (0, pg_core_1.pgTable)('suspension_records', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    serviceAccountId: (0, pg_core_1.uuid)('service_account_id')
        .notNull()
        .references(() => services_1.serviceAccounts.id, { onDelete: 'restrict' }),
    reason: (0, exports.suspensionReasonEnum)('reason').notNull(),
    customReason: (0, pg_core_1.text)('custom_reason'),
    effectiveDate: (0, pg_core_1.date)('effective_date').notNull(),
    approvedBy: (0, pg_core_1.uuid)('approved_by').notNull().references(() => security_1.users.id),
    notes: (0, pg_core_1.text)('notes'),
    liftedAt: (0, pg_core_1.timestamp)('lifted_at', { withTimezone: true }),
    liftedBy: (0, pg_core_1.uuid)('lifted_by').references(() => security_1.users.id),
    liftReason: (0, pg_core_1.text)('lift_reason'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    serviceAccountIdx: (0, pg_core_1.index)('suspension_records_service_account_idx').on(table.serviceAccountId),
    effectiveDateIdx: (0, pg_core_1.index)('suspension_records_effective_date_idx').on(table.effectiveDate),
    approvedByIdx: (0, pg_core_1.index)('suspension_records_approved_by_idx').on(table.approvedBy),
}));
exports.reconnectionRecords = (0, pg_core_1.pgTable)('reconnection_records', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    suspensionId: (0, pg_core_1.uuid)('suspension_id')
        .notNull()
        .references(() => exports.suspensionRecords.id, { onDelete: 'restrict' }),
    serviceAccountId: (0, pg_core_1.uuid)('service_account_id')
        .notNull()
        .references(() => services_1.serviceAccounts.id, { onDelete: 'restrict' }),
    requestDate: (0, pg_core_1.timestamp)('request_date', { withTimezone: true }).defaultNow().notNull(),
    requestedBy: (0, pg_core_1.uuid)('requested_by').notNull().references(() => security_1.users.id),
    fee: (0, pg_core_1.integer)('fee').default(0).notNull(), // in centavos
    paymentId: (0, pg_core_1.uuid)('payment_id').references(() => payments_1.payments.id),
    technicianId: (0, pg_core_1.uuid)('technician_id').references(() => security_1.users.id),
    scheduledDate: (0, pg_core_1.timestamp)('scheduled_date', { withTimezone: true }),
    completedDate: (0, pg_core_1.timestamp)('completed_date', { withTimezone: true }),
    status: (0, exports.reconnectionStatusEnum)('status').default('pending').notNull(),
    notes: (0, pg_core_1.text)('notes'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    suspensionIdx: (0, pg_core_1.uniqueIndex)('reconnection_records_suspension_idx').on(table.suspensionId),
    serviceAccountIdx: (0, pg_core_1.index)('reconnection_records_service_account_idx').on(table.serviceAccountId),
    statusIdx: (0, pg_core_1.index)('reconnection_records_status_idx').on(table.status),
    technicianIdx: (0, pg_core_1.index)('reconnection_records_technician_idx').on(table.technicianId),
    scheduledDateIdx: (0, pg_core_1.index)('reconnection_records_scheduled_date_idx').on(table.scheduledDate),
}));
exports.receipts = (0, pg_core_1.pgTable)('receipts', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    receiptNumber: (0, pg_core_1.varchar)('receipt_number', { length: 50 }).notNull().unique(),
    paymentId: (0, pg_core_1.uuid)('payment_id')
        .notNull()
        .references(() => payments_1.payments.id, { onDelete: 'restrict' }),
    template: (0, pg_core_1.varchar)('template', { length: 50 }).default('standard').notNull(),
    generatedAt: (0, pg_core_1.timestamp)('generated_at', { withTimezone: true }).defaultNow().notNull(),
    generatedBy: (0, pg_core_1.uuid)('generated_by').notNull().references(() => security_1.users.id),
    printedCount: (0, pg_core_1.integer)('printed_count').default(0).notNull(),
    lastPrintedAt: (0, pg_core_1.timestamp)('last_printed_at', { withTimezone: true }),
    lastPrintedBy: (0, pg_core_1.uuid)('last_printed_by').references(() => security_1.users.id),
    voidedAt: (0, pg_core_1.timestamp)('voided_at', { withTimezone: true }),
    voidedBy: (0, pg_core_1.uuid)('voided_by').references(() => security_1.users.id),
    voidReason: (0, pg_core_1.text)('void_reason'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    receiptNumberIdx: (0, pg_core_1.uniqueIndex)('receipts_receipt_number_idx').on(table.receiptNumber),
    paymentIdx: (0, pg_core_1.uniqueIndex)('receipts_payment_idx').on(table.paymentId),
    generatedByIdx: (0, pg_core_1.index)('receipts_generated_by_idx').on(table.generatedBy),
}));
exports.auditLogs = (0, pg_core_1.pgTable)('audit_logs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    actorId: (0, pg_core_1.uuid)('actor_id').references(() => security_1.users.id),
    action: (0, pg_core_1.varchar)('action', { length: 100 }).notNull(),
    entityType: (0, pg_core_1.varchar)('entity_type', { length: 100 }).notNull(),
    entityId: (0, pg_core_1.uuid)('entity_id').notNull(),
    oldValues: (0, pg_core_1.jsonb)('old_values'),
    newValues: (0, pg_core_1.jsonb)('new_values'),
    reason: (0, pg_core_1.text)('reason'),
    ipAddress: (0, pg_core_1.varchar)('ip_address', { length: 45 }),
    userAgent: (0, pg_core_1.text)('user_agent'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    actorIdx: (0, pg_core_1.index)('audit_logs_actor_idx').on(table.actorId),
    entityIdx: (0, pg_core_1.index)('audit_logs_entity_idx').on(table.entityType, table.entityId),
    actionIdx: (0, pg_core_1.index)('audit_logs_action_idx').on(table.action),
    createdAtIdx: (0, pg_core_1.index)('audit_logs_created_at_idx').on(table.createdAt),
}));
exports.applicationSettings = (0, pg_core_1.pgTable)('application_settings', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    key: (0, pg_core_1.varchar)('key', { length: 100 }).notNull().unique(),
    value: (0, pg_core_1.text)('value').notNull(),
    description: (0, pg_core_1.text)('description'),
    isPublic: (0, pg_core_1.boolean)('is_public').default(false).notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
    updatedBy: (0, pg_core_1.uuid)('updated_by').notNull().references(() => security_1.users.id),
}, (table) => ({
    keyIdx: (0, pg_core_1.uniqueIndex)('application_settings_key_idx').on(table.key),
}));
exports.backupHistory = (0, pg_core_1.pgTable)('backup_history', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    fileName: (0, pg_core_1.varchar)('file_name', { length: 255 }).notNull(),
    filePath: (0, pg_core_1.varchar)('file_path', { length: 500 }).notNull(),
    fileSize: (0, pg_core_1.integer)('file_size').notNull(),
    type: (0, pg_core_1.varchar)('type', { length: 20 }).notNull(), // full, incremental, manual, scheduled
    status: (0, pg_core_1.varchar)('status', { length: 20 }).notNull(), // success, failed, in_progress
    startedAt: (0, pg_core_1.timestamp)('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: (0, pg_core_1.timestamp)('completed_at', { withTimezone: true }),
    errorMessage: (0, pg_core_1.text)('error_message'),
    createdBy: (0, pg_core_1.uuid)('created_by').notNull().references(() => security_1.users.id),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    createdByIdx: (0, pg_core_1.index)('backup_history_created_by_idx').on(table.createdBy),
    startedAtIdx: (0, pg_core_1.index)('backup_history_started_at_idx').on(table.startedAt),
    statusIdx: (0, pg_core_1.index)('backup_history_status_idx').on(table.status),
}));
// ============================================
// Relations
// ============================================
exports.suspensionRecordsRelations = (0, drizzle_orm_1.relations)(exports.suspensionRecords, ({ one, many }) => ({
    serviceAccount: one(services_1.serviceAccounts, {
        fields: [exports.suspensionRecords.serviceAccountId],
        references: [services_1.serviceAccounts.id],
    }),
    approver: one(security_1.users, {
        fields: [exports.suspensionRecords.approvedBy],
        references: [security_1.users.id],
    }),
    lifter: one(security_1.users, {
        fields: [exports.suspensionRecords.liftedBy],
        references: [security_1.users.id],
    }),
    reconnectionRecords: many(exports.reconnectionRecords),
}));
exports.reconnectionRecordsRelations = (0, drizzle_orm_1.relations)(exports.reconnectionRecords, ({ one }) => ({
    suspension: one(exports.suspensionRecords, {
        fields: [exports.reconnectionRecords.suspensionId],
        references: [exports.suspensionRecords.id],
    }),
    serviceAccount: one(services_1.serviceAccounts, {
        fields: [exports.reconnectionRecords.serviceAccountId],
        references: [services_1.serviceAccounts.id],
    }),
    requester: one(security_1.users, {
        fields: [exports.reconnectionRecords.requestedBy],
        references: [security_1.users.id],
    }),
    payment: one(payments_1.payments, {
        fields: [exports.reconnectionRecords.paymentId],
        references: [payments_1.payments.id],
    }),
    technician: one(security_1.users, {
        fields: [exports.reconnectionRecords.technicianId],
        references: [security_1.users.id],
    }),
}));
exports.receiptsRelations = (0, drizzle_orm_1.relations)(exports.receipts, ({ one }) => ({
    payment: one(payments_1.payments, {
        fields: [exports.receipts.paymentId],
        references: [payments_1.payments.id],
    }),
    generator: one(security_1.users, {
        fields: [exports.receipts.generatedBy],
        references: [security_1.users.id],
    }),
    lastPrinter: one(security_1.users, {
        fields: [exports.receipts.lastPrintedBy],
        references: [security_1.users.id],
    }),
    voider: one(security_1.users, {
        fields: [exports.receipts.voidedBy],
        references: [security_1.users.id],
    }),
}));
exports.auditLogsRelations = (0, drizzle_orm_1.relations)(exports.auditLogs, ({ one }) => ({
    actor: one(security_1.users, {
        fields: [exports.auditLogs.actorId],
        references: [security_1.users.id],
    }),
}));
exports.applicationSettingsRelations = (0, drizzle_orm_1.relations)(exports.applicationSettings, ({ one }) => ({
    updater: one(security_1.users, {
        fields: [exports.applicationSettings.updatedBy],
        references: [security_1.users.id],
    }),
}));
exports.backupHistoryRelations = (0, drizzle_orm_1.relations)(exports.backupHistory, ({ one }) => ({
    creator: one(security_1.users, {
        fields: [exports.backupHistory.createdBy],
        references: [security_1.users.id],
    }),
}));
