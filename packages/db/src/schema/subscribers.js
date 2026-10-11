"use strict";
/**
 * BCIS Database Schema - Subscriber Tables
 * Subscribers, addresses, contacts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriberContactsRelations = exports.subscriberAddressesRelations = exports.subscribersRelations = exports.subscriberContacts = exports.subscriberAddresses = exports.subscribers = exports.addressTypeEnum = exports.subscriberStatusEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const security_1 = require("./security");
// ============================================
// Enums
// ============================================
exports.subscriberStatusEnum = (0, pg_core_1.pgEnum)('subscriber_status', [
    'active',
    'inactive',
    'terminated',
    'archived',
]);
exports.addressTypeEnum = (0, pg_core_1.pgEnum)('address_type', ['billing', 'installation', 'mailing']);
// ============================================
// Tables
// ============================================
exports.subscribers = (0, pg_core_1.pgTable)('subscribers', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    accountNumber: (0, pg_core_1.varchar)('account_number', { length: 50 }).notNull().unique(),
    firstName: (0, pg_core_1.varchar)('first_name', { length: 100 }).notNull(),
    middleName: (0, pg_core_1.varchar)('middle_name', { length: 100 }),
    lastName: (0, pg_core_1.varchar)('last_name', { length: 100 }).notNull(),
    contactNumber: (0, pg_core_1.varchar)('contact_number', { length: 20 }).notNull(),
    email: (0, pg_core_1.varchar)('email', { length: 255 }),
    status: (0, exports.subscriberStatusEnum)('status').default('active').notNull(),
    billingDay: (0, pg_core_1.integer)('billing_day').default(1).notNull(),
    collectionAreaId: (0, pg_core_1.uuid)('collection_area_id'),
    collectorId: (0, pg_core_1.uuid)('collector_id').references(() => security_1.users.id),
    notes: (0, pg_core_1.text)('notes'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => security_1.users.id),
    updatedBy: (0, pg_core_1.uuid)('updated_by').references(() => security_1.users.id),
}, (table) => ({
    accountNumberIdx: (0, pg_core_1.uniqueIndex)('subscribers_account_number_idx').on(table.accountNumber),
    contactNumberIdx: (0, pg_core_1.index)('subscribers_contact_number_idx').on(table.contactNumber),
    nameIdx: (0, pg_core_1.index)('subscribers_name_idx').on(table.lastName, table.firstName),
    statusIdx: (0, pg_core_1.index)('subscribers_status_idx').on(table.status),
    areaIdx: (0, pg_core_1.index)('subscribers_area_idx').on(table.collectionAreaId),
    collectorIdx: (0, pg_core_1.index)('subscribers_collector_idx').on(table.collectorId),
}));
exports.subscriberAddresses = (0, pg_core_1.pgTable)('subscriber_addresses', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    subscriberId: (0, pg_core_1.uuid)('subscriber_id')
        .notNull()
        .references(() => exports.subscribers.id, { onDelete: 'cascade' }),
    type: (0, exports.addressTypeEnum)('type').notNull(),
    street: (0, pg_core_1.varchar)('street', { length: 255 }).notNull(),
    barangay: (0, pg_core_1.varchar)('barangay', { length: 100 }).notNull(),
    city: (0, pg_core_1.varchar)('city', { length: 100 }).notNull(),
    province: (0, pg_core_1.varchar)('province', { length: 100 }).notNull(),
    zipCode: (0, pg_core_1.varchar)('zip_code', { length: 4 }).notNull(),
    isPrimary: (0, pg_core_1.boolean)('is_primary').default(false).notNull(),
    latitude: (0, pg_core_1.numeric)('latitude', { precision: 10, scale: 8 }),
    longitude: (0, pg_core_1.numeric)('longitude', { precision: 11, scale: 8 }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    subscriberIdx: (0, pg_core_1.index)('subscriber_addresses_subscriber_idx').on(table.subscriberId),
    primaryIdx: (0, pg_core_1.index)('subscriber_addresses_primary_idx').on(table.subscriberId, table.isPrimary),
}));
exports.subscriberContacts = (0, pg_core_1.pgTable)('subscriber_contacts', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    subscriberId: (0, pg_core_1.uuid)('subscriber_id')
        .notNull()
        .references(() => exports.subscribers.id, { onDelete: 'cascade' }),
    type: (0, pg_core_1.varchar)('type', { length: 50 }).notNull(), // mobile, landline, email, emergency
    value: (0, pg_core_1.varchar)('value', { length: 255 }).notNull(),
    isPrimary: (0, pg_core_1.boolean)('is_primary').default(false).notNull(),
    isVerified: (0, pg_core_1.boolean)('is_verified').default(false).notNull(),
    verifiedAt: (0, pg_core_1.timestamp)('verified_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    subscriberIdx: (0, pg_core_1.index)('subscriber_contacts_subscriber_idx').on(table.subscriberId),
}));
// ============================================
// Relations
// ============================================
exports.subscribersRelations = (0, drizzle_orm_1.relations)(exports.subscribers, ({ one, many }) => ({
    collector: one(security_1.users, {
        fields: [exports.subscribers.collectorId],
        references: [security_1.users.id],
    }),
    creator: one(security_1.users, {
        fields: [exports.subscribers.createdBy],
        references: [security_1.users.id],
    }),
    updater: one(security_1.users, {
        fields: [exports.subscribers.updatedBy],
        references: [security_1.users.id],
    }),
    addresses: many(exports.subscriberAddresses),
    contacts: many(exports.subscriberContacts),
    serviceAccounts: many(services_1.serviceAccounts),
    payments: many(payments_1.payments),
}));
exports.subscriberAddressesRelations = (0, drizzle_orm_1.relations)(exports.subscriberAddresses, ({ one }) => ({
    subscriber: one(exports.subscribers, {
        fields: [exports.subscriberAddresses.subscriberId],
        references: [exports.subscribers.id],
    }),
}));
exports.subscriberContactsRelations = (0, drizzle_orm_1.relations)(exports.subscriberContacts, ({ one }) => ({
    subscriber: one(exports.subscribers, {
        fields: [exports.subscriberContacts.subscriberId],
        references: [exports.subscribers.id],
    }),
}));
// Need to import serviceAccounts and payments from other files
const services_1 = require("./services");
const payments_1 = require("./payments");
