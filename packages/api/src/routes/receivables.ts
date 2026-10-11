/**
 * Receivables routes - Fully implemented
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UUIDSchema, PaginationSchema, AgingReportRequestSchema, StatementOfAccountRequestSchema } from '@bcis/shared';
import { 
  calculateAging, 
  getOverdueAccounts, 
  getSuspensionCandidates,
  getCollectionEfficiency,
  getRevenueReport,
} from '../services/receivables';
import { 
  suspendServiceAccount, 
  reconnectServiceAccount,
  getSuspensionHistory,
} from '../services/suspension';
import { generateStatementOfAccountPDF } from '../services/reports';

export async function receivablesRoutes(fastify: FastifyInstance) {
  fastify.get('/receivables/summary', {
    preHandler: fastify.authorize('receivables.view'),
  }, async (request, reply) => {
    const query = request.query as any;
    const { summary } = await calculateAging(query.asOfDate ? new Date(query.asOfDate) : new Date(), {
      collectorId: query.collectorId,
      areaId: query.areaId,
      planId: query.planId,
      serviceType: query.serviceType,
    });
    return { success: true, data: summary };
  });

  fastify.get('/receivables/overdue', {
    schema: { querystring: PaginationSchema.extend({ collectorId: UUIDSchema.optional(), areaId: UUIDSchema.optional(), planId: UUIDSchema.optional(), serviceType: z.enum(['internet', 'cable', 'combo']).optional(), minMonthsUnpaid: z.number().int().min(0).optional(), maxMonthsUnpaid: z.number().int().min(0).optional() }) },
    preHandler: fastify.authorize('receivables.view'),
  }, async (request, reply) => {
    const query = request.query as any;
    const result = await getOverdueAccounts({
      page: query.page || 1,
      limit: query.limit || 20,
      collectorId: query.collectorId,
      areaId: query.areaId,
      planId: query.planId,
      serviceType: query.serviceType,
      minMonthsUnpaid: query.minMonthsUnpaid,
      maxMonthsUnpaid: query.maxMonthsUnpaid,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    return { success: true, data: result };
  });

  fastify.get('/receivables/aging', {
    schema: { querystring: AgingReportRequestSchema },
    preHandler: fastify.authorize('receivables.view'),
  }, async (request, reply) => {
    const query = request.query as any;
    const { summary, details } = await calculateAging(new Date(query.asOfDate), {
      collectorId: query.collectorId,
      areaId: query.areaId,
      planId: query.planId,
      serviceType: query.serviceType,
    });
    return { success: true, data: { summary, details } };
  });

  fastify.get('/receivables/suspension-candidates', {
    schema: { querystring: PaginationSchema.extend({ collectorId: UUIDSchema.optional(), areaId: UUIDSchema.optional() }) },
    preHandler: fastify.authorize('receivables.suspend'),
  }, async (request, reply) => {
    const query = request.query as any;
    const result = await getSuspensionCandidates({
      page: query.page || 1,
      limit: query.limit || 20,
      collectorId: query.collectorId,
      areaId: query.areaId,
    });
    return { success: true, data: result };
  });

  // Collection efficiency
  fastify.get('/receivables/collection-efficiency', {
    schema: { 
      querystring: z.object({ 
        dateFrom: z.string().datetime(), 
        dateTo: z.string().datetime(), 
        collectorId: UUIDSchema.optional(), 
        areaId: UUIDSchema.optional() 
      }) 
    },
    preHandler: fastify.authorize('receivables.view'),
  }, async (request, reply) => {
    const query = request.query as any;
    const result = await getCollectionEfficiency({
      dateFrom: new Date(query.dateFrom),
      dateTo: new Date(query.dateTo),
      collectorId: query.collectorId,
      areaId: query.areaId,
    });
    return { success: true, data: result };
  });

  // Revenue report
  fastify.get('/receivables/revenue', {
    schema: { 
      querystring: z.object({ 
        dateFrom: z.string().datetime(), 
        dateTo: z.string().datetime(), 
        groupBy: z.enum(['plan', 'service_type', 'area']) 
      }) 
    },
    preHandler: fastify.authorize('receivables.view'),
  }, async (request, reply) => {
    const query = request.query as any;
    const result = await getRevenueReport({
      dateFrom: new Date(query.dateFrom),
      dateTo: new Date(query.dateTo),
      groupBy: query.groupBy,
    });
    return { success: true, data: result };
  });

  // Suspension
  fastify.post('/service-accounts/:id/suspend', {
    schema: {
      params: z.object({ id: UUIDSchema }),
      body: z.object({ reason: z.enum(['non_payment', 'request', 'violation', 'technical', 'other']), customReason: z.string().max(500).optional(), effectiveDate: z.string().datetime(), notes: z.string().max(1000).optional() }),
    },
    preHandler: fastify.authorize('receivables.suspend'),
  }, async (request, reply) => {
    const result = await suspendServiceAccount(fastify, {
      serviceAccountId: request.params.id,
      reason: request.body.reason,
      customReason: request.body.customReason,
      effectiveDate: new Date(request.body.effectiveDate),
      notes: request.body.notes,
    });
    return { success: true, data: result };
  });

  // Reconnection
  fastify.post('/service-accounts/:id/reconnect', {
    schema: {
      params: z.object({ id: UUIDSchema }),
      body: z.object({ suspensionId: UUIDSchema, fee: z.number().int().min(0), paymentId: UUIDSchema.optional(), technicianId: UUIDSchema.optional(), scheduledDate: z.string().datetime().optional(), notes: z.string().max(1000).optional() }),
    },
    preHandler: fastify.authorize('receivables.reconnect'),
  }, async (request, reply) => {
    const result = await reconnectServiceAccount(fastify, {
      suspensionId: request.body.suspensionId,
      fee: request.body.fee,
      paymentId: request.body.paymentId,
      technicianId: request.body.technicianId,
      scheduledDate: request.body.scheduledDate ? new Date(request.body.scheduledDate) : undefined,
      notes: request.body.notes,
    });
    return { success: true, data: result };
  });

  // Suspension history
  fastify.get('/service-accounts/:id/suspension-history', {
    schema: { params: z.object({ id: UUIDSchema }) },
    preHandler: fastify.authorize('receivables.view'),
  }, async (request, reply) => {
    const history = await getSuspensionHistory(fastify, request.params.id);
    return { success: true, data: history };
  });

  // Statement of Account
  fastify.get('/subscribers/:id/statement', {
    schema: { params: z.object({ id: UUIDSchema }), querystring: StatementOfAccountRequestSchema },
    preHandler: fastify.authorize('subscriber.view'),
  }, async (request, reply) => {
    const query = request.query as any;
    const pdfBuffer = await generateStatementOfAccountPDF(
      request.params.id,
      query.serviceAccountId,
      query.dateFrom ? new Date(query.dateFrom) : undefined,
      query.dateTo ? new Date(query.dateTo) : undefined
    );
    
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `inline; filename="statement-${request.params.id}.pdf"`);
    return reply.send(pdfBuffer);
  });
}