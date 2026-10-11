/**
 * BCIS Database Schema - Subscriber Tables
 * Subscribers, addresses, contacts
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  uniqueIndex,
  index,
  pgEnum,
  date,
  numeric,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './security';

// ============================================
// Enums
// ============================================

export const subscriberStatusEnum = pgEnum('subscriber_status', [
  'active',
  'inactive',
  'terminated',
  'archived',
]);

export const addressTypeEnum = pgEnum('address_type', ['billing', 'installation', 'mailing']);

// ============================================
// Tables
// ============================================

export const subscribers = pgTable(
  'subscribers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountNumber: varchar('account_number', { length: 50 }).notNull().unique(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    middleName: varchar('middle_name', { length: 100 }),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    contactNumber: varchar('contact_number', { length: 20 }).notNull(),
    email: varchar('email', { length: 255 }),
    status: subscriberStatusEnum('status').default('active').notNull(),
    billingDay: integer('billing_day').default(1).notNull(),
    collectionAreaId: uuid('collection_area_id'),
    collectorId: uuid('collector_id').references(() => users.id),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (table) => ({
    accountNumberIdx: uniqueIndex('subscribers_account_number_idx').on(table.accountNumber),
    contactNumberIdx: index('subscribers_contact_number_idx').on(table.contactNumber),
    nameIdx: index('subscribers_name_idx').on(table.lastName, table.firstName),
    statusIdx: index('subscribers_status_idx').on(table.status),
    areaIdx: index('subscribers_area_idx').on(table.collectionAreaId),
    collectorIdx: index('subscribers_collector_idx').on(table.collectorId),
  })
);

export const subscriberAddresses = pgTable(
  'subscriber_addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id, { onDelete: 'cascade' }),
    type: addressTypeEnum('type').notNull(),
    street: varchar('street', { length: 255 }).notNull(),
    barangay: varchar('barangay', { length: 100 }).notNull(),
    city: varchar('city', { length: 100 }).notNull(),
    province: varchar('province', { length: 100 }).notNull(),
    zipCode: varchar('zip_code', { length: 4 }).notNull(),
    isPrimary: boolean('is_primary').default(false).notNull(),
    latitude: numeric('latitude', { precision: 10, scale: 8 }),
    longitude: numeric('longitude', { precision: 11, scale: 8 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    subscriberIdx: index('subscriber_addresses_subscriber_idx').on(table.subscriberId),
    primaryIdx: index('subscriber_addresses_primary_idx').on(table.subscriberId, table.isPrimary),
  })
);

export const subscriberContacts = pgTable(
  'subscriber_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(), // mobile, landline, email, emergency
    value: varchar('value', { length: 255 }).notNull(),
    isPrimary: boolean('is_primary').default(false).notNull(),
    isVerified: boolean('is_verified').default(false).notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    subscriberIdx: index('subscriber_contacts_subscriber_idx').on(table.subscriberId),
  })
);

// ============================================
// Relations
// ============================================

export const subscribersRelations = relations(subscribers, ({ one, many }) => ({
  collector: one(users, {
    fields: [subscribers.collectorId],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [subscribers.createdBy],
    references: [users.id],
  }),
  updater: one(users, {
    fields: [subscribers.updatedBy],
    references: [users.id],
  }),
  addresses: many(subscriberAddresses),
  contacts: many(subscriberContacts),
  serviceAccounts: many(serviceAccounts),
  payments: many(payments),
}));

export const subscriberAddressesRelations = relations(subscriberAddresses, ({ one }) => ({
  subscriber: one(subscribers, {
    fields: [subscriberAddresses.subscriberId],
    references: [subscribers.id],
  }),
}));

export const subscriberContactsRelations = relations(subscriberContacts, ({ one }) => ({
  subscriber: one(subscribers, {
    fields: [subscriberContacts.subscriberId],
    references: [subscribers.id],
  }),
}));

// Need to import serviceAccounts and payments from other files
import { serviceAccounts } from './services';
import { payments } from './payments';

// ============================================
// Types
// ============================================

export type Subscriber = typeof subscribers.$inferSelect;
export type NewSubscriber = typeof subscribers.$inferInsert;
export type SubscriberAddress = typeof subscriberAddresses.$inferSelect;
export type NewSubscriberAddress = typeof subscriberAddresses.$inferInsert;
export type SubscriberContact = typeof subscriberContacts.$inferSelect;
export type NewSubscriberContact = typeof subscriberContacts.$inferInsert;