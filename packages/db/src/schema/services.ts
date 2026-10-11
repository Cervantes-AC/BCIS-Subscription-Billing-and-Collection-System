/**
 * BCIS Database Schema - Services Tables
 * Plans, service accounts, service types
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
import { subscribers, subscriberAddresses } from './subscribers';

// ============================================
// Enums
// ============================================

export const serviceTypeEnum = pgEnum('service_type', ['internet', 'cable', 'combo']);
export const serviceAccountStatusEnum = pgEnum('service_account_status', [
  'active',
  'suspended',
  'disconnected',
  'pending_installation',
]);

// ============================================
// Tables
// ============================================

export const servicePlans = pgTable(
  'service_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 20 }).notNull().unique(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    type: serviceTypeEnum('type').notNull(),
    monthlyRate: integer('monthly_rate').notNull(), // in centavos
    installationFee: integer('installation_fee').default(0).notNull(),
    reconnectionFee: integer('reconnection_fee').default(0).notNull(),
    // Internet specific
    speedMbps: integer('speed_mbps'),
    dataCapGb: integer('data_cap_gb'),
    // Cable specific
    channelCount: integer('channel_count'),
    hdChannelCount: integer('hd_channel_count'),
    isActive: boolean('is_active').default(true).notNull(),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (table) => ({
    codeIdx: uniqueIndex('service_plans_code_idx').on(table.code),
    typeIdx: index('service_plans_type_idx').on(table.type),
    activeIdx: index('service_plans_active_idx').on(table.isActive),
    effectiveIdx: index('service_plans_effective_idx').on(table.effectiveFrom, table.effectiveTo),
  })
);

export const serviceAccounts = pgTable(
  'service_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountNumber: varchar('account_number', { length: 50 }).notNull().unique(),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id, { onDelete: 'restrict' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => servicePlans.id, { onDelete: 'restrict' }),
    installationAddressId: uuid('installation_address_id')
      .notNull()
      .references(() => subscriberAddresses.id, { onDelete: 'restrict' }),
    status: serviceAccountStatusEnum('status').default('pending_installation').notNull(),
    activationDate: date('activation_date').notNull(),
    billingStartDate: date('billing_start_date').notNull(),
    billingDay: integer('billing_day').default(1).notNull(),
    currentRate: integer('current_rate'), // in centavos, overrides plan rate
    collectorId: uuid('collector_id').references(() => users.id),
    suspensionReason: text('suspension_reason'),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspendedBy: uuid('suspended_by').references(() => users.id),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
    disconnectedBy: uuid('disconnected_by').references(() => users.id),
    disconnectReason: text('disconnect_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (table) => ({
    accountNumberIdx: uniqueIndex('service_accounts_account_number_idx').on(table.accountNumber),
    subscriberIdx: index('service_accounts_subscriber_idx').on(table.subscriberId),
    planIdx: index('service_accounts_plan_idx').on(table.planId),
    statusIdx: index('service_accounts_status_idx').on(table.status),
    collectorIdx: index('service_accounts_collector_idx').on(table.collectorId),
    addressIdx: index('service_accounts_address_idx').on(table.installationAddressId),
  })
);

export const serviceEvents = pgTable(
  'service_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serviceAccountId: uuid('service_account_id')
      .notNull()
      .references(() => serviceAccounts.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(), // installation, suspension, reconnection, disconnection, plan_change, address_change
    description: text('description'),
    previousValue: text('previous_value'),
    newValue: text('new_value'),
    performedBy: uuid('performed_by').references(() => users.id),
    performedAt: timestamp('performed_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata'),
  },
  (table) => ({
    serviceAccountIdx: index('service_events_service_account_idx').on(table.serviceAccountId),
    typeIdx: index('service_events_type_idx').on(table.type),
    performedAtIdx: index('service_events_performed_at_idx').on(table.performedAt),
  })
);

// ============================================
// Relations
// ============================================

export const servicePlansRelations = relations(servicePlans, ({ one, many }) => ({
  creator: one(users, {
    fields: [servicePlans.createdBy],
    references: [users.id],
  }),
  updater: one(users, {
    fields: [servicePlans.updatedBy],
    references: [users.id],
  }),
  serviceAccounts: many(serviceAccounts),
}));

export const serviceAccountsRelations = relations(serviceAccounts, ({ one, many }) => ({
  subscriber: one(subscribers, {
    fields: [serviceAccounts.subscriberId],
    references: [subscribers.id],
  }),
  plan: one(servicePlans, {
    fields: [serviceAccounts.planId],
    references: [servicePlans.id],
  }),
  installationAddress: one(subscriberAddresses, {
    fields: [serviceAccounts.installationAddressId],
    references: [subscriberAddresses.id],
  }),
  collector: one(users, {
    fields: [serviceAccounts.collectorId],
    references: [users.id],
  }),
  suspender: one(users, {
    fields: [serviceAccounts.suspendedBy],
    references: [users.id],
  }),
  disconnecter: one(users, {
    fields: [serviceAccounts.disconnectedBy],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [serviceAccounts.createdBy],
    references: [users.id],
  }),
  updater: one(users, {
    fields: [serviceAccounts.updatedBy],
    references: [users.id],
  }),
  invoices: many(invoices),
  serviceEvents: many(serviceEvents),
  suspensionRecords: many(suspensionRecords),
  reconnectionRecords: many(reconnectionRecords),
  collectionBatchAccounts: many(collectionBatchAccounts),
}));

export const serviceEventsRelations = relations(serviceEvents, ({ one }) => ({
  serviceAccount: one(serviceAccounts, {
    fields: [serviceEvents.serviceAccountId],
    references: [serviceAccounts.id],
  }),
  performer: one(users, {
    fields: [serviceEvents.performedBy],
    references: [users.id],
  }),
}));

// Need to import from other files
import { invoices } from './billing';
import { suspensionRecords, reconnectionRecords } from './operations';
import { collectionBatchAccounts } from './collections';

// ============================================
// Types
// ============================================

export type ServicePlan = typeof servicePlans.$inferSelect;
export type NewServicePlan = typeof servicePlans.$inferInsert;
export type ServiceAccount = typeof serviceAccounts.$inferSelect;
export type NewServiceAccount = typeof serviceAccounts.$inferInsert;
export type ServiceEvent = typeof serviceEvents.$inferSelect;
export type NewServiceEvent = typeof serviceEvents.$inferInsert;
