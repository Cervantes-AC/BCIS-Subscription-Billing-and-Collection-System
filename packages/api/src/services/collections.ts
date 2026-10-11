/**
 * Collections Service - Collection batch management, remittance, reconciliation
 */

import { 
  collectionAreas, 
  collectorAssignments, 
  collectionBatches, 
  collectionBatchAccounts, 
  collectorRemittances,
  serviceAccounts,
  subscribers,
  payments,
  users,
  auditLogs,
  invoices,
} from '@bcis/db/schema';
import { eq, and, or, gte, lte, isNull, not, inArray, sql, desc, asc, sum, count } from 'drizzle-orm';
import { generateBatchNumber } from '../utils/numbering';
import type { FastifyInstance } from 'fastify';
import { sortColumn } from '../utils/sort-column';

export interface RouteSheetItem {
  serviceAccountId: string;
  serviceAccountNumber: string;
  subscriberId: string;
  subscriberName: string;
  subscriberContact: string;
  address: string;
  collectorName: string;
  currentBill: number;
  arrears: number;
  totalDue: number;
  planName: string;
  serviceType: string;
}

export interface CollectionBatchSummary {
  batchId: string;
  batchNumber: string;
  collectorId: string;
  collectorName: string;
  areaId: string;
  areaName: string;
  status: string;
  collectionDate: Date;
  expectedCash: number;
  expectedNonCash: number;
  actualCash: number;
  actualNonCash: number;
  shortage: number;
  overage: number;
  totalAccounts: number;
  collectedAccounts: number;
  uncollectedAccounts: number;
  accounts: Array<{
    serviceAccountId: string;
    serviceAccountNumber: string;
    subscriberName: string;
    address: string;
    currentBill: number;
    arrears: number;
    totalDue: number;
    collectedAmount: number;
    collectedMethod?: string;
    collectedAt?: Date;
    receiptNumber?: string;
    status: 'uncollected' | 'collected' | 'partial';
  }>;
}

/**
 * Create a new collection batch
 */
export async function createCollectionBatch(
  fastify: FastifyInstance,
  data: {
    collectorId: string;
    areaId: string;
    collectionDate: Date;
    serviceAccountIds: string[];
  }
) {
  const actorId = fastify.requestUser?.id;
  if (!actorId) throw new Error('User not authenticated');
  const db = fastify.db;

  // Verify collector and area
  const collector = await db.query.users.findFirst({ where: eq(users.id, data.collectorId) });
  if (!collector) throw new Error('Collector not found');

  const area = await db.query.collectionAreas.findFirst({ where: eq(collectionAreas.id, data.areaId) });
  if (!area) throw new Error('Collection area not found');

  // Verify service accounts belong to this area/collector
  const serviceAccountsList = await db.query.serviceAccounts.findMany({
    where: and(
      inArray(serviceAccounts.id, data.serviceAccountIds),
      eq(serviceAccounts.status, 'active')
    ),
    with: {
      subscriber: true,
      plan: true,
      installationAddress: true,
    },
  });

  if (serviceAccountsList.length !== data.serviceAccountIds.length) {
    throw new Error('Some service accounts not found or not active');
  }

  // Calculate expected amounts
  let expectedCash = 0;

  for (const sa of serviceAccountsList) {
    // Get unpaid invoices for this service account
    const unpaidInvoices = await db.query.invoices.findMany({
      where: and(
        eq(invoices.serviceAccountId, sa.id),
        or(
          eq(invoices.status, 'unpaid'),
          eq(invoices.status, 'partially_paid'),
          eq(invoices.status, 'overdue')
        )
      ),
    });

    const totalDue = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.balance), 0);
    expectedCash += totalDue; // Assume all cash for expected
  }

  const batchNumber = await generateBatchNumber(fastify);

  const [batch] = await db.transaction(async (tx) => {
    const [newBatch] = await tx.insert(collectionBatches).values({
      batchNumber,
      collectorId: data.collectorId,
      areaId: data.areaId,
      status: 'open',
      collectionDate: data.collectionDate.toISOString().slice(0, 10),
      expectedCash,
      expectedNonCash: 0,
      actualCash: 0,
      actualNonCash: 0,
      shortage: 0,
      overage: 0,
      openedBy: actorId,
      notes: `Generated for ${area.name} on ${data.collectionDate.toISOString().split('T')[0]}`,
    }).returning();

    // Create batch accounts
    for (const sa of serviceAccountsList) {
      const unpaidInvoices = await tx.query.invoices.findMany({
        where: and(
          eq(invoices.serviceAccountId, sa.id),
          or(
            eq(invoices.status, 'unpaid'),
            eq(invoices.status, 'partially_paid'),
            eq(invoices.status, 'overdue')
          )
        ),
      });

      const currentBill = unpaidInvoices
        .filter(inv => inv.periodStart >= newBatch.collectionDate || inv.periodEnd >= newBatch.collectionDate)
        .reduce((sum, inv) => sum + Number(inv.balance), 0);
      
      const arrears = unpaidInvoices
        .filter(inv => inv.periodEnd < newBatch.collectionDate)
        .reduce((sum, inv) => sum + Number(inv.balance), 0);

      const totalDue = currentBill + arrears;

      await tx.insert(collectionBatchAccounts).values({
        batchId: newBatch.id,
        serviceAccountId: sa.id,
        currentBill,
        arrears,
        totalDue,
        collectedAmount: 0,
      });
    }

    // Log audit
    await tx.insert(auditLogs).values({
      actorId,
      action: 'collection_batch.create',
      entityType: 'collection_batch',
      entityId: newBatch.id,
      newValues: { batchNumber, collectorId: data.collectorId, areaId: data.areaId, expectedCash },
      reason: `Created collection batch for ${area.name}`,
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });

    return [newBatch];
  });

  return batch;
}

/**
 * Get collection batch with full details
 */
export async function getCollectionBatch(fastify: FastifyInstance, batchId: string): Promise<CollectionBatchSummary | null> {
  const db = fastify.db;
  
  const batch = await db.query.collectionBatches.findFirst({
    where: eq(collectionBatches.id, batchId),
    with: {
      collector: true,
      area: true,
      accounts: {
        with: {
          serviceAccount: {
            with: {
              subscriber: true,
              plan: true,
              installationAddress: true,
            },
          },
          payment: true,
        },
      },
      remittances: true,
    },
  });

  if (!batch) return null;

  const accounts = batch.accounts.map(acc => {
    const sa = acc.serviceAccount;
    const subscriber = sa.subscriber;
    const address = sa.installationAddress;
    
    let status: 'uncollected' | 'collected' | 'partial' = 'uncollected';
    if (acc.collectedAmount > 0) {
      status = acc.collectedAmount >= acc.totalDue ? 'collected' : 'partial';
    }

    return {
      serviceAccountId: sa.id,
      serviceAccountNumber: sa.accountNumber,
      subscriberName: `${subscriber.firstName} ${subscriber.lastName}`,
      address: `${address.street}, ${address.barangay}, ${address.city}`,
      currentBill: Number(acc.currentBill),
      arrears: Number(acc.arrears),
      totalDue: Number(acc.totalDue),
      collectedAmount: Number(acc.collectedAmount),
      collectedMethod: acc.collectedMethod ?? undefined,
      collectedAt: acc.collectedAt ?? undefined,
      receiptNumber: acc.receiptNumber ?? undefined,
      status,
    };
  });

  const collectedAccounts = accounts.filter(a => a.status !== 'uncollected').length;
  const actualCash = batch.remittances.reduce((sum, r) => sum + Number(r.cashAmount), 0);
  const actualNonCash = batch.remittances.reduce((sum, r) => sum + Number(r.nonCashAmount), 0);

  return {
    batchId: batch.id,
    batchNumber: batch.batchNumber,
    collectorId: batch.collectorId,
    collectorName: batch.collector?.fullName || '',
    areaId: batch.areaId,
    areaName: batch.area?.name || '',
    status: batch.status,
    collectionDate: new Date(batch.collectionDate),
    expectedCash: Number(batch.expectedCash),
    expectedNonCash: Number(batch.expectedNonCash),
    actualCash: Number(batch.actualCash),
    actualNonCash: Number(batch.actualNonCash),
    shortage: Number(batch.shortage),
    overage: Number(batch.overage),
    totalAccounts: accounts.length,
    collectedAccounts,
    uncollectedAccounts: accounts.length - collectedAccounts,
    accounts,
  };
}

/**
 * Record collection for a batch account
 */
export async function recordCollection(
  fastify: FastifyInstance,
  data: {
    batchId: string;
    serviceAccountId: string;
    collectedAmount: number;
    collectedMethod?: 'cash' | 'gcash' | 'bank_transfer' | 'cheque' | 'other';
    collectedAt?: Date;
    notes?: string;
    receiptNumber?: string;
    paymentId?: string;
  }
) {
  const actorId = fastify.requestUser?.id;
  if (!actorId) throw new Error('User not authenticated');
  const db = fastify.db;

  const batchAccount = await db.query.collectionBatchAccounts.findFirst({
    where: and(
      eq(collectionBatchAccounts.batchId, data.batchId),
      eq(collectionBatchAccounts.serviceAccountId, data.serviceAccountId)
    ),
    with: { batch: true },
  });

  if (!batchAccount) throw new Error('Batch account not found');
  if (batchAccount.batch.status === 'closed' || batchAccount.batch.status === 'reconciled') {
    throw new Error('Cannot record collection for closed/reconciled batch');
  }
  if (data.collectedAmount > Number(batchAccount.totalDue)) {
    throw new Error('Collected amount exceeds total due');
  }

  await db.transaction(async (tx) => {
    await tx.update(collectionBatchAccounts)
      .set({
        collectedAmount: data.collectedAmount,
        collectedMethod: data.collectedMethod,
        collectedAt: data.collectedAt || new Date(),
        notes: data.notes,
        receiptNumber: data.receiptNumber,
        paymentId: data.paymentId,
        updatedAt: new Date(),
      })
      .where(eq(collectionBatchAccounts.id, batchAccount.id));

    // Update batch actual amounts
    const batchAccounts = await tx.query.collectionBatchAccounts.findMany({
      where: eq(collectionBatchAccounts.batchId, data.batchId),
    });

    const actualCash = batchAccounts
      .filter(a => a.collectedMethod === 'cash')
      .reduce((sum, a) => sum + Number(a.collectedAmount), 0);
    
    const actualNonCash = batchAccounts
      .filter(a => a.collectedMethod && a.collectedMethod !== 'cash')
      .reduce((sum, a) => sum + Number(a.collectedAmount), 0);

    await tx.update(collectionBatches)
      .set({
        actualCash,
        actualNonCash,
        status: 'in_progress',
        updatedAt: new Date(),
      })
      .where(eq(collectionBatches.id, data.batchId));

    await tx.insert(auditLogs).values({
      actorId,
      action: 'collection.record',
      entityType: 'collection_batch_account',
      entityId: batchAccount.id,
      newValues: { collectedAmount: data.collectedAmount, method: data.collectedMethod },
      reason: data.notes || `Collection recorded for batch ${batchAccount.batch.batchNumber}`,
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });
  });
}

/**
 * Submit collector remittance
 */
export async function submitRemittance(
  fastify: FastifyInstance,
  data: {
    batchId: string;
    cashAmount: number;
    nonCashAmount: number;
    remittanceDate: Date;
    notes?: string;
  }
) {
  const actorId = fastify.requestUser?.id;
  if (!actorId) throw new Error('User not authenticated');
  const db = fastify.db;

  const batch = await db.query.collectionBatches.findFirst({
    where: eq(collectionBatches.id, data.batchId),
    with: { accounts: true },
  });

  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'in_progress' && batch.status !== 'submitted') {
    throw new Error('Batch must be in progress or submitted for remittance');
  }

  // Calculate shortage/overage
  const shortage = Math.max(0, Number(batch.expectedCash) - data.cashAmount);
  const overage = Math.max(0, data.cashAmount - Number(batch.expectedCash));

  await db.transaction(async (tx) => {
    // Create remittance record
    await tx.insert(collectorRemittances).values({
      batchId: data.batchId,
      collectorId: batch.collectorId,
      cashAmount: data.cashAmount,
      nonCashAmount: data.nonCashAmount,
      remittanceDate: data.remittanceDate.toISOString().slice(0, 10),
      remittedBy: actorId,
      notes: data.notes,
    });

    // Update batch
    await tx.update(collectionBatches)
      .set({
        status: 'remitted',
        actualCash: data.cashAmount,
        actualNonCash: data.nonCashAmount,
        shortage,
        overage,
        remittedAt: new Date(),
        remittedBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(collectionBatches.id, data.batchId));

    await tx.insert(auditLogs).values({
      actorId,
      action: 'collection.remit',
      entityType: 'collection_batch',
      entityId: data.batchId,
      newValues: { cashAmount: data.cashAmount, nonCashAmount: data.nonCashAmount, shortage, overage },
      reason: data.notes || `Remittance submitted for batch ${batch.batchNumber}`,
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });
  });

  return { shortage, overage };
}

/**
 * Reconcile collection batch
 */
export async function reconcileBatch(
  fastify: FastifyInstance,
  batchId: string,
  data: {
    actualCash: number;
    actualNonCash: number;
    notes?: string;
  }
) {
  const actorId = fastify.requestUser?.id;
  if (!actorId) throw new Error('User not authenticated');
  const db = fastify.db;

  const batch = await db.query.collectionBatches.findFirst({
    where: eq(collectionBatches.id, batchId),
    with: { remittances: true },
  });

  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'remitted') {
    throw new Error('Batch must be remitted before reconciliation');
  }

  const shortage = Math.max(0, Number(batch.expectedCash) - data.actualCash);
  const overage = Math.max(0, data.actualCash - Number(batch.expectedCash));

  await db.transaction(async (tx) => {
    await tx.update(collectionBatches)
      .set({
        status: 'reconciled',
        actualCash: data.actualCash,
        actualNonCash: data.actualNonCash,
        shortage,
        overage,
        reconciledAt: new Date(),
        reconciledBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(collectionBatches.id, batchId));

    await tx.insert(auditLogs).values({
      actorId,
      action: 'collection.reconcile',
      entityType: 'collection_batch',
      entityId: batchId,
      newValues: { actualCash: data.actualCash, actualNonCash: data.actualNonCash, shortage, overage },
      reason: data.notes || `Batch ${batch.batchNumber} reconciled`,
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });
  });

  return { shortage, overage };
}

/**
 * Close collection batch (requires authorization)
 */
export async function closeBatch(
  fastify: FastifyInstance,
  batchId: string
) {
  const actorId = fastify.requestUser?.id;
  if (!actorId) throw new Error('User not authenticated');
  const db = fastify.db;

  const batch = await db.query.collectionBatches.findFirst({
    where: eq(collectionBatches.id, batchId),
  });

  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'reconciled') {
    throw new Error('Batch must be reconciled before closing');
  }
  if (batch.shortage > 0) {
    throw new Error('Cannot close batch with shortage. Requires authorization to override.');
  }

  await db.transaction(async (tx) => {
    await tx.update(collectionBatches)
      .set({
        status: 'closed',
        closedAt: new Date(),
        closedBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(collectionBatches.id, batchId));

    await tx.insert(auditLogs).values({
      actorId,
      action: 'collection.close',
      entityType: 'collection_batch',
      entityId: batchId,
      newValues: { status: 'closed' },
      reason: `Batch ${batch.batchNumber} closed`,
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });
  });
}

/**
 * Get printable route sheet for a batch
 */
export async function getRouteSheet(fastify: FastifyInstance, batchId: string): Promise<RouteSheetItem[]> {
  const db = fastify.db;
  
  const batch = await db.query.collectionBatches.findFirst({
    where: eq(collectionBatches.id, batchId),
    with: {
      collector: true,
      accounts: {
        with: {
          serviceAccount: {
            with: {
              subscriber: true,
              plan: true,
              installationAddress: true,
            },
          },
        },
      },
    },
  });

  if (!batch) throw new Error('Batch not found');

  return batch.accounts.map(acc => {
    const sa = acc.serviceAccount;
    const sub = sa.subscriber;
    const addr = sa.installationAddress;
    
    return {
      serviceAccountId: sa.id,
      serviceAccountNumber: sa.accountNumber,
      subscriberId: sub.id,
      subscriberName: `${sub.firstName} ${sub.lastName}`,
      subscriberContact: sub.contactNumber,
      address: `${addr.street}, ${addr.barangay}, ${addr.city} ${addr.zipCode}`,
      collectorName: batch.collector?.fullName || '',
      currentBill: Number(acc.currentBill),
      arrears: Number(acc.arrears),
      totalDue: Number(acc.totalDue),
      planName: sa.plan.name,
      serviceType: sa.plan.type,
    };
  });
}

/**
 * List collection batches
 */
export async function listCollectionBatches(params: {
  page: number;
  limit: number;
  collectorId?: string;
  areaId?: string;
  status?: string;
  collectionDateFrom?: Date;
  collectionDateTo?: Date;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}, fastify: FastifyInstance) {
  const { page, limit, ...filters } = params;
  const offset = (page - 1) * limit;
  const db = fastify.db;

  const conditions = [];
  if (filters.collectorId) conditions.push(eq(collectionBatches.collectorId, filters.collectorId));
  if (filters.areaId) conditions.push(eq(collectionBatches.areaId, filters.areaId));
  if (filters.status) conditions.push(eq(collectionBatches.status, filters.status as any));
  if (filters.collectionDateFrom) conditions.push(gte(collectionBatches.collectionDate, filters.collectionDateFrom.toISOString().slice(0, 10)));
  if (filters.collectionDateTo) conditions.push(lte(collectionBatches.collectionDate, filters.collectionDateTo.toISOString().slice(0, 10)));

  const orderColumn = sortColumn({ collectionDate: collectionBatches.collectionDate, batchNumber: collectionBatches.batchNumber, status: collectionBatches.status, createdAt: collectionBatches.createdAt }, filters.sortBy, 'collectionDate');
  const orderFn = filters.sortOrder === 'asc' ? asc : desc;

  const [items, totalResult] = await Promise.all([
    db.query.collectionBatches.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      limit,
      offset,
      orderBy: orderFn(orderColumn),
      with: {
        collector: true,
        area: true,
      },
    }),
    db.select({ count: count() }).from(collectionBatches).where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  return {
    items: items.map(b => ({
      ...b,
      expectedCash: Number(b.expectedCash),
      expectedNonCash: Number(b.expectedNonCash),
      actualCash: Number(b.actualCash),
      actualNonCash: Number(b.actualNonCash),
      shortage: Number(b.shortage),
      overage: Number(b.overage),
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
 * List collection areas
 */
export async function listCollectionAreas(params: {
  page: number;
  limit: number;
  isActive?: boolean;
}, fastify: FastifyInstance) {
  const { page, limit, isActive } = params;
  const offset = (page - 1) * limit;
  const db = fastify.db;

  const conditions = [];
  if (isActive !== undefined) conditions.push(eq(collectionAreas.isActive, isActive));

  const [items, totalResult] = await Promise.all([
    db.query.collectionAreas.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      limit,
      offset,
      orderBy: asc(collectionAreas.name),
      with: { collector: true },
    }),
    db.select({ count: count() }).from(collectionAreas).where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  return {
    items,
    meta: { page, limit, total: totalResult[0].count, totalPages: Math.ceil(totalResult[0].count / limit) },
  };
}

/**
 * Create collection area
 */
export async function createCollectionArea(
  fastify: FastifyInstance,
  data: { code: string; name: string; description?: string; collectorId?: string }
) {
  const actorId = fastify.requestUser?.id;
  if (!actorId) throw new Error('User not authenticated');
  const db = fastify.db;

  const [area] = await db.insert(collectionAreas).values({
    ...data,
    createdBy: actorId,
  }).returning();

  await db.insert(auditLogs).values({
    actorId,
    action: 'collection_area.create',
    entityType: 'collection_area',
    entityId: area.id,
    newValues: area,
    reason: `Created collection area ${area.name}`,
    ipAddress: fastify.requestIp,
    userAgent: fastify.requestHeaders?.['user-agent'],
  });

  return area;
}

/**
 * Assign collector to area
 */
export async function assignCollector(
  fastify: FastifyInstance,
  data: { collectorId: string; areaId: string }
) {
  const actorId = fastify.requestUser?.id;
  if (!actorId) throw new Error('User not authenticated');
  const db = fastify.db;

  // End any existing active assignment for this collector in this area
  await db.update(collectorAssignments)
    .set({ isActive: false, endedAt: new Date() })
    .where(and(
      eq(collectorAssignments.collectorId, data.collectorId),
      eq(collectorAssignments.areaId, data.areaId),
      eq(collectorAssignments.isActive, true)
    ));

  const [assignment] = await db.insert(collectorAssignments).values({
    collectorId: data.collectorId,
    areaId: data.areaId,
    assignedBy: actorId,
    isActive: true,
  }).returning();

  // Update area's default collector
  await db.update(collectionAreas)
    .set({ collectorId: data.collectorId, updatedBy: actorId })
    .where(eq(collectionAreas.id, data.areaId));

  await db.insert(auditLogs).values({
    actorId,
    action: 'collector.assign',
    entityType: 'collector_assignment',
    entityId: assignment.id,
    newValues: assignment,
    reason: `Assigned collector to area`,
    ipAddress: fastify.requestIp,
    userAgent: fastify.requestHeaders?.['user-agent'],
  });

  return assignment;
}

/** Return active users eligible for collection route assignment. */
export async function listCollectionCollectors(fastify: FastifyInstance) {
  const activeUsers = await fastify.db.query.users.findMany({
    where: eq(users.status, 'active'),
    with: { role: true },
    orderBy: asc(users.fullName),
  });
  const items = activeUsers
    .filter((user) => user.role?.name === 'collection_supervisor' || user.role?.name === 'collector')
    .map(({ passwordHash: _passwordHash, ...user }) => user);
  return { items, meta: { total: items.length } };
}
