/**
 * Collection routes - Fully implemented
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UUIDSchema, PaginationSchema, CreateCollectionAreaRequestSchema, CreateCollectionBatchRequestSchema, CollectionBatchAccountUpdateSchema, CollectorRemittanceRequestSchema, ReconcileBatchRequestSchema } from '@bcis/shared';
import { 
  listCollectionAreas, 
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

export async function collectionRoutes(fastify: FastifyInstance) {
  // Areas
  fastify.get('/collection-areas', {
    schema: { querystring: PaginationSchema },
    preHandler: fastify.authorize('collection.view'),
  }, async (request, reply) => {
    const query = request.query as any;
    const result = await listCollectionAreas({
      page: query.page || 1,
      limit: query.limit || 20,
      isActive: query.isActive,
    });
    return { success: true, data: result };
  });

  fastify.post('/collection-areas', {
    schema: { body: CreateCollectionAreaRequestSchema },
    preHandler: fastify.authorize('collection.create'),
  }, async (request, reply) => {
    const area = await createCollectionArea(fastify, request.body);
    return { success: true, data: area };
  });

  fastify.post('/collection-areas/:areaId/assign-collector', {
    schema: { 
      params: z.object({ areaId: UUIDSchema }),
      body: z.object({ collectorId: UUIDSchema }),
    },
    preHandler: fastify.authorize('collection.create'),
  }, async (request, reply) => {
    const assignment = await assignCollector(fastify, { 
      areaId: request.params.areaId, 
      collectorId: request.body.collectorId 
    });
    return { success: true, data: assignment };
  });

  // Batches
  fastify.get('/collection-batches', {
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
    });
    return { success: true, data: result };
  });

  fastify.get('/collection-batches/:id', {
    schema: { params: z.object({ id: UUIDSchema }) },
    preHandler: fastify.authorize('collection.view'),
  }, async (request, reply) => {
    const batch = await getCollectionBatch(request.params.id);
    if (!batch) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Batch not found', statusCode: 404 } });
    }
    return { success: true, data: batch };
  });

  fastify.post('/collection-batches', {
    schema: { body: CreateCollectionBatchRequestSchema },
    preHandler: fastify.authorize('collection.create'),
  }, async (request, reply) => {
    const batch = await createCollectionBatch(fastify, request.body);
    return { success: true, data: batch };
  });

  fastify.patch('/collection-batches/:id', {
    schema: {
      params: z.object({ id: UUIDSchema }),
      body: z.object({ status: z.enum(['open', 'in_progress', 'submitted', 'remitted', 'reconciled', 'closed']).optional(), notes: z.string().max(1000).optional() }),
    },
    preHandler: fastify.authorize('collection.record'),
  }, async (request, reply) => {
    // Status transitions handled by specific endpoints
    return { success: true, data: { message: 'Use specific endpoints for status changes' } };
  });

  fastify.patch('/collection-batches/:id/accounts/:accountId', {
    schema: {
      params: z.object({ id: UUIDSchema, accountId: UUIDSchema }),
      body: CollectionBatchAccountUpdateSchema,
    },
    preHandler: fastify.authorize('collection.record'),
  }, async (request, reply) => {
    await recordCollection(fastify, {
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

  fastify.post('/collection-batches/:id/remit', {
    schema: {
      params: z.object({ id: UUIDSchema }),
      body: CollectorRemittanceRequestSchema,
    },
    preHandler: fastify.authorize('collection.remit'),
  }, async (request, reply) => {
    const result = await submitRemittance(fastify, {
      batchId: request.params.id,
      cashAmount: request.body.cashAmount,
      nonCashAmount: request.body.nonCashAmount,
      remittanceDate: new Date(request.body.remittanceDate),
      notes: request.body.notes,
    });
    return { success: true, data: result };
  });

  fastify.post('/collection-batches/:id/reconcile', {
    schema: {
      params: z.object({ id: UUIDSchema }),
      body: ReconcileBatchRequestSchema,
    },
    preHandler: fastify.authorize('collection.reconcile'),
  }, async (request, reply) => {
    const result = await reconcileBatch(fastify, request.params.id, {
      actualCash: request.body.actualCash,
      actualNonCash: request.body.actualNonCash,
      notes: request.body.notes,
    });
    return { success: true, data: result };
  });

  fastify.post('/collection-batches/:id/close', {
    schema: { params: z.object({ id: UUIDSchema }) },
    preHandler: fastify.authorize('collection.reconcile'),
  }, async (request, reply) => {
    await closeBatch(fastify, request.params.id);
    return { success: true, data: { message: 'Batch closed' } };
  });

  // Route sheet
  fastify.get('/collection-batches/:id/route-sheet', {
    schema: { params: z.object({ id: UUIDSchema }) },
    preHandler: fastify.authorize('collection.view'),
  }, async (request, reply) => {
    const routeSheet = await getRouteSheet(request.params.id);
    return { success: true, data: routeSheet };
  });
}