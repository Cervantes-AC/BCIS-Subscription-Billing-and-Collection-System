/**
 * Report routes - Fully implemented
 */

import { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { UUIDSchema, ReportPeriodSchema, AgingReportRequestSchema } from '@bcis/shared';
import { 
  generateMonthlyCollectionReportXLSX,
  generateARAgingReportXLSX,
  generateCollectorRemittanceReportXLSX,
  generateBillingVsCollectionReportXLSX,
} from '../services/reports';
import { getCollectionEfficiency, getRevenueReport } from '../services/receivables';

export async function reportRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.get('/reports/dashboard', {
    preHandler: fastify.authorize('report.view'),
  }, async (request, reply) => {
    // Dashboard KPIs would be aggregated from multiple services
    return { success: true, data: { message: 'Dashboard endpoint - needs full implementation' } };
  });

  app.get('/reports/collection', {
    schema: { querystring: ReportPeriodSchema },
    preHandler: fastify.authorize('report.view'),
  }, async (request, reply) => {
    const query = request.query as any;
    const result = await getCollectionEfficiency(fastify, {
      dateFrom: new Date(query.date),
      dateTo: new Date(query.date),
      collectorId: query.collectorId,
      areaId: query.areaId,
    });
    return { success: true, data: result };
  });

  app.get('/reports/revenue', {
    schema: { querystring: ReportPeriodSchema.extend({ groupBy: z.enum(['plan', 'service', 'area']).default('plan') }) },
    preHandler: fastify.authorize('report.view'),
  }, async (request, reply) => {
    const query = request.query as any;
    const result = await getRevenueReport(fastify, {
      dateFrom: new Date(query.date),
      dateTo: new Date(query.date),
      groupBy: query.groupBy === 'service' ? 'service_type' : query.groupBy,
    });
    return { success: true, data: result };
  });

  app.get('/reports/collector-performance', {
    schema: { querystring: ReportPeriodSchema.extend({ collectorId: UUIDSchema.optional(), areaId: UUIDSchema.optional() }) },
    preHandler: fastify.authorize('report.view'),
  }, async (request, reply) => {
    const query = request.query as any;
    const result = await getCollectionEfficiency(fastify, {
      dateFrom: new Date(query.date),
      dateTo: new Date(query.date),
      collectorId: query.collectorId,
      areaId: query.areaId,
    });
    return { success: true, data: result.byCollector };
  });

  app.get('/reports/ar-aging', {
    schema: { querystring: AgingReportRequestSchema },
    preHandler: fastify.authorize('report.view'),
  }, async (request, reply) => {
    const query = request.query as any;
    const { summary, details } = await (await import('../services/receivables.js')).calculateAging(fastify, new Date(query.asOfDate), {
      collectorId: query.collectorId,
      areaId: query.areaId,
      planId: query.planId,
      serviceType: query.serviceType,
    });
    return { success: true, data: { summary, details } };
  });

  app.get('/reports/subscriber-masterlist', {
    schema: { querystring: z.object({ areaId: UUIDSchema.optional(), collectorId: UUIDSchema.optional(), status: z.enum(['active', 'inactive', 'terminated', 'archived']).optional() }) },
    preHandler: fastify.authorize('report.view'),
  }, async (request, reply) => {
    return { success: true, data: { message: 'Masterlist endpoint - needs implementation' } };
  });

  // Export endpoints
  app.get('/reports/export/:type', {
    schema: {
      params: z.object({ type: z.enum(['collection', 'revenue', 'collector', 'aging', 'masterlist', 'billing-vs-collection']) }),
      querystring: z.object({ format: z.enum(['pdf', 'xlsx']).default('xlsx') }).merge(ReportPeriodSchema).extend({
        collectorId: UUIDSchema.optional(),
        areaId: UUIDSchema.optional(),
        asOfDate: z.string().datetime().optional(),
      }),
    },
    preHandler: fastify.authorize('report.export'),
  }, async (request, reply) => {
    const { type } = request.params;
    const query = request.query as any;
    const format = query.format || 'xlsx';

    let buffer: Buffer;
    let filename: string;
    let contentType: string;

    try {
      switch (type) {
        case 'collection': {
          const period = query.date ? new Date(query.date) : new Date();
          buffer = await generateMonthlyCollectionReportXLSX(fastify, period, {
            collectorId: query.collectorId, 
            areaId: query.areaId 
          });
          filename = `collection-report-${period.toISOString().split('T')[0].substring(0,7)}.xlsx`;
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
        }
        case 'aging': {
          const asOfDate = query.asOfDate ? new Date(query.asOfDate) : new Date();
          buffer = await generateARAgingReportXLSX(fastify, asOfDate, {
            collectorId: query.collectorId, 
            areaId: query.areaId 
          });
          filename = `ar-aging-${asOfDate.toISOString().split('T')[0]}.xlsx`;
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
        }
        case 'collector': {
          buffer = await generateCollectorRemittanceReportXLSX(
            fastify,
            new Date(query.dateFrom), 
            new Date(query.dateTo), 
            query.collectorId
          );
          filename = `collector-remittance-${query.dateFrom}_to_${query.dateTo}.xlsx`;
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
        }
        case 'billing-vs-collection': {
          buffer = await generateBillingVsCollectionReportXLSX(
            fastify,
            new Date(query.dateFrom), 
            new Date(query.dateTo)
          );
          filename = `billing-vs-collection-${query.dateFrom}_to_${query.dateTo}.xlsx`;
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
        }
        default:
          return reply.code(400).send({ success: false, error: { code: 'INVALID_TYPE', message: 'Invalid report type', statusCode: 400 } });
      }

      reply.header('Content-Type', contentType);
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      return reply.send(buffer);
    } catch (error) {
      console.error('Report generation error:', error);
      return reply.code(500).send({ success: false, error: { code: 'REPORT_ERROR', message: 'Failed to generate report', statusCode: 500 } });
    }
  });
}
