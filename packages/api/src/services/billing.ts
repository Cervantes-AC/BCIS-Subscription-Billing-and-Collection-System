/**
 * Billing Service - Core billing logic for BCIS
 * Handles billing cycles, invoice generation, and invoice management
 */

import { 
  billingCycles, 
  invoices, 
  invoiceItems, 
  serviceAccounts, 
  servicePlans,
  subscribers,
  adjustments,
  paymentAllocations,
  auditLogs
} from '@bcis/db/schema';
import { eq, and, or, gte, lte, isNull, not, inArray, sql, desc, asc, count, sum } from 'drizzle-orm';
import { generateInvoiceNumber } from '../utils/numbering';
import type { FastifyInstance } from 'fastify';

export interface BillingGenerationResult {
  success: boolean;
  generated: number;
  skipped: number;
  errors: string[];
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    serviceAccountId: string;
    totalAmount: number;
    balance: number;
  }>;
}

export interface InvoiceWithDetails {
  id: string;
  invoiceNumber: string;
  serviceAccountId: string;
  billingCycleId: string;
  status: string;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  subscriptionCharge: number;
  installationFee: number;
  reconnectionFee: number;
  discount: number;
  penalty: number;
  adjustmentsAmount: number;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  notes?: string;
  generatedAt: Date;
  generatedBy: string;
  finalizedAt?: Date;
  finalizedBy?: string;
  voidedAt?: Date;
  voidedBy?: string;
  voidReason?: string;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    type: string;
    sortOrder: number;
  }>;
  adjustments: Array<{
    id: string;
    type: string;
    amount: number;
    reason: string;
    referenceNumber?: string;
    approvedBy: string;
    approvedAt: Date;
  }>;
  allocations: Array<{
    id: string;
    paymentId: string;
    amount: number;
    allocatedAt: Date;
    payment: {
      id: string;
      receiptNumber: string;
      method: string;
      paymentDate: Date;
    };
  }>;
  serviceAccount: {
    id: string;
    accountNumber: string;
    plan: {
      id: string;
      code: string;
      name: string;
      type: string;
    };
    subscriber: {
      id: string;
      accountNumber: string;
      firstName: string;
      lastName: string;
    };
  };
}

/**
 * Generate monthly invoices for active service accounts
 */
export async function generateMonthlyBilling(
  fastify: FastifyInstance,
  params: {
    billingCycleId: string;
    serviceAccountIds?: string[];
    collectorId?: string;
    areaId?: string;
    dryRun?: boolean;
  }
): Promise<BillingGenerationResult> {
  const { billingCycleId, serviceAccountIds, collectorId, areaId, dryRun = false } = params;
  const actorId = fastify.requestUser?.id;
  const db = fastify.db;

  // Get billing cycle
  const billingCycle = await db.query.billingCycles.findFirst({
    where: eq(billingCycles.id, billingCycleId),
  });

  if (!billingCycle) {
    throw new Error('Billing cycle not found');
  }

  if (billingCycle.status === 'closed') {
    throw new Error('Cannot generate billing for closed cycle');
  }

  // Build service account query conditions
  const conditions = [eq(serviceAccounts.status, 'active')];
  
  if (serviceAccountIds && serviceAccountIds.length > 0) {
    conditions.push(inArray(serviceAccounts.id, serviceAccountIds));
  }
  if (collectorId) {
    conditions.push(eq(serviceAccounts.collectorId, collectorId));
  }
  if (areaId) {
    conditions.push(eq(subscribers.collectionAreaId, areaId));
  }

  // Also check billing start date
  conditions.push(
    or(
      isNull(serviceAccounts.billingStartDate),
      lte(serviceAccounts.billingStartDate, billingCycle.periodEnd)
    )!
  );

  const serviceAccountsList = await db.query.serviceAccounts.findMany({
    where: and(...conditions),
    with: {
      plan: true,
      subscriber: true,
      installationAddress: true,
    },
  });

  const results: BillingGenerationResult = {
    success: true,
    generated: 0,
    skipped: 0,
    errors: [],
    invoices: [],
  };

  for (const sa of serviceAccountsList) {
    try {
      // Check for existing invoice
      const existingInvoice = await db.query.invoices.findFirst({
        where: and(
          eq(invoices.serviceAccountId, sa.id),
          eq(invoices.billingCycleId, billingCycleId)
        ),
      });

      if (existingInvoice) {
        results.skipped++;
        results.errors.push(`Service account ${sa.accountNumber}: Invoice already exists`);
        continue;
      }

      // Calculate amounts
      const subscriptionCharge = sa.currentRate || sa.plan.monthlyRate;
      const installationFee = 0;
      const reconnectionFee = 0;
      
      // Check if this is first billing (activation date in this cycle)
      const isFirstBilling = sa.activationDate >= billingCycle.periodStart && sa.activationDate <= billingCycle.periodEnd;
      const firstInstallationFee = isFirstBilling ? sa.plan.installationFee : 0;

      // Calculate penalty if overdue
      let penalty = 0;
      
      const totalAmount = subscriptionCharge + firstInstallationFee + reconnectionFee + penalty;
      const balance = totalAmount;

      if (!dryRun) {
        // Create invoice in transaction
        const invoiceNumber = await generateInvoiceNumber(fastify);
        
        const [invoice] = await db.insert(invoices).values({
          invoiceNumber,
          serviceAccountId: sa.id,
          billingCycleId: billingCycle.id,
          status: 'unpaid',
          periodStart: billingCycle.periodStart,
          periodEnd: billingCycle.periodEnd,
          dueDate: billingCycle.dueDate,
          subscriptionCharge,
          installationFee: firstInstallationFee,
          reconnectionFee,
          discount: 0,
          penalty,
          adjustments: 0,
          totalAmount,
          paidAmount: 0,
          balance,
          generatedBy: actorId!,
          notes: `Auto-generated for ${billingCycle.name}`,
        }).returning();

        // Create invoice items
        await db.insert(invoiceItems).values([
          {
            invoiceId: invoice.id,
            description: `${sa.plan.name} - ${billingCycle.name}`,
            quantity: 1,
            unitPrice: subscriptionCharge,
            amount: subscriptionCharge,
            type: 'subscription',
            sortOrder: 1,
          },
          ...(firstInstallationFee > 0 ? [{
            invoiceId: invoice.id,
            description: 'Installation Fee',
            quantity: 1,
            unitPrice: firstInstallationFee,
            amount: firstInstallationFee,
            type: 'installation',
            sortOrder: 2,
          }] : []),
          ...(reconnectionFee > 0 ? [{
            invoiceId: invoice.id,
            description: 'Reconnection Fee',
            quantity: 1,
            unitPrice: reconnectionFee,
            amount: reconnectionFee,
            type: 'reconnection',
            sortOrder: 3,
          }] : []),
          ...(penalty > 0 ? [{
            invoiceId: invoice.id,
            description: 'Late Payment Penalty',
            quantity: 1,
            unitPrice: penalty,
            amount: penalty,
            type: 'penalty',
            sortOrder: 4,
          }] : []),
        ]);

        // Update service account billing date if first billing
        if (isFirstBilling) {
          await db.update(serviceAccounts)
            .set({ billingStartDate: billingCycle.periodStart })
            .where(eq(serviceAccounts.id, sa.id));
        }

        // Log audit
        await logAudit(fastify, {
          actorId: actorId!,
          action: 'invoice.generate',
          entityType: 'invoice',
          entityId: invoice.id,
          newValues: { invoiceNumber, totalAmount, serviceAccountId: sa.id },
          reason: `Generated invoice for ${billingCycle.name}`,
        });

        results.invoices.push({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          serviceAccountId: sa.id,
          totalAmount: invoice.totalAmount,
          balance: invoice.balance,
        });
      } else {
        results.invoices.push({
          id: 'dry-run',
          invoiceNumber: 'DRY-RUN',
          serviceAccountId: sa.id,
          totalAmount,
          balance,
        });
      }

      results.generated++;
    } catch (error) {
      results.errors.push(`Service account ${sa.accountNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  if (!dryRun && results.generated > 0) {
    // Update billing cycle status
    await db.update(billingCycles)
      .set({ 
        status: 'generating',
        generatedAt: new Date(),
        generatedBy: actorId,
      })
      .where(eq(billingCycles.id, billingCycleId));
  }

  return results;
}

/**
 * Finalize a billing cycle - makes invoices immutable
 */
export async function finalizeBillingCycle(
  fastify: FastifyInstance,
  billingCycleId: string
): Promise<void> {
  const actorId = fastify.requestUser?.id;
  const db = fastify.db;

  const cycle = await db.query.billingCycles.findFirst({
    where: eq(billingCycles.id, billingCycleId),
  });

  if (!cycle) {
    throw new Error('Billing cycle not found');
  }

  if (cycle.status === 'finalized' || cycle.status === 'closed') {
    throw new Error('Billing cycle already finalized or closed');
  }

  // Update all draft invoices to unpaid
  await db.update(invoices)
    .set({ status: 'unpaid' })
    .where(and(
      eq(invoices.billingCycleId, billingCycleId),
      eq(invoices.status, 'draft')
    ));

  // Update cycle status
  await db.update(billingCycles)
    .set({
      status: 'finalized',
      finalizedAt: new Date(),
      finalizedBy: actorId,
    })
    .where(eq(billingCycles.id, billingCycleId));

  await logAudit(fastify, {
    actorId: actorId!,
    action: 'billing_cycle.finalize',
    entityType: 'billing_cycle',
    entityId: billingCycleId,
    reason: `Finalized billing cycle ${cycle.name}`,
  });
}

/**
 * Get invoice with full details
 */
export async function getInvoiceWithDetails(fastify: FastifyInstance, invoiceId: string): Promise<InvoiceWithDetails | null> {
  const db = fastify.db;
  
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
    with: {
      items: true,
      adjustments: true,
      allocations: {
        with: {
          payment: true,
        },
      },
      serviceAccount: {
        with: {
          plan: true,
          subscriber: true,
        },
      },
      billingCycle: true,
    },
  });

  if (!invoice) return null;

  return {
    ...invoice,
    items: invoice.items.map(item => ({
      ...item,
      amount: Number(item.amount),
      unitPrice: Number(item.unitPrice),
    })),
    adjustments: invoice.adjustments.map(adj => ({
      ...adj,
      amount: Number(adj.amount),
    })),
    allocations: invoice.allocations.map(alloc => ({
      ...alloc,
      amount: Number(alloc.amount),
      payment: {
        ...alloc.payment,
        amount: Number(alloc.payment.amount),
      },
    })),
    subscriptionCharge: Number(invoice.subscriptionCharge),
    installationFee: Number(invoice.installationFee),
    reconnectionFee: Number(invoice.reconnectionFee),
    discount: Number(invoice.discount),
    penalty: Number(invoice.penalty),
    adjustmentsAmount: Number(invoice.adjustments),
    totalAmount: Number(invoice.totalAmount),
    paidAmount: Number(invoice.paidAmount),
    balance: Number(invoice.balance),
  };
}

/**
 * Update invoice status (for adjustments, voiding, etc.)
 */
export async function updateInvoice(
  fastify: FastifyInstance,
  invoiceId: string,
  data: {
    status?: string;
    discount?: number;
    penalty?: number;
    adjustments?: number;
    notes?: string;
    voidReason?: string;
  },
  actorId: string
): Promise<void> {
  const db = fastify.db;
  
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
  });

  if (!invoice) {
    throw new Error('Invoice not found');
  }

  if (invoice.status === 'void' || invoice.status === 'paid') {
    throw new Error('Cannot modify void or paid invoice');
  }

  const oldValues = { ...invoice };
  
  // Calculate new totals
  let newTotalAmount = Number(invoice.subscriptionCharge) + Number(invoice.installationFee) + Number(invoice.reconnectionFee);
  newTotalAmount = newTotalAmount - (data.discount ?? Number(invoice.discount)) + (data.penalty ?? Number(invoice.penalty)) + (data.adjustments ?? Number(invoice.adjustmentsAmount));
  
  const newBalance = newTotalAmount - Number(invoice.paidAmount);

  const updates: any = { ...data };
  if (data.status) updates.status = data.status;
  if (data.discount !== undefined) updates.discount = data.discount;
  if (data.penalty !== undefined) updates.penalty = data.penalty;
  if (data.adjustments !== undefined) updates.adjustmentsAmount = data.adjustments;
  updates.totalAmount = newTotalAmount;
  updates.balance = newBalance;
  updates.updatedAt = new Date();

  if (data.status === 'void' && data.voidReason) {
    updates.voidedAt = new Date();
    updates.voidedBy = actorId;
  }

  await db.update(invoices)
    .set(updates)
    .where(eq(invoices.id, invoiceId));

  // Log audit
  await db.insert(auditLogs).values({
    actorId,
    action: data.status === 'void' ? 'invoice.void' : 'invoice.update',
    entityType: 'invoice',
    entityId: invoiceId,
    oldValues,
    newValues: updates,
    reason: data.voidReason || data.notes || 'Invoice updated',
  });
}

/**
 * Create billing cycle
 */
export async function createBillingCycle(fastify: FastifyInstance, data: {
  name: string;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
}, actorId: string) {
  const db = fastify.db;
  
  const periodStartStr = data.periodStart.toISOString().split('T')[0];
  const periodEndStr = data.periodEnd.toISOString().split('T')[0];
  
  const existing = await db.query.billingCycles.findFirst({
    where: and(
      eq(billingCycles.periodStart, periodStartStr),
      eq(billingCycles.periodEnd, periodEndStr)
    ),
  });

  if (existing) {
    throw new Error('Billing cycle for this period already exists');
  }

  const [cycle] = await db.insert(billingCycles).values({
    name: data.name,
    periodStart: periodStartStr,
    periodEnd: periodEndStr,
    dueDate: data.dueDate.toISOString().split('T')[0],
    status: 'open',
    generatedBy: actorId,
  }).returning();

  await logAudit(fastify, {
    actorId,
    action: 'billing_cycle.create',
    entityType: 'billing_cycle',
    entityId: cycle.id,
    newValues: cycle,
    reason: `Created billing cycle ${cycle.name}`,
  });

  return cycle;
}

/**
 * List billing cycles
 */
export async function listBillingCycles(fastify: FastifyInstance, params: {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  const { page, limit, sortBy = 'periodStart', sortOrder = 'desc' } = params;
  const offset = (page - 1) * limit;
  const db = fastify.db;

  const orderColumn = billingCycles[sortBy as keyof typeof billingCycles] || billingCycles.periodStart;
  const orderFn = sortOrder === 'asc' ? asc : desc;

  const [items, totalResult] = await Promise.all([
    db.query.billingCycles.findMany({
      limit,
      offset,
      orderBy: orderFn(orderColumn),
      with: {
        generator: true,
        finalizer: true,
      },
    }),
    db.select({ count: count() }).from(billingCycles),
  ]);

  return {
    items: items.map(c => ({
      ...c,
      generatedBy: c.generator?.fullName,
      finalizedBy: c.finalizer?.fullName,
    })),
    meta: {
      page,
      limit,
      total: totalResult[0].count,
      totalPages: Math.ceil(totalResult[0].count / limit),
    },
  };
}

/**
 * List invoices with filters
 */
export async function listInvoices(fastify: FastifyInstance, params: {
  page: number;
  limit: number;
  serviceAccountId?: string;
  subscriberId?: string;
  billingCycleId?: string;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  const { page, limit, ...filters } = params;
  const offset = (page - 1) * limit;
  const db = fastify.db;

  const conditions = [];
  if (filters.serviceAccountId) conditions.push(eq(invoices.serviceAccountId, filters.serviceAccountId));
  if (filters.billingCycleId) conditions.push(eq(invoices.billingCycleId, filters.billingCycleId));
  if (filters.status) conditions.push(eq(invoices.status, filters.status as any));
  if (filters.dateFrom) conditions.push(gte(invoices.generatedAt, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(invoices.generatedAt, filters.dateTo));
  if (filters.dueDateFrom) conditions.push(gte(invoices.dueDate, filters.dueDateFrom.toISOString().split('T')[0]));
  if (filters.dueDateTo) conditions.push(lte(invoices.dueDate, filters.dueDateTo.toISOString().split('T')[0]));

  // For subscriberId, need to join through serviceAccounts
  if (filters.subscriberId) {
    const saIds = await db.select({ id: serviceAccounts.id })
      .from(serviceAccounts)
      .where(eq(serviceAccounts.subscriberId, filters.subscriberId));
    if (saIds.length > 0) {
      conditions.push(inArray(invoices.serviceAccountId, saIds.map(s => s.id)));
    } else {
      return { items: [], meta: { page, limit, total: 0, totalPages: 0 } };
    }
  }

  const orderColumn = invoices[filters.sortBy as keyof typeof invoices] || invoices.generatedAt;
  const orderFn = filters.sortOrder === 'asc' ? asc : desc;

  const [items, totalResult] = await Promise.all([
    db.query.invoices.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      limit,
      offset,
      orderBy: orderFn(orderColumn),
      with: {
        serviceAccount: {
          with: {
            plan: true,
            subscriber: true,
          },
        },
        billingCycle: true,
      },
    }),
    db.select({ count: count() }).from(invoices).where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  return {
    items: items.map(inv => ({
      ...inv,
      subscriptionCharge: Number(inv.subscriptionCharge),
      installationFee: Number(inv.installationFee),
      reconnectionFee: Number(inv.reconnectionFee),
      discount: Number(inv.discount),
      penalty: Number(inv.penalty),
      adjustments: Number(inv.adjustments),
      totalAmount: Number(inv.totalAmount),
      paidAmount: Number(inv.paidAmount),
      balance: Number(inv.balance),
      serviceAccount: inv.serviceAccount ? {
        ...inv.serviceAccount,
        plan: inv.serviceAccount.plan ? {
          ...inv.serviceAccount.plan,
          monthlyRate: Number(inv.serviceAccount.plan.monthlyRate),
        } : undefined,
        subscriber: inv.serviceAccount.subscriber ? {
          ...inv.serviceAccount.subscriber,
        } : undefined,
      } : undefined,
    })),
    meta: {
      page,
      limit,
      total: totalResult[0].count,
      totalPages: Math.ceil(totalResult[0].count / limit),
    },
  };
}

// Helper function for audit logging
async function logAudit(fastify: FastifyInstance, data: {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: any;
  newValues?: any;
  reason?: string;
}) {
  const db = fastify.db;
  await db.insert(auditLogs).values({
    ...data,
    ipAddress: fastify.requestIp,
    userAgent: fastify.requestHeaders?.['user-agent'],
  });
}