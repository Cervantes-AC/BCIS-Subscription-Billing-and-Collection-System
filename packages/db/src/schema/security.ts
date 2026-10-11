/**
 * BCIS Database Schema - Security Tables
 * Users, roles, permissions, and RBAC
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
  integer,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================
// Enums
// ============================================

export const userStatusEnum = pgEnum('user_status', ['active', 'inactive']);
export const permissionModuleEnum = pgEnum('permission_module', [
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

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: varchar('username', { length: 50 }).notNull().unique(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    fullName: varchar('full_name', { length: 200 }).notNull(),
    roleId: uuid('role_id').notNull(),
    status: userStatusEnum('status').default('active').notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    failedLoginAttempts: integer('failed_login_attempts').default(0).notNull(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    usernameIdx: uniqueIndex('users_username_idx').on(table.username),
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
    roleIdx: index('users_role_idx').on(table.roleId),
    statusIdx: index('users_status_idx').on(table.status),
  })
);

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 50 }).notNull().unique(),
    description: text('description'),
    isSystem: boolean('is_system').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex('roles_name_idx').on(table.name),
  })
);

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 100 }).notNull().unique(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    module: permissionModuleEnum('module').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    codeIdx: uniqueIndex('permissions_code_idx').on(table.code),
    moduleIdx: index('permissions_module_idx').on(table.module),
  })
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: uniqueIndex('role_permissions_pk').on(table.roleId, table.permissionId),
  })
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
    assignedBy: uuid('assigned_by').references(() => users.id),
  },
  (table) => ({
    pk: uniqueIndex('user_roles_pk').on(table.userId, table.roleId),
  })
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: varchar('access_token', { length: 500 }).notNull(),
    refreshToken: varchar('refresh_token', { length: 500 }).notNull(),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }).notNull(),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }).notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    isRevoked: boolean('is_revoked').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('sessions_user_idx').on(table.userId),
    accessTokenIdx: uniqueIndex('sessions_access_token_idx').on(table.accessToken),
    refreshTokenIdx: uniqueIndex('sessions_refresh_token_idx').on(table.refreshToken),
    expiresIdx: index('sessions_expires_idx').on(table.accessTokenExpiresAt),
  })
);

// ============================================
// Relations
// ============================================

export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
  userRoles: many(userRoles),
  sessions: many(sessions),
  assignedUserRoles: many(userRoles, { relationName: 'assignedBy' }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
  rolePermissions: many(rolePermissions),
  userRoles: many(userRoles),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePermissions.roleId],
    references: [roles.id],
  }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
  assignedByUser: one(users, {
    fields: [userRoles.assignedBy],
    references: [users.id],
    relationName: 'assignedBy',
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

// ============================================
// Types
// ============================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type UserRole = typeof userRoles.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;