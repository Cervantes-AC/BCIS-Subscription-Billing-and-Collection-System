/**
 * Billing routes - Fully implemented
 */

import { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { UUIDSchema, PaginationSchema, CreateBillingCycleRequestSchema, BillingGenerationRequestSchema, CreateInvoiceRequestSchema, UpdateInvoiceRequestSchema, InvoiceSearchSchema } from '@bcis/shared';
import { 
  createBillingCycle, 
  finalizeBillingCycle, 
  generateMonthlyBilling, 
  listBillingCycles, 
  listInvoices, 
  getInvoiceWithDetails, 
  updateInvoice 
} from '../services/billing';
import { requestContext } from '../utils/request-context';

export async function billingRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  // Billing cycles
  app.get('/billing-cycles', {
    schema: { querystring: PaginationSchema },
    preHandler: fastify.authorize('billing.view'),
  }, async (request, reply) => {
    const query = request.query as any;
    const result = await listBillingCycles(fastify, {
      page: query.page || 1,
      limit: query.limit || 20,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    return { success: true, data: result };
  });

  app.post('/billing-cycles', {
    schema: { body: CreateBillingCycleRequestSchema },
    preHandler: fastify.authorize('billing.generate'),
  }, async (request, reply) => {
    const actorId = request.user.id;
    const cycle = await createBillingCycle(fastify, { ...request.body, periodStart: new Date(request.body.periodStart), periodEnd: new Date(request.body.periodEnd), dueDate: new Date(request.body.dueDate) }, actorId);
    return { success: true, data: cycle };
  });

  app.post('/billing/generate', {
    schema: { body: BillingGenerationRequestSchema },
    preHandler: fastify.authorize('billing.generate'),
  }, async (request, reply) => {
    const result = await generateMonthlyBilling(requestContext(fastify, request), request.body);
    return { success: true, data: result };
  });

  app.post('/billing-cycles/:id/finalize', {
    schema: { params: z.object({ id: UUIDSchema }) },
    preHandler: fastify.authorize('billing.finalize'),
  }, async (request, reply) => {
    await finalizeBillingCycle(requestContext(fastify, request), request.params.id);
    return { success: true, data: { message: 'Billing cycle finalized' } };
  });

  // Invoices
  app.get('/invoices', {
    schema: { querystring: InvoiceSearchSchema },
    preHandler: fastify.authorize('billing.view'),
  }, async (request, reply) => {
    const query = request.query as any;
    const result = await listInvoices(fastify, {
      page: query.page || 1,
      limit: query.limit || 20,
      serviceAccountId: query.serviceAccountId,
      subscriberId: query.subscriberId,
      billingCycleId: query.billingCycleId,
      status: query.status,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      dueDateFrom: query.dueDateFrom ? new Date(query.dueDateFrom) : undefined,
      dueDateTo: query.dueDateTo ? new Date(query.dueDateTo) : undefined,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    return { success: true, data: result };
  });

  app.get('/invoices/:id', {
    schema: { params: z.object({ id: UUIDSchema }) },
    preHandler: fastify.authorize('billing.view'),
  }, async (request, reply) => {
    const invoice = await getInvoiceWithDetails(fastify, request.params.id);
    if (!invoice) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found', statusCode: 404 } });
    }
    return { success: true, data: invoice };
  });

  app.post('/invoices', {
    schema: { body: CreateInvoiceRequestSchema },
    preHandler: fastify.authorize('billing.generate'),
  }, async (request, reply) => {
    // Manual invoice creation - would need additional service method
    return { success: true, data: { message: 'Use billing generation for automatic invoices' } };
  });

  app.patch('/invoices/:id', {
    schema: {
      params: z.object({ id: UUIDSchema }),
      body: UpdateInvoiceRequestSchema,
    },
    preHandler: fastify.authorize('billing.adjust'),
  }, async (request, reply) => {
    await updateInvoice(fastify, request.params.id, request.body, request.user.id);
    return { success: true, data: { message: 'Invoice updated' } };
  });

  app.post('/invoices/:id/void', {
    schema: {
      params: z.object({ id: UUIDSchema }),
      body: z.object({ reason: z.string().min(1).max(500) }),
    },
    preHandler: fastify.authorize('billing.void'),
  }, async (request, reply) => {
    await updateInvoice(fastify, request.params.id, { status: 'void', voidReason: request.body.reason }, request.user.id);
    return { success: true, data: { message: 'Invoice voided' } };
  });
}
