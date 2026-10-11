/**
 * Admin routes - Fully implemented
 */

import { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { UUIDSchema, PaginationSchema, CreateBackupRequestSchema, RestoreBackupRequestSchema, UpdateSettingRequestSchema } from '@bcis/shared';
import { db } from '../plugins/database';
import { applicationSettings, auditLogs, backupHistory, roles, permissions, rolePermissions, users, sessions } from '@bcis/db/schema';
import { eq, and, or, ilike, inArray, desc, asc, count, gte, lte } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

export async function adminRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  // Settings
  app.get('/settings', {
    schema: { querystring: z.object({ publicOnly: z.boolean().default(false) }) },
    preHandler: fastify.authorize('admin.settings'),
  }, async (request, reply) => {
    const query = request.query as any;
    const conditions = query.publicOnly ? [eq(applicationSettings.isPublic, true)] : [];
    const settings = await db.query.applicationSettings.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: asc(applicationSettings.key),
      with: { updater: true },
    });
    return { success: true, data: settings };
  });

  app.patch('/settings/:key', {
    schema: {
      params: z.object({ key: z.string() }),
      body: UpdateSettingRequestSchema,
    },
    preHandler: fastify.authorize('admin.settings'),
  }, async (request, reply) => {
    const actorId = request.user.id;
    const existing = await db.query.applicationSettings.findFirst({ where: eq(applicationSettings.key, request.params.key) });
    
    await db.update(applicationSettings)
      .set({ value: request.body.value, description: request.body.description, updatedAt: new Date() })
      .where(eq(applicationSettings.key, request.params.key));

    await db.insert(auditLogs).values({
      actorId,
      action: 'setting.update',
      entityType: 'setting',
      entityId: request.params.key,
      oldValues: existing,
      newValues: request.body,
      reason: 'Setting updated',
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });

    return { success: true, data: { message: 'Setting updated' } };
  });

  // Audit logs
  app.get('/audit-logs', {
    schema: { querystring: PaginationSchema.extend({ actorId: UUIDSchema.optional(), entityType: z.string().optional(), action: z.string().optional(), dateFrom: z.string().datetime().optional(), dateTo: z.string().datetime().optional() }) },
    preHandler: fastify.authorize('admin.audit'),
  }, async (request, reply) => {
    const query = request.query as any;
    const page = query.page || 1;
    const limit = query.limit || 50;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (query.actorId) conditions.push(eq(auditLogs.actorId, query.actorId));
    if (query.entityType) conditions.push(eq(auditLogs.entityType, query.entityType));
    if (query.action) conditions.push(eq(auditLogs.action, query.action));
    if (query.dateFrom) conditions.push(gte(auditLogs.createdAt, new Date(query.dateFrom)));
    if (query.dateTo) conditions.push(lte(auditLogs.createdAt, new Date(query.dateTo)));

    const [items, totalResult] = await Promise.all([
      db.query.auditLogs.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        limit,
        offset,
        orderBy: desc(auditLogs.createdAt),
        with: { actor: true },
      }),
      db.select({ count: count() }).from(auditLogs).where(conditions.length > 0 ? and(...conditions) : undefined),
    ]);

    return { 
      success: true, 
      data: { 
        items: items.map(log => ({ ...log, actor: log.actor ? { id: log.actor.id, username: log.actor.username, fullName: log.actor.fullName } : undefined })),
        meta: { page, limit, total: totalResult[0].count, totalPages: Math.ceil(totalResult[0].count / limit) } 
      } 
    };
  });

  // Backup
  app.get('/backups', {
    schema: { querystring: PaginationSchema },
    preHandler: fastify.authorize('admin.backup'),
  }, async (request, reply) => {
    const query = request.query as any;
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const [items, totalResult] = await Promise.all([
      db.query.backupHistory.findMany({
        limit,
        offset,
        orderBy: desc(backupHistory.startedAt),
        with: { creator: true },
      }),
      db.select({ count: count() }).from(backupHistory),
    ]);

    return { 
      success: true, 
      data: { 
        items: items.map(b => ({ ...b, fileSize: Number(b.fileSize), creator: b.creator ? { id: b.creator.id, fullName: b.creator.fullName } : undefined })),
        meta: { page, limit, total: totalResult[0].count, totalPages: Math.ceil(totalResult[0].count / limit) } 
      } 
    };
  });

  app.post('/backups', {
    schema: { body: CreateBackupRequestSchema },
    preHandler: fastify.authorize('admin.backup'),
  }, async (request, reply) => {
    const actorId = request.user.id;
    const { type = 'manual' } = request.body;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `bcis-backup-${type}-${timestamp}.dump`;
    const backupDir = path.resolve(process.cwd(), 'backups');
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const filePath = path.join(backupDir, fileName);

    // Create backup record
    const [backupRecord] = await db.insert(backupHistory).values({
      fileName,
      filePath,
      fileSize: 0,
      type,
      status: 'in_progress',
      createdBy: actorId,
    }).returning();

    try {
      // Run pg_dump
      const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/bcis_billing';
      execFileSync('pg_dump', ['--format=custom', `--file=${filePath}`, `--dbname=${dbUrl}`], { stdio: 'pipe' });

      const stats = fs.statSync(filePath);
      
      await db.update(backupHistory)
        .set({ 
          fileSize: stats.size, 
          status: 'success', 
          completedAt: new Date() 
        })
        .where(eq(backupHistory.id, backupRecord.id));

      await db.insert(auditLogs).values({
        actorId,
        action: 'backup.create',
        entityType: 'backup',
        entityId: backupRecord.id,
        newValues: { fileName, fileSize: stats.size, type },
        reason: 'Database backup created',
        ipAddress: fastify.requestIp,
        userAgent: fastify.requestHeaders?.['user-agent'],
      });

      return { success: true, data: { ...backupRecord, fileSize: stats.size, status: 'success' } };
    } catch (error) {
      await db.update(backupHistory)
        .set({ status: 'failed', errorMessage: error instanceof Error ? error.message : 'Unknown error', completedAt: new Date() })
        .where(eq(backupHistory.id, backupRecord.id));
      
      return reply.code(500).send({ success: false, error: { code: 'BACKUP_FAILED', message: 'Backup failed', statusCode: 500 } });
    }
  });

  app.post('/backups/:id/restore', {
    schema: {
      params: z.object({ id: UUIDSchema }),
      body: RestoreBackupRequestSchema,
    },
    preHandler: fastify.authorize('admin.backup'),
  }, async (request, reply) => {
    const actorId = request.user.id;
    const backup = await db.query.backupHistory.findFirst({ where: eq(backupHistory.id, request.params.id) });
    
    if (!backup) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Backup not found', statusCode: 404 } });
    }
    if (backup.status !== 'success') {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_BACKUP', message: 'Backup is not in success state', statusCode: 400 } });
    }
    if (!request.body.confirm) {
      return reply.code(400).send({ success: false, error: { code: 'CONFIRMATION_REQUIRED', message: 'Restore requires confirmation', statusCode: 400 } });
    }

    const backupDir = path.resolve(process.cwd(), 'backups');
    const backupPath = path.resolve(backup.filePath);
    if (!backupPath.startsWith(`${backupDir}${path.sep}`) || !fs.existsSync(backupPath) || !fs.statSync(backupPath).isFile()) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_BACKUP_PATH', message: 'Backup file is missing or outside the backup directory', statusCode: 400 } });
    }

    try {
      const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/bcis_billing';
      execFileSync('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--exit-on-error', `--dbname=${dbUrl}`, backupPath], { stdio: 'pipe' });

      // A restore replaces the history table too, so write the completion record after pg_restore.
      const [completedRestore] = await db.insert(backupHistory).values({
        fileName: `restore-${backup.fileName}`,
        filePath: backupPath,
        fileSize: backup.fileSize,
        type: 'restore',
        status: 'success',
        startedAt: new Date(),
        completedAt: new Date(),
        createdBy: actorId,
      }).returning();

      await db.insert(auditLogs).values({ actorId, action: 'backup.restore', entityType: 'backup', entityId: completedRestore.id,
        newValues: { restoredFrom: backup.id, fileName: backup.fileName }, reason: 'Database restored from backup',
        ipAddress: fastify.requestIp, userAgent: fastify.requestHeaders?.['user-agent'] });

      return { success: true, data: { message: 'Database restored successfully' } };
    } catch (error) {
      request.log.error({ err: error, backupId: backup.id }, 'Database restore failed');
      
      return reply.code(500).send({ success: false, error: { code: 'RESTORE_FAILED', message: 'Restore failed', statusCode: 500 } });
    }
  });

  // Roles (already in userRoutes, but keeping here for admin namespace)
  app.get('/roles', {
    preHandler: fastify.authorize('admin.role.manage'),
  }, async (request, reply) => {
    const rolesList = await db.query.roles.findMany({
      with: { rolePermissions: { with: { permission: true } } },
    });
    return { success: true, data: rolesList };
  });

  app.post('/roles', {
    schema: { body: z.object({ name: z.string().min(1).max(50), description: z.string().max(500).optional(), permissionIds: z.array(UUIDSchema).optional() }) },
    preHandler: fastify.authorize('admin.role.manage'),
  }, async (request, reply) => {
    const actorId = request.user.id;
    const { name, description, permissionIds } = request.body;

    const [role] = await db.insert(roles).values({ name, description, isSystem: false }).returning();

    if (permissionIds && permissionIds.length > 0) {
      await db.insert(rolePermissions).values(
        permissionIds.map(pid => ({ roleId: role.id, permissionId: pid }))
      );
    }

    await db.insert(auditLogs).values({
      actorId,
      action: 'role.create',
      entityType: 'role',
      entityId: role.id,
      newValues: { name, description, permissionIds },
      reason: 'Role created',
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });

    return { success: true, data: role };
  });

  app.patch('/roles/:id', {
    schema: {
      params: z.object({ id: UUIDSchema }),
      body: z.object({ name: z.string().min(1).max(50).optional(), description: z.string().max(500).optional(), permissionIds: z.array(UUIDSchema).optional() }),
    },
    preHandler: fastify.authorize('admin.role.manage'),
  }, async (request, reply) => {
    const actorId = request.user.id;
    const { name, description, permissionIds } = request.body;

    const existing = await db.query.roles.findFirst({ where: eq(roles.id, request.params.id) });
    if (!existing) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Role not found', statusCode: 404 } });
    }
    if (existing.isSystem) {
      return reply.code(400).send({ success: false, error: { code: 'SYSTEM_ROLE', message: 'Cannot modify system role', statusCode: 400 } });
    }

    await db.update(roles)
      .set({ name, description, updatedAt: new Date() })
      .where(eq(roles.id, request.params.id));

    if (permissionIds) {
      await db.delete(rolePermissions).where(eq(rolePermissions.roleId, request.params.id));
      if (permissionIds.length > 0) {
        await db.insert(rolePermissions).values(
          permissionIds.map(pid => ({ roleId: request.params.id, permissionId: pid }))
        );
      }
    }

    await db.insert(auditLogs).values({
      actorId,
      action: 'role.update',
      entityType: 'role',
      entityId: request.params.id,
      oldValues: existing,
      newValues: { name, description, permissionIds },
      reason: 'Role updated',
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });

    return { success: true, data: { message: 'Role updated' } };
  });

  // Permissions
  app.get('/permissions', {
    preHandler: fastify.authorize('admin.role.manage'),
  }, async (request, reply) => {
    const perms = await db.query.permissions.findMany({ orderBy: asc(permissions.module) });
    return { success: true, data: perms };
  });

  // User Management
  app.get('/users', {
    schema: { querystring: PaginationSchema.extend({ roleId: UUIDSchema.optional(), status: z.enum(['active', 'inactive']).optional() }) },
    preHandler: fastify.authorize('admin.user.manage'),
  }, async (request, reply) => {
    const query = request.query as any;
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (query.roleId) conditions.push(eq(users.roleId, query.roleId));
    if (query.status) conditions.push(eq(users.status, query.status));

    const [items, totalResult] = await Promise.all([
      db.query.users.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        limit,
        offset,
        orderBy: desc(users.createdAt),
        with: { role: true },
      }),
      db.select({ count: count() }).from(users).where(conditions.length > 0 ? and(...conditions) : undefined),
    ]);

    return {
      success: true,
      data: {
        items: items.map(u => ({ ...u, passwordHash: undefined })),
        meta: { page, limit, total: totalResult[0].count, totalPages: Math.ceil(totalResult[0].count / limit) }
      }
    };
  });

  app.get('/users/:id', {
    schema: { params: z.object({ id: UUIDSchema }) },
    preHandler: fastify.authorize('admin.user.manage'),
  }, async (request, reply) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, request.params.id),
      with: { role: { with: { rolePermissions: { with: { permission: true } } } } },
    });
    if (!user) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found', statusCode: 404 } });
    }
    return { success: true, data: { ...user, passwordHash: undefined } };
  });

  app.post('/users', {
    schema: { body: z.object({ username: z.string().min(3).max(50), email: z.string().email(), password: z.string().min(8).max(128), fullName: z.string().min(1).max(200), roleId: UUIDSchema, status: z.enum(['active', 'inactive']).default('active') }) },
    preHandler: fastify.authorize('admin.user.manage'),
  }, async (request, reply) => {
    const actorId = request.user.id;
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(request.body.password, 12);

    const [user] = await db.insert(users).values({
      ...request.body,
      passwordHash,
    }).returning();

    await db.insert(auditLogs).values({
      actorId,
      action: 'user.create',
      entityType: 'user',
      entityId: user.id,
      newValues: { username: user.username, email: user.email, fullName: user.fullName, roleId: user.roleId },
      reason: 'User created',
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });

    return { success: true, data: { ...user, passwordHash: undefined } };
  });

  app.patch('/users/:id', {
    schema: {
      params: z.object({ id: UUIDSchema }),
      body: z.object({ email: z.string().email().optional(), fullName: z.string().min(1).max(200).optional(), roleId: UUIDSchema.optional(), status: z.enum(['active', 'inactive']).optional() }),
    },
    preHandler: fastify.authorize('admin.user.manage'),
  }, async (request, reply) => {
    const actorId = request.user.id;
    const existing = await db.query.users.findFirst({ where: eq(users.id, request.params.id) });
    if (!existing) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found', statusCode: 404 } });
    }

    await db.update(users)
      .set({ ...request.body, updatedAt: new Date() })
      .where(eq(users.id, request.params.id));

    await db.insert(auditLogs).values({
      actorId,
      action: 'user.update',
      entityType: 'user',
      entityId: request.params.id,
      oldValues: existing,
      newValues: request.body,
      reason: 'User updated',
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });

    return { success: true, data: { message: 'User updated' } };
  });

  app.post('/users/:id/reset-password', {
    schema: {
      params: z.object({ id: UUIDSchema }),
      body: z.object({ newPassword: z.string().min(8).max(128) }),
    },
    preHandler: fastify.authorize('admin.user.manage'),
  }, async (request, reply) => {
    const actorId = request.user.id;
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(request.body.newPassword, 12);

    await db.update(users)
      .set({ passwordHash, passwordChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, request.params.id));

    // Revoke all sessions
    await db.update(sessions)
      .set({ isRevoked: true })
      .where(eq(sessions.userId, request.params.id));

    await db.insert(auditLogs).values({
      actorId,
      action: 'user.reset_password',
      entityType: 'user',
      entityId: request.params.id,
      reason: 'Password reset by admin',
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });

    return { success: true, data: { message: 'Password reset successfully' } };
  });

  app.delete('/users/:id', {
    schema: { params: z.object({ id: UUIDSchema }) },
    preHandler: fastify.authorize('admin.user.manage'),
  }, async (request, reply) => {
    const actorId = request.user.id;
    const existing = await db.query.users.findFirst({ where: eq(users.id, request.params.id) });
    if (!existing) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found', statusCode: 404 } });
    }
    if (existing.id === actorId) {
      return reply.code(400).send({ success: false, error: { code: 'SELF_DELETE', message: 'Cannot delete yourself', statusCode: 400 } });
    }

    // Soft delete - set status to inactive
    await db.update(users)
      .set({ status: 'inactive', updatedAt: new Date() })
      .where(eq(users.id, request.params.id));

    // Revoke sessions
    await db.update(sessions)
      .set({ isRevoked: true })
      .where(eq(sessions.userId, request.params.id));

    await db.insert(auditLogs).values({
      actorId,
      action: 'user.delete',
      entityType: 'user',
      entityId: request.params.id,
      oldValues: existing,
      reason: 'User deactivated',
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });

    return { success: true, data: { message: 'User deactivated' } };
  });
}
