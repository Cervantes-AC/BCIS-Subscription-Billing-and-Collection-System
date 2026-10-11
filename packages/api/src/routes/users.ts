/**
 * User management routes - Fully implemented
 */

import { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { UUIDSchema, PaginationSchema } from '@bcis/shared';
import { db } from '../plugins/database';
import { users, roles, permissions, rolePermissions, auditLogs, sessions } from '@bcis/db/schema';
import { eq, and, or, ilike, inArray, desc, asc, count } from 'drizzle-orm';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../utils/auth';
import { sortColumn } from '../utils/sort-column';

export async function userRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  // Get users with pagination
  app.get('/users', {
    schema: {
      querystring: PaginationSchema.extend({
        search: z.string().optional(),
        roleId: UUIDSchema.optional(),
        status: z.enum(['active', 'inactive']).optional(),
      }),
    },
    preHandler: fastify.authorize('admin.user.manage'),
  }, async (request, reply) => {
    const query = request.query as any;
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (query.search) {
      conditions.push(or(
        ilike(users.username, `%${query.search}%`),
        ilike(users.fullName, `%${query.search}%`),
        ilike(users.email, `%${query.search}%`)
      ));
    }
    if (query.roleId) conditions.push(eq(users.roleId, query.roleId));
    if (query.status) conditions.push(eq(users.status, query.status as any));

    const orderColumn = sortColumn({ fullName: users.fullName, username: users.username, email: users.email, status: users.status, createdAt: users.createdAt }, query.sortBy, 'fullName');
    const orderFn = query.sortOrder === 'asc' ? asc : desc;

    const [items, totalResult] = await Promise.all([
      db.query.users.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        limit,
        offset,
        orderBy: orderFn(orderColumn),
        with: { role: { with: { rolePermissions: { with: { permission: true } } } } },
      }),
      db.select({ count: count() }).from(users).where(conditions.length > 0 ? and(...conditions) : undefined),
    ]);

    return { 
      success: true, 
      data: { 
        items: items.map(u => ({
          ...u,
          passwordHash: undefined,
          role: u.role ? {
            ...u.role,
            permissions: u.role.rolePermissions?.map(rp => rp.permission) || [],
          } : undefined,
        })),
        meta: { page, limit, total: totalResult[0].count, totalPages: Math.ceil(totalResult[0].count / limit) } 
      } 
    };
  });

  // Get user by ID
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

  // Create user
  app.post('/users', {
    schema: {
      body: z.object({
        username: z.string().min(3).max(50),
        email: z.string().email(),
        password: z.string().min(8).max(128),
        fullName: z.string().min(1).max(200),
        roleId: UUIDSchema,
      }),
    },
    preHandler: fastify.authorize('admin.user.manage'),
  }, async (request, reply) => {
    const actorId = request.user.id;
    const { username, email, password, fullName, roleId } = request.body;

    // Validate password
    const validation = validatePasswordStrength(password);
    if (!validation.valid) {
      return reply.code(400).send({ success: false, error: { code: 'WEAK_PASSWORD', message: 'Password does not meet requirements', details: validation.errors, statusCode: 400 } });
    }

    // Check username/email uniqueness
    const existingUser = await db.query.users.findFirst({
      where: or(eq(users.username, username), eq(users.email, email)),
    });
    if (existingUser) {
      return reply.code(400).send({ success: false, error: { code: 'DUPLICATE', message: 'Username or email already exists', statusCode: 400 } });
    }

    const passwordHash = await hashPassword(password);

    const [user] = await db.insert(users).values({
      username,
      email,
      passwordHash,
      fullName,
      roleId,
      status: 'active',
    }).returning();

    await db.insert(auditLogs).values({
      actorId,
      action: 'user.create',
      entityType: 'user',
      entityId: user.id,
      newValues: { username, email, fullName, roleId },
      reason: 'User created',
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });

    return { success: true, data: { ...user, passwordHash: undefined } };
  });

  // Update user
  app.patch('/users/:id', {
    schema: {
      params: z.object({ id: UUIDSchema }),
      body: z.object({
        email: z.string().email().optional(),
        fullName: z.string().min(1).max(200).optional(),
        roleId: UUIDSchema.optional(),
        status: z.enum(['active', 'inactive']).optional(),
      }),
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

  // Reset user password
  app.post('/users/:id/reset-password', {
    schema: {
      params: z.object({ id: UUIDSchema }),
      body: z.object({ newPassword: z.string().min(8).max(128) }),
    },
    preHandler: fastify.authorize('admin.user.manage'),
  }, async (request, reply) => {
    const actorId = request.user.id;
    const { newPassword } = request.body;

    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      return reply.code(400).send({ success: false, error: { code: 'WEAK_PASSWORD', message: 'Password does not meet requirements', details: validation.errors, statusCode: 400 } });
    }

    const existing = await db.query.users.findFirst({ where: eq(users.id, request.params.id) });
    if (!existing) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found', statusCode: 404 } });
    }

    const passwordHash = await hashPassword(newPassword);

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

  // Delete user (soft delete - set inactive)
  app.delete('/users/:id', {
    schema: { params: z.object({ id: UUIDSchema }) },
    preHandler: fastify.authorize('admin.user.manage'),
  }, async (request, reply) => {
    const actorId = request.user.id;
    
    if (request.params.id === actorId) {
      return reply.code(400).send({ success: false, error: { code: 'SELF_DELETE', message: 'Cannot delete yourself', statusCode: 400 } });
    }

    const existing = await db.query.users.findFirst({ where: eq(users.id, request.params.id) });
    if (!existing) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found', statusCode: 404 } });
    }

    await db.update(users)
      .set({ status: 'inactive', updatedAt: new Date() })
      .where(eq(users.id, request.params.id));

    // Revoke all sessions
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
