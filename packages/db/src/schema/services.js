"use strict";
/**
 * BCIS Database Schema - Services Tables
 * Plans, service accounts, service types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceEventsRelations = exports.serviceAccountsRelations = exports.servicePlansRelations = exports.serviceEvents = exports.serviceAccounts = exports.servicePlans = exports.serviceAccountStatusEnum = exports.serviceTypeEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const security_1 = require("./security");
const subscribers_1 = require("./subscribers");
// ============================================
// Enums
// ============================================
exports.serviceTypeEnum = (0, pg_core_1.pgEnum)('service_type', ['internet', 'cable', 'combo']);
exports.serviceAccountStatusEnum = (0, pg_core_1.pgEnum)('service_account_status', [
    'active',
    'suspended',
    'disconnected',
    'pending_installation',
]);
// ============================================
// Tables
// ============================================
exports.servicePlans = (0, pg_core_1.pgTable)('service_plans', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    code: (0, pg_core_1.varchar)('code', { length: 20 }).notNull().unique(),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
    description: (0, pg_core_1.text)('description'),
    type: (0, exports.serviceTypeEnum)('type').notNull(),
    monthlyRate: (0, pg_core_1.integer)('monthly_rate').notNull(), // in centavos
    installationFee: (0, pg_core_1.integer)('installation_fee').default(0).notNull(),
    reconnectionFee: (0, pg_core_1.integer)('reconnection_fee').default(0).notNull(),
    // Internet specific
    speedMbps: (0, pg_core_1.integer)('speed_mbps'),
    dataCapGb: (0, pg_core_1.integer)('data_cap_gb'),
    // Cable specific
    channelCount: (0, pg_core_1.integer)('channel_count'),
    hdChannelCount: (0, pg_core_1.integer)('hd_channel_count'),
    isActive: (0, pg_core_1.boolean)('is_active').default(true).notNull(),
    effectiveFrom: (0, pg_core_1.date)('effective_from').notNull(),
    effectiveTo: (0, pg_core_1.date)('effective_to'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => security_1.users.id),
    updatedBy: (0, pg_core_1.uuid)('updated_by').references(() => security_1.users.id),
}, (table) => ({
    codeIdx: (0, pg_core_1.uniqueIndex)('service_plans_code_idx').on(table.code),
    typeIdx: (0, pg_core_1.index)('service_plans_type_idx').on(table.type),
    activeIdx: (0, pg_core_1.index)('service_plans_active_idx').on(table.isActive),
    effectiveIdx: (0, pg_core_1.index)('service_plans_effective_idx').on(table.effectiveFrom, table.effectiveTo),
}));
exports.serviceAccounts = (0, pg_core_1.pgTable)('service_accounts', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    accountNumber: (0, pg_core_1.varchar)('account_number', { length: 50 }).notNull().unique(),
    subscriberId: (0, pg_core_1.uuid)('subscriber_id')
        .notNull()
        .references(() => subscribers_1.subscribers.id, { onDelete: 'restrict' }),
    planId: (0, pg_core_1.uuid)('plan_id')
        .notNull()
        .references(() => exports.servicePlans.id, { onDelete: 'restrict' }),
    installationAddressId: (0, pg_core_1.uuid)('installation_address_id')
        .notNull()
        .references(() => subscribers_1.subscriberAddresses.id, { onDelete: 'restrict' }),
    status: (0, exports.serviceAccountStatusEnum)('status').default('pending_installation').notNull(),
    activationDate: (0, pg_core_1.date)('activation_date').notNull(),
    billingStartDate: (0, pg_core_1.date)('billing_start_date').notNull(),
    billingDay: (0, pg_core_1.integer)('billing_day').default(1).notNull(),
    currentRate: (0, pg_core_1.integer)('current_rate'), // in centavos, overrides plan rate
    collectorId: (0, pg_core_1.uuid)('collector_id').references(() => security_1.users.id),
    suspensionReason: (0, pg_core_1.text)('suspension_reason'),
    suspendedAt: (0, pg_core_1.timestamp)('suspended_at', { withTimezone: true }),
    suspendedBy: (0, pg_core_1.uuid)('suspended_by').references(() => security_1.users.id),
    disconnectedAt: (0, pg_core_1.timestamp)('disconnected_at', { withTimezone: true }),
    disconnectedBy: (0, pg_core_1.uuid)('disconnected_by').references(() => security_1.users.id),
    disconnectReason: (0, pg_core_1.text)('disconnect_reason'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => security_1.users.id),
    updatedBy: (0, pg_core_1.uuid)('updated_by').references(() => security_1.users.id),
}, (table) => ({
    accountNumberIdx: (0, pg_core_1.uniqueIndex)('service_accounts_account_number_idx').on(table.accountNumber),
    subscriberIdx: (0, pg_core_1.index)('service_accounts_subscriber_idx').on(table.subscriberId),
    planIdx: (0, pg_core_1.index)('service_accounts_plan_idx').on(table.planId),
    statusIdx: (0, pg_core_1.index)('service_accounts_status_idx').on(table.status),
    collectorIdx: (0, pg_core_1.index)('service_accounts_collector_idx').on(table.collectorId),
    addressIdx: (0, pg_core_1.index)('service_accounts_address_idx').on(table.installationAddressId),
}));
exports.serviceEvents = (0, pg_core_1.pgTable)('service_events', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    serviceAccountId: (0, pg_core_1.uuid)('service_account_id')
        .notNull()
        .references(() => exports.serviceAccounts.id, { onDelete: 'cascade' }),
    type: (0, pg_core_1.varchar)('type', { length: 50 }).notNull(), // installation, suspension, reconnection, disconnection, plan_change, address_change
    description: (0, pg_core_1.text)('description'),
    previousValue: (0, pg_core_1.text)('previous_value'),
    newValue: (0, pg_core_1.text)('new_value'),
    performedBy: (0, pg_core_1.uuid)('performed_by').references(() => security_1.users.id),
    performedAt: (0, pg_core_1.timestamp)('performed_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: (0, pg_core_1.jsonb)('metadata'),
}, (table) => ({
    serviceAccountIdx: (0, pg_core_1.index)('service_events_service_account_idx').on(table.serviceAccountId),
    typeIdx: (0, pg_core_1.index)('service_events_type_idx').on(table.type),
    performedAtIdx: (0, pg_core_1.index)('service_events_performed_at_idx').on(table.performedAt),
}));
// ============================================
// Relations
// ============================================
exports.servicePlansRelations = (0, drizzle_orm_1.relations)(exports.servicePlans, ({ one, many }) => ({
    creator: one(security_1.users, {
        fields: [exports.servicePlans.createdBy],
        references: [security_1.users.id],
    }),
    updater: one(security_1.users, {
        fields: [exports.servicePlans.updatedBy],
        references: [security_1.users.id],
    }),
    serviceAccounts: many(exports.serviceAccounts),
}));
exports.serviceAccountsRelations = (0, drizzle_orm_1.relations)(exports.serviceAccounts, ({ one, many }) => ({
    subscriber: one(subscribers_1.subscribers, {
        fields: [exports.serviceAccounts.subscriberId],
        references: [subscribers_1.subscribers.id],
    }),
    plan: one(exports.servicePlans, {
        fields: [exports.serviceAccounts.planId],
        references: [exports.servicePlans.id],
    }),
    installationAddress: one(subscribers_1.subscriberAddresses, {
        fields: [exports.serviceAccounts.installationAddressId],
        references: [subscribers_1.subscriberAddresses.id],
    }),
    collector: one(security_1.users, {
        fields: [exports.serviceAccounts.collectorId],
        references: [security_1.users.id],
    }),
    suspender: one(security_1.users, {
        fields: [exports.serviceAccounts.suspendedBy],
        references: [security_1.users.id],
    }),
    disconnecter: one(security_1.users, {
        fields: [exports.serviceAccounts.disconnectedBy],
        references: [security_1.users.id],
    }),
    creator: one(security_1.users, {
        fields: [exports.serviceAccounts.createdBy],
        references: [security_1.users.id],
    }),
    updater: one(security_1.users, {
        fields: [exports.serviceAccounts.updatedBy],
        references: [security_1.users.id],
    }),
    invoices: many(billing_1.invoices),
    serviceEvents: many(exports.serviceEvents),
    suspensionRecords: many(operations_1.suspensionRecords),
    reconnectionRecords: many(operations_1.reconnectionRecords),
    collectionBatchAccounts: many(collections_1.collectionBatchAccounts),
}));
exports.serviceEventsRelations = (0, drizzle_orm_1.relations)(exports.serviceEvents, ({ one }) => ({
    serviceAccount: one(exports.serviceAccounts, {
        fields: [exports.serviceEvents.serviceAccountId],
        references: [exports.serviceAccounts.id],
    }),
    performer: one(security_1.users, {
        fields: [exports.serviceEvents.performedBy],
        references: [security_1.users.id],
    }),
}));
// Need to import from other files
const billing_1 = require("./billing");
const operations_1 = require("./operations");
const collections_1 = require("./collections");
