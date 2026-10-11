/**
 * Report routes - Fully implemented
 */

import { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, count, eq, gt, gte, inArray, lt, sum } from 'drizzle-orm';
import { UUIDSchema, ReportPeriodSchema, AgingReportRequestSchema } from '@bcis/shared';
import { invoices, payments, subscribers } from '@bcis/db/schema';
import { 
  generateMonthlyCollectionReportXLSX,
  generateARAgingReportXLSX,
  generateCollectorRemittanceReportXLSX,
  generateBillingVsCollectionReportXLSX,
} from '../services/reports';
import { getCollectionEfficiency, getRevenueReport } from '../services/receivables';

const ReportDateParamSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Expected a valid date');
const reportRangeDate = (value: string, endOfDay = false) => {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!dateOnly) return new Date(value);
  return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}+08:00`);
};

export async function reportRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  app.get('/reports/dashboard', {
    preHandler: fastify.authorize('report.view'),
  }, async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const [subscriberCount, receivables, monthlyCollections, overdueAccounts] = await Promise.all([
      fastify.db.select({ value: count() }).from(subscribers).where(eq(subscribers.status, 'active')),
      fastify.db.select({ value: sum(invoices.balance) }).from(invoices).where(inArray(invoices.status, ['unpaid', 'partially_paid', 'overdue'])),
      fastify.db.select({ value: sum(payments.amount) }).from(payments).where(and(
        gte(payments.paymentDate, monthStart),
        lt(payments.paymentDate, nextMonthStart),
        inArray(payments.status, ['posted', 'verified']),
      )),
      fastify.db.selectDistinct({ serviceAccountId: invoices.serviceAccountId }).from(invoices).where(and(
        eq(invoices.status, 'overdue'),
        gt(invoices.balance, 0),
      )),
    ]);

    return {
      success: true,
      data: {
        activeSubscribers: Number(subscriberCount[0]?.value ?? 0),
        totalReceivable: Number(receivables[0]?.value ?? 0),
        monthlyCollections: Number(monthlyCollections[0]?.value ?? 0),
        overdueAccounts: overdueAccounts.length,
      },
    };
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
  }, async (request) => {
    const { areaId, collectorId, status } = request.query as {
      areaId?: string;
      collectorId?: string;
      status?: 'active' | 'inactive' | 'terminated' | 'archived';
    };
    const conditions = [];
    if (areaId) conditions.push(eq(subscribers.collectionAreaId, areaId));
    if (collectorId) conditions.push(eq(subscribers.collectorId, collectorId));
    if (status) conditions.push(eq(subscribers.status, status));

    const rows = await fastify.db.query.subscribers.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      orderBy: (table, { asc }) => [asc(table.accountNumber)],
      with: {
        serviceAccounts: { with: { plan: true } },
        collector: true,
      },
    });
    return {
      success: true,
      data: rows.map((subscriber) => ({
        id: subscriber.id,
        accountNumber: subscriber.accountNumber,
        firstName: subscriber.firstName,
        middleName: subscriber.middleName,
        lastName: subscriber.lastName,
        contactNumber: subscriber.contactNumber,
        email: subscriber.email,
        status: subscriber.status,
        collector: subscriber.collector ? { id: subscriber.collector.id, fullName: subscriber.collector.fullName } : null,
        serviceAccounts: subscriber.serviceAccounts.map((account) => ({
          id: account.id,
          accountNumber: account.accountNumber,
          status: account.status,
          plan: account.plan ? { id: account.plan.id, code: account.plan.code, name: account.plan.name, type: account.plan.type } : null,
        })),
      })),
    };
  });

  // Export endpoints
  app.get('/reports/export/:type', {
    schema: {
      params: z.object({ type: z.enum(['collection', 'collector', 'aging', 'billing-vs-collection']) }),
      querystring: z.object({
        format: z.literal('xlsx').default('xlsx'),
        date: ReportDateParamSchema.optional(),
        dateFrom: ReportDateParamSchema.optional(),
        dateTo: ReportDateParamSchema.optional(),
        asOfDate: ReportDateParamSchema.optional(),
        collectorId: UUIDSchema.optional(),
        areaId: UUIDSchema.optional(),
      }),
    },
    preHandler: fastify.authorize('report.export'),
  }, async (request, reply) => {
    const { type } = request.params;
    const query = request.query as any;

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
          if (!query.dateFrom || !query.dateTo) {
            return reply.code(400).send({ success: false, error: { code: 'INVALID_PERIOD', message: 'From and to dates are required', statusCode: 400 } });
          }
          buffer = await generateCollectorRemittanceReportXLSX(
            fastify,
            reportRangeDate(query.dateFrom),
            reportRangeDate(query.dateTo, true),
            query.collectorId
          );
          filename = `collector-remittance-${query.dateFrom}_to_${query.dateTo}.xlsx`;
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
        }
        case 'billing-vs-collection': {
          if (!query.dateFrom || !query.dateTo) {
            return reply.code(400).send({ success: false, error: { code: 'INVALID_PERIOD', message: 'From and to dates are required', statusCode: 400 } });
          }
          buffer = await generateBillingVsCollectionReportXLSX(
            fastify,
            reportRangeDate(query.dateFrom),
            reportRangeDate(query.dateTo, true)
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
