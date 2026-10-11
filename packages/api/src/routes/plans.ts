/**
 * Plan routes - Fully implemented
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UUIDSchema, PaginationSchema, CreatePlanRequestSchema, UpdatePlanRequestSchema, PlanSearchSchema } from '@bcis/shared';
import { db } from '../plugins/database';
import { servicePlans, users, auditLogs } from '@bcis/db/schema';
import { eq, and, or, ilike, inArray, desc, asc, count } from 'drizzle-orm';

export async function planRoutes(fastify: FastifyInstance) {
  fastify.get('/plans', {
    schema: { querystring: PlanSearchSchema },
    preHandler: fastify.authorize('plan.view'),
  }, async (request, reply) => {
    const query = request.query as any;
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (query.query) {
      conditions.push(or(
        ilike(servicePlans.code, `%${query.query}%`),
        ilike(servicePlans.name, `%${query.query}%`)
      ));
    }
    if (query.type) conditions.push(eq(servicePlans.type, query.type as any));
    if (query.isActive !== undefined) conditions.push(eq(servicePlans.isActive, query.isActive));

    const orderColumn = servicePlans[query.sortBy as keyof typeof servicePlans] || servicePlans.name;
    const orderFn = query.sortOrder === 'asc' ? asc : desc;

    const [items, totalResult] = await Promise.all([
      db.query.servicePlans.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        limit,
        offset,
        orderBy: orderFn(orderColumn),
        with: { creator: true, updater: true },
      }),
      db.select({ count: count() }).from(servicePlans).where(conditions.length > 0 ? and(...conditions) : undefined),
    ]);

    return { 
      success: true, 
      data: { 
        items: items.map(p => ({ ...p, monthlyRate: Number(p.monthlyRate), installationFee: Number(p.installationFee), reconnectionFee: Number(p.reconnectionFee) })),
        meta: { page, limit, total: totalResult[0].count, totalPages: Math.ceil(totalResult[0].count / limit) } 
      } 
    };
  });

  fastify.get('/plans/:id', {
    schema: { params: z.object({ id: UUIDSchema }) },
    preHandler: fastify.authorize('plan.view'),
  }, async (request, reply) => {
    const plan = await db.query.servicePlans.findFirst({
      where: eq(servicePlans.id, request.params.id),
      with: { creator: true, updater: true, serviceAccounts: true },
    });
    if (!plan) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Plan not found', statusCode: 404 } });
    }
    return { success: true, data: { ...plan, monthlyRate: Number(plan.monthlyRate), installationFee: Number(plan.installationFee), reconnectionFee: Number(plan.reconnectionFee) } };
  });

  fastify.post('/plans', {
    schema: { body: CreatePlanRequestSchema },
    preHandler: fastify.authorize('plan.create'),
  }, async (request, reply) => {
    const actorId = request.user.id;
    const [plan] = await db.insert(servicePlans).values({
      ...request.body,
      createdBy: actorId,
    }).returning();

    await db.insert(auditLogs).values({
      actorId,
      action: 'plan.create',
      entityType: 'plan',
      entityId: plan.id,
      newValues: plan,
      reason: 'Plan created',
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });

    return { success: true, data: { ...plan, monthlyRate: Number(plan.monthlyRate), installationFee: Number(plan.installationFee), reconnectionFee: Number(plan.reconnectionFee) } };
  });

  fastify.patch('/plans/:id', {
    schema: {
      params: z.object({ id: UUIDSchema }),
      body: UpdatePlanRequestSchema,
    },
    preHandler: fastify.authorize('plan.update'),
  }, async (request, reply) => {
    const actorId = request.user.id;
    const existing = await db.query.servicePlans.findFirst({ where: eq(servicePlans.id, request.params.id) });
    if (!existing) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Plan not found', statusCode: 404 } });
    }

    await db.update(servicePlans)
      .set({ ...request.body, updatedBy: actorId, updatedAt: new Date() })
      .where(eq(servicePlans.id, request.params.id));

    await db.insert(auditLogs).values({
      actorId,
      action: 'plan.update',
      entityType: 'plan',
      entityId: request.params.id,
      oldValues: existing,
      newValues: request.body,
      reason: 'Plan updated',
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });

    return { success: true, data: { message: 'Plan updated' } };
  });
}