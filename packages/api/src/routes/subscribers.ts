/**
 * Subscriber routes - Fully implemented
 */

import { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { UUIDSchema, PaginationSchema, SubscriberSearchSchema, CreateSubscriberRequestSchema, UpdateSubscriberRequestSchema, SubscriberAddressSchema } from '@bcis/shared';
import { db } from '../plugins/database';
import { subscribers, subscriberAddresses, subscriberContacts, serviceAccounts, users, auditLogs, invoices, payments } from '@bcis/db/schema';
import { eq, and, or, like, ilike, inArray, desc, asc, count, sql } from 'drizzle-orm';
import { generateSubscriberAccountNumber } from '../utils/numbering';
import { sortColumn } from '../utils/sort-column';

export async function subscriberRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  // Search subscribers
  app.get('/subscribers', {
    schema: { querystring: SubscriberSearchSchema },
    preHandler: fastify.authorize('subscriber.view'),
  }, async (request, reply) => {
    const query = request.query as any;
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (query.query) {
      conditions.push(or(
        ilike(subscribers.accountNumber, `%${query.query}%`),
        ilike(subscribers.firstName, `%${query.query}%`),
        ilike(subscribers.lastName, `%${query.query}%`),
        ilike(subscribers.contactNumber, `%${query.query}%`)
      ));
    }
    if (query.accountNumber) conditions.push(ilike(subscribers.accountNumber, `%${query.accountNumber}%`));
    if (query.name) conditions.push(or(ilike(subscribers.firstName, `%${query.name}%`), ilike(subscribers.lastName, `%${query.name}%`)));
    if (query.contactNumber) conditions.push(ilike(subscribers.contactNumber, `%${query.contactNumber}%`));
    if (query.status) conditions.push(eq(subscribers.status, query.status as any));
    if (query.collectionAreaId) conditions.push(eq(subscribers.collectionAreaId, query.collectionAreaId));
    if (query.collectorId) conditions.push(eq(subscribers.collectorId, query.collectorId));

    const orderColumn = sortColumn({ accountNumber: subscribers.accountNumber, firstName: subscribers.firstName, lastName: subscribers.lastName, status: subscribers.status, createdAt: subscribers.createdAt }, query.sortBy, 'lastName');
    const orderFn = query.sortOrder === 'asc' ? asc : desc;

    const [items, totalResult] = await Promise.all([
      db.query.subscribers.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        limit,
        offset,
        orderBy: orderFn(orderColumn),
        with: {
          addresses: true,
          collector: true,
          serviceAccounts: { with: { plan: true } },
        },
      }),
      db.select({ count: count() }).from(subscribers).where(conditions.length > 0 ? and(...conditions) : undefined),
    ]);

    return { 
      success: true, 
      data: { 
        items: items.map(s => ({
          ...s,
          addresses: s.addresses,
          collector: s.collector ? { id: s.collector.id, fullName: s.collector.fullName } : undefined,
          serviceAccounts: s.serviceAccounts.map(sa => ({
            ...sa,
            plan: sa.plan ? { id: sa.plan.id, code: sa.plan.code, name: sa.plan.name, type: sa.plan.type } : undefined,
          })),
        })),
        meta: { page, limit, total: totalResult[0].count, totalPages: Math.ceil(totalResult[0].count / limit) } 
      } 
    };
  });

  // Get subscriber by ID
  app.get('/subscribers/:id', {
    schema: { params: z.object({ id: UUIDSchema }) },
    preHandler: fastify.authorize('subscriber.view'),
  }, async (request, reply) => {
    const subscriber = await db.query.subscribers.findFirst({
      where: eq(subscribers.id, request.params.id),
      with: {
        addresses: true,
        contacts: true,
        collector: true,
        serviceAccounts: {
          with: {
            plan: true,
            installationAddress: true,
            invoices: { orderBy: desc(invoices.generatedAt), limit: 10, with: { items: true, allocations: { with: { payment: true } } } },
          },
        },
      },
    });

    if (!subscriber) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Subscriber not found', statusCode: 404 } });
    }

    return { 
      success: true, 
      data: {
        ...subscriber,
        collector: subscriber.collector ? { id: subscriber.collector.id, fullName: subscriber.collector.fullName } : undefined,
        serviceAccounts: subscriber.serviceAccounts.map(sa => ({
          ...sa,
          plan: sa.plan ? { ...sa.plan, monthlyRate: Number(sa.plan.monthlyRate) } : undefined,
          invoices: sa.invoices.map(inv => ({ ...inv, totalAmount: Number(inv.totalAmount), balance: Number(inv.balance) })),
          payments: [...new Map(sa.invoices.flatMap((invoice) => invoice.allocations.map((allocation) => allocation.payment)).filter(Boolean).map((payment) => [payment.id, payment])).values()].map((payment) => ({ ...payment, amount: Number(payment.amount) })),
        })),
      } 
    };
  });

  // Create subscriber
  app.post('/subscribers', {
    schema: { body: CreateSubscriberRequestSchema },
    preHandler: fastify.authorize('subscriber.create'),
  }, async (request, reply) => {
    const actorId = request.user.id;
    const { addresses, accountNumber: _submittedAccountNumber, ...subscriberData } = request.body;

    const accountNumber = await generateSubscriberAccountNumber(fastify);

    const [newSubscriber] = await db.transaction(async (tx) => {
      const [sub] = await tx.insert(subscribers).values({
        ...subscriberData,
        accountNumber,
        createdBy: actorId,
      }).returning();

      // Insert addresses
      for (const addr of addresses) {
        await tx.insert(subscriberAddresses).values({
          ...addr,
          latitude: addr.latitude === undefined ? undefined : String(addr.latitude),
          longitude: addr.longitude === undefined ? undefined : String(addr.longitude),
          subscriberId: sub.id,
        });
      }

      await tx.insert(auditLogs).values({
        actorId,
        action: 'subscriber.create',
        entityType: 'subscriber',
        entityId: sub.id,
        newValues: { accountNumber, ...subscriberData },
        reason: 'Subscriber created',
        ipAddress: fastify.requestIp,
        userAgent: fastify.requestHeaders?.['user-agent'],
      });

      return [sub];
    });

    return { success: true, data: newSubscriber };
  });

  // Update subscriber
  app.patch('/subscribers/:id', {
    schema: {
      params: z.object({ id: UUIDSchema }),
      body: UpdateSubscriberRequestSchema,
    },
    preHandler: fastify.authorize('subscriber.update'),
  }, async (request, reply) => {
    const actorId = request.user.id;
    const { addresses, ...subscriberData } = request.body;

    const existing = await db.query.subscribers.findFirst({
      where: eq(subscribers.id, request.params.id),
    });
    if (!existing) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Subscriber not found', statusCode: 404 } });
    }

    await db.transaction(async (tx) => {
      await tx.update(subscribers)
        .set({ ...subscriberData, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(subscribers.id, request.params.id));

      if (addresses) {
        // Delete existing addresses and re-insert
        await tx.delete(subscriberAddresses).where(eq(subscriberAddresses.subscriberId, request.params.id));
        for (const addr of addresses) {
          await tx.insert(subscriberAddresses).values({ ...addr, latitude: addr.latitude === undefined ? undefined : String(addr.latitude), longitude: addr.longitude === undefined ? undefined : String(addr.longitude), subscriberId: request.params.id });
        }
      }

      await tx.insert(auditLogs).values({
        actorId,
        action: 'subscriber.update',
        entityType: 'subscriber',
        entityId: request.params.id,
        oldValues: existing,
        newValues: subscriberData,
        reason: 'Subscriber updated',
        ipAddress: fastify.requestIp,
        userAgent: fastify.requestHeaders?.['user-agent'],
      });
    });

    return { success: true, data: { message: 'Subscriber updated' } };
  });

  // Global search
  app.get('/search', {
    schema: {
      querystring: z.object({
        q: z.string().min(1),
        limit: z.number().int().min(1).max(50).default(10),
      }),
    },
    preHandler: fastify.authorize('subscriber.view'),
  }, async (request, reply) => {
    const { q, limit } = request.query as any;
    
    const results = await db.query.subscribers.findMany({
      where: or(
        ilike(subscribers.accountNumber, `%${q}%`),
        ilike(subscribers.firstName, `%${q}%`),
        ilike(subscribers.lastName, `%${q}%`),
        ilike(subscribers.contactNumber, `%${q}%`),
        ilike(subscribers.email, `%${q}%`)
      ),
      limit,
      with: {
        serviceAccounts: { with: { plan: true } },
      },
    });

    // Also search by invoice number, receipt number, GCash reference
    const invoiceResults = await db.query.invoices.findMany({
      where: ilike(invoices.invoiceNumber, `%${q}%`),
      limit: 5,
      with: { serviceAccount: { with: { subscriber: true } } },
    });

    const paymentResults = await db.query.payments.findMany({
      where: or(
        ilike(payments.receiptNumber, `%${q}%`),
        ilike(payments.referenceNumber, `%${q}%`)
      ),
      limit: 5,
      with: { subscriber: true },
    });

    return { 
      success: true, 
      data: {
        subscribers: results.map(s => ({
          id: s.id,
          accountNumber: s.accountNumber,
          name: `${s.firstName} ${s.lastName}`,
          contactNumber: s.contactNumber,
          status: s.status,
          serviceAccounts: s.serviceAccounts.map(sa => ({ id: sa.id, accountNumber: sa.accountNumber, plan: sa.plan?.name })),
        })),
        invoices: invoiceResults.map(inv => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          subscriber: inv.serviceAccount?.subscriber ? { id: inv.serviceAccount.subscriber.id, accountNumber: inv.serviceAccount.subscriber.accountNumber, name: `${inv.serviceAccount.subscriber.firstName} ${inv.serviceAccount.subscriber.lastName}` } : null,
        })),
        payments: paymentResults.map(pmt => ({
          id: pmt.id,
          receiptNumber: pmt.receiptNumber,
          referenceNumber: pmt.referenceNumber,
          subscriber: pmt.subscriber ? { id: pmt.subscriber.id, accountNumber: pmt.subscriber.accountNumber, name: `${pmt.subscriber.firstName} ${pmt.subscriber.lastName}` } : null,
        })),
      } 
    };
  });
}
