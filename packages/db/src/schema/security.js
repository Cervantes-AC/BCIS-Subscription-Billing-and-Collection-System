"use strict";
/**
 * BCIS Database Schema - Security Tables
 * Users, roles, permissions, and RBAC
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionsRelations = exports.userRolesRelations = exports.rolePermissionsRelations = exports.permissionsRelations = exports.rolesRelations = exports.usersRelations = exports.sessions = exports.userRoles = exports.rolePermissions = exports.permissions = exports.roles = exports.users = exports.permissionModuleEnum = exports.userStatusEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
// ============================================
// Enums
// ============================================
exports.userStatusEnum = (0, pg_core_1.pgEnum)('user_status', ['active', 'inactive']);
exports.permissionModuleEnum = (0, pg_core_1.pgEnum)('permission_module', [
    'subscribers',
    'plans',
    'billing',
    'payments',
    'collections',
    'receivables',
    'services',
    'reports',
    'administration',
    'system',
]);
// ============================================
// Tables
// ============================================
exports.users = (0, pg_core_1.pgTable)('users', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    username: (0, pg_core_1.varchar)('username', { length: 50 }).notNull().unique(),
    email: (0, pg_core_1.varchar)('email', { length: 255 }).notNull().unique(),
    passwordHash: (0, pg_core_1.varchar)('password_hash', { length: 255 }).notNull(),
    fullName: (0, pg_core_1.varchar)('full_name', { length: 200 }).notNull(),
    roleId: (0, pg_core_1.uuid)('role_id').notNull(),
    status: (0, exports.userStatusEnum)('status').default('active').notNull(),
    lastLoginAt: (0, pg_core_1.timestamp)('last_login_at', { withTimezone: true }),
    failedLoginAttempts: (0, pg_core_1.integer)('failed_login_attempts').default(0).notNull(),
    lockedUntil: (0, pg_core_1.timestamp)('locked_until', { withTimezone: true }),
    passwordChangedAt: (0, pg_core_1.timestamp)('password_changed_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    usernameIdx: (0, pg_core_1.uniqueIndex)('users_username_idx').on(table.username),
    emailIdx: (0, pg_core_1.uniqueIndex)('users_email_idx').on(table.email),
    roleIdx: (0, pg_core_1.index)('users_role_idx').on(table.roleId),
    statusIdx: (0, pg_core_1.index)('users_status_idx').on(table.status),
}));
exports.roles = (0, pg_core_1.pgTable)('roles', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.varchar)('name', { length: 50 }).notNull().unique(),
    description: (0, pg_core_1.text)('description'),
    isSystem: (0, pg_core_1.boolean)('is_system').default(false).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    nameIdx: (0, pg_core_1.uniqueIndex)('roles_name_idx').on(table.name),
}));
exports.permissions = (0, pg_core_1.pgTable)('permissions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    code: (0, pg_core_1.varchar)('code', { length: 100 }).notNull().unique(),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
    description: (0, pg_core_1.text)('description'),
    module: (0, exports.permissionModuleEnum)('module').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    codeIdx: (0, pg_core_1.uniqueIndex)('permissions_code_idx').on(table.code),
    moduleIdx: (0, pg_core_1.index)('permissions_module_idx').on(table.module),
}));
exports.rolePermissions = (0, pg_core_1.pgTable)('role_permissions', {
    roleId: (0, pg_core_1.uuid)('role_id')
        .notNull()
        .references(() => exports.roles.id, { onDelete: 'cascade' }),
    permissionId: (0, pg_core_1.uuid)('permission_id')
        .notNull()
        .references(() => exports.permissions.id, { onDelete: 'cascade' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    pk: (0, pg_core_1.uniqueIndex)('role_permissions_pk').on(table.roleId, table.permissionId),
}));
exports.userRoles = (0, pg_core_1.pgTable)('user_roles', {
    userId: (0, pg_core_1.uuid)('user_id')
        .notNull()
        .references(() => exports.users.id, { onDelete: 'cascade' }),
    roleId: (0, pg_core_1.uuid)('role_id')
        .notNull()
        .references(() => exports.roles.id, { onDelete: 'cascade' }),
    assignedAt: (0, pg_core_1.timestamp)('assigned_at', { withTimezone: true }).defaultNow().notNull(),
    assignedBy: (0, pg_core_1.uuid)('assigned_by').references(() => exports.users.id),
}, (table) => ({
    pk: (0, pg_core_1.uniqueIndex)('user_roles_pk').on(table.userId, table.roleId),
}));
exports.sessions = (0, pg_core_1.pgTable)('sessions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id')
        .notNull()
        .references(() => exports.users.id, { onDelete: 'cascade' }),
    accessToken: (0, pg_core_1.varchar)('access_token', { length: 500 }).notNull(),
    refreshToken: (0, pg_core_1.varchar)('refresh_token', { length: 500 }).notNull(),
    accessTokenExpiresAt: (0, pg_core_1.timestamp)('access_token_expires_at', { withTimezone: true }).notNull(),
    refreshTokenExpiresAt: (0, pg_core_1.timestamp)('refresh_token_expires_at', { withTimezone: true }).notNull(),
    ipAddress: (0, pg_core_1.varchar)('ip_address', { length: 45 }),
    userAgent: (0, pg_core_1.text)('user_agent'),
    isRevoked: (0, pg_core_1.boolean)('is_revoked').default(false).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    userIdx: (0, pg_core_1.index)('sessions_user_idx').on(table.userId),
    accessTokenIdx: (0, pg_core_1.uniqueIndex)('sessions_access_token_idx').on(table.accessToken),
    refreshTokenIdx: (0, pg_core_1.uniqueIndex)('sessions_refresh_token_idx').on(table.refreshToken),
    expiresIdx: (0, pg_core_1.index)('sessions_expires_idx').on(table.accessTokenExpiresAt),
}));
// ============================================
// Relations
// ============================================
exports.usersRelations = (0, drizzle_orm_1.relations)(exports.users, ({ one, many }) => ({
    role: one(exports.roles, {
        fields: [exports.users.roleId],
        references: [exports.roles.id],
    }),
    userRoles: many(exports.userRoles),
    sessions: many(exports.sessions),
    assignedUserRoles: many(exports.userRoles, { relationName: 'assignedBy' }),
}));
exports.rolesRelations = (0, drizzle_orm_1.relations)(exports.roles, ({ many }) => ({
    users: many(exports.users),
    rolePermissions: many(exports.rolePermissions),
    userRoles: many(exports.userRoles),
}));
exports.permissionsRelations = (0, drizzle_orm_1.relations)(exports.permissions, ({ many }) => ({
    rolePermissions: many(exports.rolePermissions),
}));
exports.rolePermissionsRelations = (0, drizzle_orm_1.relations)(exports.rolePermissions, ({ one }) => ({
    role: one(exports.roles, {
        fields: [exports.rolePermissions.roleId],
        references: [exports.roles.id],
    }),
    permission: one(exports.permissions, {
        fields: [exports.rolePermissions.permissionId],
        references: [exports.permissions.id],
    }),
}));
exports.userRolesRelations = (0, drizzle_orm_1.relations)(exports.userRoles, ({ one }) => ({
    user: one(exports.users, {
        fields: [exports.userRoles.userId],
        references: [exports.users.id],
    }),
    role: one(exports.roles, {
        fields: [exports.userRoles.roleId],
        references: [exports.roles.id],
    }),
    assignedByUser: one(exports.users, {
        fields: [exports.userRoles.assignedBy],
        references: [exports.users.id],
        relationName: 'assignedBy',
    }),
}));
exports.sessionsRelations = (0, drizzle_orm_1.relations)(exports.sessions, ({ one }) => ({
    user: one(exports.users, {
        fields: [exports.sessions.userId],
        references: [exports.users.id],
    }),
}));
