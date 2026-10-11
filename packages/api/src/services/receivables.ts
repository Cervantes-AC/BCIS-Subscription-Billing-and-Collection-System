/**
 * Receivables Service - AR aging, overdue monitoring, suspension candidates
 */

import { 
  invoices, 
  serviceAccounts, 
  subscribers, 
  servicePlans,
  payments,
  collectionAreas,
  users,
  suspensionRecords,
  reconnectionRecords,
  applicationSettings,
} from '@bcis/db/schema';
import { eq, and, or, gte, lte, isNull, not, inArray, sql, desc, asc, sum, count } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

export interface AgingBucket {
  bucket: 'current' | '1-30' | '31-60' | '61-90' | '90+';
  label: string;
  count: number;
  amount: number; // in centavos
}

export interface OverdueAccount {
  subscriber: {
    id: string;
    accountNumber: string;
    firstName: string;
    lastName: string;
    contactNumber: string;
    status: string;
  };
  serviceAccount: {
    id: string;
    accountNumber: string;
    plan: {
      id: string;
      code: string;
      name: string;
      type: string;
    };
    status: string;
    collectorId?: string;
  };
  collector?: {
    id: string;
    fullName: string;
  };
  area?: {
    id: string;
    name: string;
  };
  monthsUnpaid: number;
  oldestUnpaidInvoice: {
    id: string;
    invoiceNumber: string;
    dueDate: Date;
    balance: number;
  } | null;
  lastPayment: {
    id: string;
    receiptNumber: string;
    paymentDate: Date;
    amount: number;
  } | null;
  totalArrears: number; // in centavos
  currentBill: number; // in centavos
  agingBuckets: AgingBucket[];
}

export interface ReceivablesSummary {
  totalReceivable: number;
  currentReceivable: number;
  overdueReceivable: number;
  overdueCount: number;
  suspensionCandidates: number;
  agingBuckets: AgingBucket[];
}

/**
 * Calculate AR aging as of a specific date
 */
export async function calculateAging(
  fastify: FastifyInstance,
  asOfDate: Date = new Date(), 
  filters?: {
    collectorId?: string;
    areaId?: string;
    planId?: string;
    serviceType?: 'internet' | 'cable' | 'combo';
  }
): Promise<{ summary: ReceivablesSummary; details: OverdueAccount[] }> {
  const db = fastify.db;
  
  // Build base query for active service accounts with unpaid invoices
  let saConditions = [eq(serviceAccounts.status, 'active')];
  
  if (filters?.collectorId) saConditions.push(eq(serviceAccounts.collectorId, filters.collectorId));
  if (filters?.planId) saConditions.push(eq(serviceAccounts.planId, filters.planId));
  if (filters?.serviceType) saConditions.push(eq(servicePlans.type, filters.serviceType));
  
  // If area filter, need to join through subscribers
  const serviceAccountsList = await db.query.serviceAccounts.findMany({
    where: and(...saConditions),
    with: {
      plan: true,
      subscriber: {
        with: {
          collector: true,
        },
      },
      collector: true,
    },
  });

  // Filter by area if needed
  let filteredAccounts = serviceAccountsList;
  if (filters?.areaId) {
    filteredAccounts = serviceAccountsList.filter(sa => sa.subscriber.collectionAreaId === filters.areaId);
  }

  const saIds = filteredAccounts.map(sa => sa.id);
  if (saIds.length === 0) {
    return {
      summary: {
        totalReceivable: 0,
        currentReceivable: 0,
        overdueReceivable: 0,
        overdueCount: 0,
        suspensionCandidates: 0,
        agingBuckets: [
          { bucket: 'current', label: 'Current', count: 0, amount: 0 },
          { bucket: '1-30', label: '1-30 Days', count: 0, amount: 0 },
          { bucket: '31-60', label: '31-60 Days', count: 0, amount: 0 },
          { bucket: '61-90', label: '61-90 Days', count: 0, amount: 0 },
          { bucket: '90+', label: '90+ Days', count: 0, amount: 0 },
        ],
      },
      details: [],
    };
  }

  // Get all unpaid/partially paid invoices for these service accounts
  const unpaidInvoices = await db.query.invoices.findMany({
    where: and(
      inArray(invoices.serviceAccountId, saIds),
      or(
        eq(invoices.status, 'unpaid'),
        eq(invoices.status, 'partially_paid'),
        eq(invoices.status, 'overdue')
      )
    ),
    with: {
      serviceAccount: {
        with: {
          plan: true,
          subscriber: {
            with: {
              collector: true,
            },
          },
          collector: true,
        },
      },
    },
  });

  // Get last payment for each service account
  const lastPayments = await db.query.payments.findMany({
    where: and(
      inArray(payments.subscriberId, filteredAccounts.map(sa => sa.subscriberId)),
      or(eq(payments.status, 'posted'), eq(payments.status, 'verified')),
    ),
    orderBy: desc(payments.paymentDate),
  });

  // Group last payments by subscriber
  const lastPaymentMap = new Map<string, typeof lastPayments[0]>();
  for (const p of lastPayments) {
    if (!lastPaymentMap.has(p.subscriberId)) {
      lastPaymentMap.set(p.subscriberId, p);
    }
  }

  // Calculate aging for each invoice
  const agingBuckets: AgingBucket[] = [
    { bucket: 'current', label: 'Current', count: 0, amount: 0 },
    { bucket: '1-30', label: '1-30 Days', count: 0, amount: 0 },
    { bucket: '31-60', label: '31-60 Days', count: 0, amount: 0 },
    { bucket: '61-90', label: '61-90 Days', count: 0, amount: 0 },
    { bucket: '90+', label: '90+ Days', count: 0, amount: 0 },
  ];

  // Group invoices by service account
  const invoicesBySA = new Map<string, typeof unpaidInvoices>();
  for (const inv of unpaidInvoices) {
    const key = inv.serviceAccountId;
    if (!invoicesBySA.has(key)) invoicesBySA.set(key, []);
    invoicesBySA.get(key)!.push(inv);
  }

  const details: OverdueAccount[] = [];
  let totalReceivable = 0;
  let currentReceivable = 0;
  let overdueReceivable = 0;
  let overdueCount = 0;
  let suspensionCandidates = 0;

  // Get suspension threshold from settings
  const suspensionThresholdSetting = await db.query.applicationSettings.findFirst({
    where: eq(applicationSettings.key, 'suspension_threshold'),
  }) || { value: '2' };
  const suspensionThreshold = parseInt(suspensionThresholdSetting.value, 10) || 2;

  for (const sa of filteredAccounts) {
    const saInvoices = invoicesBySA.get(sa.id) || [];
    if (saInvoices.length === 0) continue;

    const totalArrears = saInvoices.reduce((sum, inv) => sum + Number(inv.balance), 0);
    
    // Find oldest unpaid invoice
    const oldestInvoice = saInvoices.reduce((oldest, inv) => 
      inv.dueDate < oldest.dueDate ? inv : oldest
    );

    // Calculate months unpaid
    const monthsUnpaid = Math.ceil(
      (asOfDate.getTime() - oldestInvoice.dueDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
    );

    // Calculate aging buckets for this service account's invoices
    const saAgingBuckets: AgingBucket[] = [
      { bucket: 'current', label: 'Current', count: 0, amount: 0 },
      { bucket: '1-30', label: '1-30 Days', count: 0, amount: 0 },
      { bucket: '31-60', label: '31-60 Days', count: 0, amount: 0 },
      { bucket: '61-90', label: '61-90 Days', count: 0, amount: 0 },
      { bucket: '90+', label: '90+ Days', count: 0, amount: 0 },
    ];

    for (const inv of saInvoices) {
      const balance = Number(inv.balance);
      const daysOverdue = Math.floor((asOfDate.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      
      let bucketIndex = 0;
      if (daysOverdue <= 0) bucketIndex = 0; // Current
      else if (daysOverdue <= 30) bucketIndex = 1;
      else if (daysOverdue <= 60) bucketIndex = 2;
      else if (daysOverdue <= 90) bucketIndex = 3;
      else bucketIndex = 4;

      saAgingBuckets[bucketIndex].count++;
      saAgingBuckets[bucketIndex].amount += balance;
      
      agingBuckets[bucketIndex].count++;
      agingBuckets[bucketIndex].amount += balance;
    }

    const lastPayment = lastPaymentMap.get(sa.subscriberId);
    
    // Current bill = invoices not yet overdue (due date >= asOfDate)
    const currentBill = saInvoices
      .filter(inv => inv.dueDate >= asOfDate)
      .reduce((sum, inv) => sum + Number(inv.balance), 0);

    const isOverdue = totalArrears > currentBill || saInvoices.some(inv => inv.dueDate < asOfDate);
    if (isOverdue) overdueCount++;

    totalReceivable += totalArrears;
    if (isOverdue) overdueReceivable += totalArrears;
    else currentReceivable += totalArrears;

    // Check if suspension candidate
    const isSuspensionCandidate = monthsUnpaid >= suspensionThreshold && sa.status === 'active';
    if (isSuspensionCandidate) suspensionCandidates++;

    details.push({
      subscriber: {
        id: sa.subscriber.id,
        accountNumber: sa.subscriber.accountNumber,
        firstName: sa.subscriber.firstName,
        lastName: sa.subscriber.lastName,
        contactNumber: sa.subscriber.contactNumber,
        status: sa.subscriber.status,
      },
      serviceAccount: {
        id: sa.id,
        accountNumber: sa.accountNumber,
        plan: {
          id: sa.plan.id,
          code: sa.plan.code,
          name: sa.plan.name,
          type: sa.plan.type,
        },
        status: sa.status,
        collectorId: sa.collectorId,
      },
      collector: sa.collector ? { id: sa.collector.id, fullName: sa.collector.fullName } : undefined,
      area: sa.subscriber.collectionAreaId ? { id: sa.subscriber.collectionAreaId, name: '' } : undefined,
      monthsUnpaid,
      oldestUnpaidInvoice: oldestInvoice ? {
        id: oldestInvoice.id,
        invoiceNumber: oldestInvoice.invoiceNumber,
        dueDate: oldestInvoice.dueDate,
        balance: Number(oldestInvoice.balance),
      } : null,
      lastPayment: lastPayment ? {
        id: lastPayment.id,
        receiptNumber: lastPayment.receiptNumber,
        paymentDate: lastPayment.paymentDate,
        amount: Number(lastPayment.amount),
      } : null,
      totalArrears,
      currentBill,
      agingBuckets: saAgingBuckets,
    });
  }

  // Sort by total arrears descending
  details.sort((a, b) => b.totalArrears - a.totalArrears);

  return {
    summary: {
      totalReceivable,
      currentReceivable,
      overdueReceivable,
      overdueCount,
      suspensionCandidates,
      agingBuckets,
    },
    details,
  };
}

/**
 * Get overdue accounts list with filters
 */
export async function getOverdueAccounts(
  fastify: FastifyInstance,
  params: {
    page: number;
    limit: number;
    collectorId?: string;
    areaId?: string;
    planId?: string;
    serviceType?: 'internet' | 'cable' | 'combo';
    minMonthsUnpaid?: number;
    maxMonthsUnpaid?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }
) {
  const { summary, details } = await calculateAging(fastify, new Date(), {
    collectorId: params.collectorId,
    areaId: params.areaId,
    planId: params.planId,
    serviceType: params.serviceType,
  });

  let filtered = details;
  
  if (params.minMonthsUnpaid !== undefined) {
    filtered = filtered.filter(d => d.monthsUnpaid >= params.minMonthsUnpaid!);
  }
  if (params.maxMonthsUnpaid !== undefined) {
    filtered = filtered.filter(d => d.monthsUnpaid <= params.maxMonthsUnpaid!);
  }

  // Sort
  const sortField = params.sortBy || 'totalArrears';
  const sortDir = params.sortOrder || 'desc';
  filtered.sort((a, b) => {
    const aVal = a[sortField as keyof OverdueAccount];
    const bVal = b[sortField as keyof OverdueAccount];
    if (aVal === undefined || bVal === undefined) return 0;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return sortDir === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
  });

  const total = filtered.length;
  const page = params.page;
  const limit = params.limit;
  const offset = (page - 1) * limit;
  const items = filtered.slice(offset, offset + limit);

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    summary,
  };
}

/**
 * Get suspension candidates
 */
export async function getSuspensionCandidates(
  fastify: FastifyInstance,
  params: {
    page: number;
    limit: number;
    collectorId?: string;
    areaId?: string;
  }
) {
  const { summary, details } = await calculateAging(fastify, new Date(), {
    collectorId: params.collectorId,
    areaId: params.areaId,
  });

  const candidates = details.filter(d => 
    d.monthsUnpaid >= 2 && d.serviceAccount.status === 'active'
  );

  const total = candidates.length;
  const page = params.page;
  const limit = params.limit;
  const offset = (page - 1) * limit;

  return {
    items: candidates.slice(offset, offset + limit),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    summary,
  };
}

/**
 * Get collection efficiency report
 */
export async function getCollectionEfficiency(
  fastify: FastifyInstance,
  params: {
    dateFrom: Date;
    dateTo: Date;
    collectorId?: string;
    areaId?: string;
  }
) {
  const db = fastify.db;
  
  // Get all payments in period
  const paymentConditions = [
    gte(payments.paymentDate, params.dateFrom),
    lte(payments.paymentDate, params.dateTo),
    or(eq(payments.status, 'posted'), eq(payments.status, 'verified')),
  ];

  if (params.collectorId) {
    // Need to join through subscribers -> serviceAccounts -> collectorId
    const saIds = await db.select({ id: serviceAccounts.id })
      .from(serviceAccounts)
      .where(eq(serviceAccounts.collectorId, params.collectorId));
    
    const subIds = await db.select({ subscriberId: serviceAccounts.subscriberId })
      .from(serviceAccounts)
      .where(inArray(serviceAccounts.id, saIds.map(s => s.id)));
    
    paymentConditions.push(inArray(payments.subscriberId, subIds.map(s => s.subscriberId)));
  }

  const paymentList = await db.query.payments.findMany({
    where: and(...paymentConditions),
    with: {
      subscriber: true,
    },
  });

  // Group by collector
  const collectorMap = new Map<string, {
    collectorId: string;
    collectorName: string;
    cashAmount: number;
    nonCashAmount: number;
    totalAmount: number;
    receiptCount: number;
  }>();

  for (const p of paymentList) {
    // Find collector for this subscriber
    const sa = await db.query.serviceAccounts.findFirst({
      where: eq(serviceAccounts.subscriberId, p.subscriberId),
      with: { collector: true },
    });
    
    const collectorId = sa?.collectorId || 'unassigned';
    const collectorName = sa?.collector?.fullName || 'Unassigned';
    
    if (!collectorMap.has(collectorId)) {
      collectorMap.set(collectorId, {
        collectorId,
        collectorName,
        cashAmount: 0,
        nonCashAmount: 0,
        totalAmount: 0,
        receiptCount: 0,
      });
    }

    const entry = collectorMap.get(collectorId)!;
    const amount = Number(p.amount);
    entry.totalAmount += amount;
    entry.receiptCount++;
    
    if (p.method === 'cash') {
      entry.cashAmount += amount;
    } else {
      entry.nonCashAmount += amount;
    }
  }

  return {
    period: { from: params.dateFrom, to: params.dateTo },
    byCollector: Array.from(collectorMap.values()),
    summary: {
      totalCollection: Array.from(collectorMap.values()).reduce((sum, c) => sum + c.totalAmount, 0),
      totalCash: Array.from(collectorMap.values()).reduce((sum, c) => sum + c.cashAmount, 0),
      totalNonCash: Array.from(collectorMap.values()).reduce((sum, c) => sum + c.nonCashAmount, 0),
      totalReceipts: Array.from(collectorMap.values()).reduce((sum, c) => sum + c.receiptCount, 0),
    },
  };
}

/**
 * Get revenue by plan/service/area
 */
export async function getRevenueReport(
  fastify: FastifyInstance,
  params: {
    dateFrom: Date;
    dateTo: Date;
    groupBy: 'plan' | 'service_type' | 'area';
  }
) {
  const db = fastify.db;
  
  const paymentConditions = [
    gte(payments.paymentDate, params.dateFrom),
    lte(payments.paymentDate, params.dateTo),
    or(eq(payments.status, 'posted'), eq(payments.status, 'verified')),
  ];

  const paymentList = await db.query.payments.findMany({
    where: and(...paymentConditions),
    with: {
      subscriber: true,
      allocations: {
        with: {
          invoice: {
            with: {
              serviceAccount: {
                with: {
                  plan: true,
                  subscriber: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const groupMap = new Map<string, {
    key: string;
    label: string;
    amount: number;
    count: number;
  }>();

  for (const p of paymentList) {
    for (const alloc of p.allocations) {
      if (!alloc.invoice?.serviceAccount) continue;
      
      const sa = alloc.invoice.serviceAccount;
      let groupKey = '';
      let groupLabel = '';

      if (params.groupBy === 'plan') {
        groupKey = sa.plan?.id || 'unknown';
        groupLabel = sa.plan?.name || 'Unknown Plan';
      } else if (params.groupBy === 'service_type') {
        groupKey = sa.plan?.type || 'unknown';
        groupLabel = sa.plan?.type || 'Unknown';
      } else if (params.groupBy === 'area') {
        groupKey = sa.subscriber?.collectionAreaId || 'unassigned';
        groupLabel = 'Unassigned'; // Would need to fetch area name
      }

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, { key: groupKey, label: groupLabel, amount: 0, count: 0 });
      }
      
      const entry = groupMap.get(groupKey)!;
      entry.amount += Number(alloc.amount);
      entry.count++;
    }
  }

  return Array.from(groupMap.values()).sort((a, b) => b.amount - a.amount);
}