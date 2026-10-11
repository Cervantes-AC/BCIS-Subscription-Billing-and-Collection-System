/**
 * Service account routes - Fully implemented
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UUIDSchema, PaginationSchema, CreateServiceAccountRequestSchema, UpdateServiceAccountRequestSchema, ServiceAccountSearchSchema } from '@bcis/shared';
import { db } from '../plugins/database';
import { serviceAccounts, servicePlans, subscriberAddresses, subscribers, users, auditLogs, invoices, payments } from '@bcis/db/schema';
import { eq, and, or, ilike, inArray, desc, asc, count } from 'drizzle-orm';
import { generateServiceAccountNumber } from '../utils/numbering';

export async function serviceAccountRoutes(fastify: FastifyInstance) {
  fastify.get('/service-accounts', {
    schema: { querystring: ServiceAccountSearchSchema },
    preHandler: fastify.authorize('subscriber.view'),
  }, async (request, reply) => {
    const query = request.query as any;
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (query.subscriberId) conditions.push(eq(serviceAccounts.subscriberId, query.subscriberId));
    if (query.planId) conditions.push(eq(serviceAccounts.planId, query.planId));
    if (query.status) conditions.push(eq(serviceAccounts.status, query.status as any));
    if (query.collectorId) conditions.push(eq(serviceAccounts.collectorId, query.collectorId));
    if (query.areaId) {
      // Need to join through subscriber
      const subIds = await db.select({ id: subscribers.id })
        .from(subscribers)
        .where(eq(subscribers.collectionAreaId, query.areaId));
      conditions.push(inArray(serviceAccounts.subscriberId, subIds.map(s => s.id)));
    }

    const orderColumn = serviceAccounts[query.sortBy as keyof typeof serviceAccounts] || serviceAccounts.accountNumber;
    const orderFn = query.sortOrder === 'asc' ? asc : desc;

    const [items, totalResult] = await Promise.all([
      db.query.serviceAccounts.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        limit,
        offset,
        orderBy: orderFn(orderColumn),
        with: {
          subscriber: true,
          plan: true,
          installationAddress: true,
          collector: true,
        },
      }),
      db.select({ count: count() }).from(serviceAccounts).where(conditions.length > 0 ? and(...conditions) : undefined),
    ]);

    return { 
      success: true, 
      data: { 
        items: items.map(sa => ({
          ...sa,
          currentRate: sa.currentRate ? Number(sa.currentRate) : undefined,
          subscriber: sa.subscriber ? { id: sa.subscriber.id, accountNumber: sa.subscriber.accountNumber, name: `${sa.subscriber.firstName} ${sa.subscriber.lastName}` } : undefined,
          plan: sa.plan ? { id: sa.plan.id, code: sa.plan.code, name: sa.plan.name, type: sa.plan.type, monthlyRate: Number(sa.plan.monthlyRate) } : undefined,
          collector: sa.collector ? { id: sa.collector.id, fullName: sa.collector.fullName } : undefined,
        })),
        meta: { page, limit, total: totalResult[0].count, totalPages: Math.ceil(totalResult[0].count / limit) } 
      } 
    };
  });

  fastify.get('/service-accounts/:id', {
    schema: { params: z.object({ id: UUIDSchema }) },
    preHandler: fastify.authorize('subscriber.view'),
  }, async (request, reply) => {
    const sa = await db.query.serviceAccounts.findFirst({
      where: eq(serviceAccounts.id, request.params.id),
      with: {
        subscriber: { with: { addresses: true } },
        plan: true,
        installationAddress: true,
        collector: true,
        invoices: { orderBy: desc(invoices.generatedAt), limit: 20, with: { items: true, allocations: { with: { payment: true } } } },
        payments: { orderBy: desc(payments.paymentDate), limit: 20, with: { allocations: { with: { invoice: true } } } },
      },
    });
    if (!sa) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Service account not found', statusCode: 404 } });
    }
    return { success: true, data: {
      ...sa,
      currentRate: sa.currentRate ? Number(sa.currentRate) : undefined,
      plan: sa.plan ? { ...sa.plan, monthlyRate: Number(sa.plan.monthlyRate) } : undefined,
      invoices: sa.invoices.map(inv => ({ ...inv, totalAmount: Number(inv.totalAmount), paidAmount: Number(inv.paidAmount), balance: Number(inv.balance) })),
      payments: sa.payments.map(pmt => ({ ...pmt, amount: Number(pmt.amount) })),
    }};
  });

  fastify.post('/service-accounts', {
    schema: { body: CreateServiceAccountRequestSchema },
    preHandler: fastify.authorize('subscriber.create'),
  }, async (request, reply) => {
    const actorId = request.user.id;
    
    // Verify subscriber, plan, address exist
    const subscriber = await db.query.subscribers.findFirst({ where: eq(subscribers.id, request.body.subscriberId) });
    if (!subscriber) return reply.code(400).send({ success: false, error: { code: 'INVALID_SUBSCRIBER', message: 'Subscriber not found', statusCode: 400 } });
    
    const plan = await db.query.servicePlans.findFirst({ where: eq(servicePlans.id, request.body.planId) });
    if (!plan) return reply.code(400).send({ success: false, error: { code: 'INVALID_PLAN', message: 'Plan not found', statusCode: 400 } });
    
    const address = await db.query.subscriberAddresses.findFirst({ where: eq(subscriberAddresses.id, request.body.installationAddressId) });
    if (!address) return reply.code(400).send({ success: false, error: { code: 'INVALID_ADDRESS', message: 'Installation address not found', statusCode: 400 } });

    const accountNumber = await generateServiceAccountNumber();

    const [sa] = await db.transaction(async (tx) => {
      const [newSa] = await tx.insert(serviceAccounts).values({
        ...request.body,
        accountNumber,
        currentRate: plan.monthlyRate,
        createdBy: actorId,
      }).returning();

      await tx.insert(auditLogs).values({
        actorId,
        action: 'service_account.create',
        entityType: 'service_account',
        entityId: newSa.id,
        newValues: { accountNumber, ...request.body },
        reason: 'Service account created',
        ipAddress: fastify.requestIp,
        userAgent: fastify.requestHeaders?.['user-agent'],
      });

      return [newSa];
    });

    return { success: true, data: { ...sa, currentRate: Number(sa.currentRate) } };
  });

  fastify.patch('/service-accounts/:id', {
    schema: {
      params: z.object({ id: UUIDSchema }),
      body: UpdateServiceAccountRequestSchema,
    },
    preHandler: fastify.authorize('subscriber.update'),
  }, async (request, reply) => {
    const actorId = request.user.id;
    const existing = await db.query.serviceAccounts.findFirst({ where: eq(serviceAccounts.id, request.params.id) });
    if (!existing) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Service account not found', statusCode: 404 } });
    }

    await db.update(serviceAccounts)
      .set({ ...request.body, updatedBy: actorId, updatedAt: new Date() })
      .where(eq(serviceAccounts.id, request.params.id));

    await db.insert(auditLogs).values({
      actorId,
      action: 'service_account.update',
      entityType: 'service_account',
      entityId: request.params.id,
      oldValues: existing,
      newValues: request.body,
      reason: 'Service account updated',
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });

    return { success: true, data: { message: 'Service account updated' } };
  });
}