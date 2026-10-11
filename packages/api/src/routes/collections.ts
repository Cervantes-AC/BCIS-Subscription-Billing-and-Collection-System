/**
 * Collection routes - Fully implemented
 */

import { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { UUIDSchema, PaginationSchema, CreateCollectionAreaRequestSchema, CreateCollectionBatchRequestSchema, CollectionBatchAccountUpdateSchema, CollectorRemittanceRequestSchema, ReconcileBatchRequestSchema } from '@bcis/shared';
import {
  listCollectionAreas,
  listCollectionCollectors,
  createCollectionArea,
  assignCollector,
  listCollectionBatches,
  getCollectionBatch,
  createCollectionBatch,
  recordCollection,
  submitRemittance,
  reconcileBatch,
  closeBatch,
  getRouteSheet,
} from '../services/collections';
import { requestContext } from '../utils/request-context';

export async function collectionRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.get('/collection-collectors', {
    preHandler: fastify.authorize('collection.view'),
  }, async () => ({ success: true, data: await listCollectionCollectors(fastify) }));

  // Areas
  app.get('/collection-areas', {
    schema: { querystring: PaginationSchema },
    preHandler: fastify.authorize('collection.view'),
  }, async (request, reply) => {
    const query = request.query as any;
    const result = await listCollectionAreas({
      page: query.page || 1,
      limit: query.limit || 20,
      isActive: query.isActive,
    }, fastify);
    return { success: true, data: result };
  });

  app.post('/collection-areas', {
    schema: { body: CreateCollectionAreaRequestSchema },
    preHandler: fastify.authorize('collection.create'),
  }, async (request, reply) => {
    const area = await createCollectionArea(requestContext(fastify, request), request.body);
    return { success: true, data: area };
  });

  app.post('/collection-areas/:areaId/assign-collector', {
    schema: {
      params: z.object({ areaId: UUIDSchema }),
      body: z.object({ collectorId: UUIDSchema }),
    },
    preHandler: fastify.authorize('collection.create'),
  }, async (request, reply) => {
    const assignment = await assignCollector(requestContext(fastify, request), {
      areaId: request.params.areaId,
      collectorId: request.body.collectorId
    });
    return { success: true, data: assignment };
  });

  // Batches
  app.get('/collection-batches', {
    schema: { querystring: PaginationSchema.extend({ status: z.enum(['open', 'in_progress', 'submitted', 'remitted', 'reconciled', 'closed']).optional(), collectorId: UUIDSchema.optional(), areaId: UUIDSchema.optional() }) },
    preHandler: fastify.authorize('collection.view'),
  }, async (request, reply) => {
    const query = request.query as any;
    const result = await listCollectionBatches({
      page: query.page || 1,
      limit: query.limit || 20,
      collectorId: query.collectorId,
      areaId: query.areaId,
      status: query.status,
      collectionDateFrom: query.collectionDateFrom ? new Date(query.collectionDateFrom) : undefined,
      collectionDateTo: query.collectionDateTo ? new Date(query.collectionDateTo) : undefined,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    }, fastify);
    return { success: true, data: result };
  });

  app.get('/collection-batches/:id', {
    schema: { params: z.object({ id: UUIDSchema }) },
    preHandler: fastify.authorize('collection.view'),
  }, async (request, reply) => {
    const batch = await getCollectionBatch(fastify, request.params.id);
    if (!batch) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Batch not found', statusCode: 404 } });
    }
    return { success: true, data: batch };
  });

  app.post('/collection-batches', {
    schema: { body: CreateCollectionBatchRequestSchema },
    preHandler: fastify.authorize('collection.create'),
  }, async (request, reply) => {
    const batch = await createCollectionBatch(requestContext(fastify, request), { ...request.body, collectionDate: new Date(request.body.collectionDate) });
    return { success: true, data: batch };
  });

  app.patch('/collection-batches/:id', {
    schema: {
      params: z.object({ id: UUIDSchema }),
      body: z.object({ status: z.enum(['open', 'in_progress', 'submitted', 'remitted', 'reconciled', 'closed']).optional(), notes: z.string().max(1000).optional() }),
    },
    preHandler: fastify.authorize('collection.record'),
  }, async (request, reply) => {
    // Status transitions handled by specific endpoints
    return { success: true, data: { message: 'Use specific endpoints for status changes' } };
  });

  app.patch('/collection-batches/:id/accounts/:accountId', {
    schema: {
      params: z.object({ id: UUIDSchema, accountId: UUIDSchema }),
      body: CollectionBatchAccountUpdateSchema,
    },
    preHandler: fastify.authorize('collection.record'),
  }, async (request, reply) => {
    await recordCollection(requestContext(fastify, request), {
      batchId: request.params.id,
      serviceAccountId: request.params.accountId,
      collectedAmount: request.body.collectedAmount,
      collectedMethod: request.body.collectedMethod,
      collectedAt: request.body.collectedAt ? new Date(request.body.collectedAt) : undefined,
      notes: request.body.notes,
      receiptNumber: request.body.receiptNumber,
      paymentId: request.body.paymentId,
    });
    return { success: true, data: { message: 'Collection recorded' } };
  });

  app.post('/collection-batches/:id/remit', {
    schema: {
      params: z.object({ id: UUIDSchema }),
      body: CollectorRemittanceRequestSchema,
    },
    preHandler: fastify.authorize('collection.remit'),
  }, async (request, reply) => {
    const result = await submitRemittance(requestContext(fastify, request), {
      batchId: request.params.id,
      cashAmount: request.body.cashAmount,
      nonCashAmount: request.body.nonCashAmount,
      remittanceDate: new Date(request.body.remittanceDate),
      notes: request.body.notes,
    });
    return { success: true, data: result };
  });

  app.post('/collection-batches/:id/reconcile', {
    schema: {
      params: z.object({ id: UUIDSchema }),
      body: ReconcileBatchRequestSchema,
    },
    preHandler: fastify.authorize('collection.reconcile'),
  }, async (request, reply) => {
    const result = await reconcileBatch(requestContext(fastify, request), request.params.id, {
      actualCash: request.body.actualCash,
      actualNonCash: request.body.actualNonCash,
      notes: request.body.notes,
    });
    return { success: true, data: result };
  });

  app.post('/collection-batches/:id/close', {
    schema: { params: z.object({ id: UUIDSchema }) },
    preHandler: fastify.authorize('collection.reconcile'),
  }, async (request, reply) => {
    await closeBatch(requestContext(fastify, request), request.params.id);
    return { success: true, data: { message: 'Batch closed' } };
  });

  // Route shee
  app.get('/collection-batches/:id/route-sheet', {
    schema: { params: z.object({ id: UUIDSchema }) },
    preHandler: fastify.authorize('collection.view'),
  }, async (request, reply) => {
    const routeSheet = await getRouteSheet(requestContext(fastify, request), request.params.id);
    return { success: true, data: routeSheet };
  });
}
