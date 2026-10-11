/**
 * Payment Service - Core payment processing logic for BCIS
 * Handles payment creation, allocation, reversal, and GCash verification
 */

import { 
  payments, 
  paymentAllocations, 
  invoices, 
  invoiceItems,
  paymentProofs,
  paymentReversals,
  gcashVerificationQueue,
  receipts,
  subscribers,
  serviceAccounts,
  auditLogs,
} from '@bcis/db/schema';
import { eq, and, or, gte, lte, isNull, not, inArray, sql, desc, asc, sum, count } from 'drizzle-orm';
import { generateReceiptNumber } from '../utils/numbering';
import type { FastifyInstance } from 'fastify';

export interface PaymentAllocationPreviewItem {
  invoiceId: string;
  invoiceNumber: string;
  serviceAccountId: string;
  serviceType: string;
  planName: string;
  period: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  allocationAmount: number;
  remainingAfterAllocation: number;
}

export interface CreatePaymentResult {
  payment: {
    id: string;
    receiptNumber: string;
    amount: number;
    status: string;
  };
  allocations: Array<{
    invoiceId: string;
    amount: number;
  }>;
  receipt: {
    id: string;
    receiptNumber: string;
  };
}

/**
 * Get allocation preview for a payment amount
 * Uses oldest-first allocation rule
 */
export async function getAllocationPreview(
  fastify: FastifyInstance,
  subscriberId: string,
  amount: number
): Promise<PaymentAllocationPreviewItem[]> {
  const db = fastify.db;
  
  // Get all unpaid/partially paid invoices for subscriber's service accounts
  const serviceAccountsList = await db.query.serviceAccounts.findMany({
    where: eq(serviceAccounts.subscriberId, subscriberId),
    with: {
      plan: true,
    },
  });

  const saIds = serviceAccountsList.map(sa => sa.id);
  if (saIds.length === 0) return [];

  // Get unpaid invoices ordered by due date (oldest first)
  const unpaidInvoices = await db.query.invoices.findMany({
    where: and(
      inArray(invoices.serviceAccountId, saIds),
      or(
        eq(invoices.status, 'unpaid'),
        eq(invoices.status, 'partially_paid'),
        eq(invoices.status, 'overdue')
      )
    ),
    orderBy: asc(invoices.dueDate),
    with: {
      serviceAccount: {
        with: {
          plan: true,
        },
      },
      allocations: true,
    },
  });

  const preview: PaymentAllocationPreviewItem[] = [];
  let remainingAmount = amount;

  for (const inv of unpaidInvoices) {
    if (remainingAmount <= 0) break;

    const balance = Number(inv.balance);
    const allocationAmount = Math.min(balance, remainingAmount);
    
    preview.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      serviceAccountId: inv.serviceAccountId,
      serviceType: inv.serviceAccount.plan.type,
      planName: inv.serviceAccount.plan.name,
      period: `${inv.periodStart.toISOString().split('T')[0]} to ${inv.periodEnd.toISOString().split('T')[0]}`,
      totalAmount: Number(inv.totalAmount),
      paidAmount: Number(inv.paidAmount),
      balance,
      allocationAmount,
      remainingAfterAllocation: balance - allocationAmount,
    });

    remainingAmount -= allocationAmount;
  }

  // If there's remaining amount, it becomes advance payment (credit)
  if (remainingAmount > 0) {
    preview.push({
      invoiceId: '',
      invoiceNumber: 'ADVANCE',
      serviceAccountId: '',
      serviceType: '',
      planName: 'Advance Payment / Credit',
      period: '',
      totalAmount: 0,
      paidAmount: 0,
      balance: 0,
      allocationAmount: remainingAmount,
      remainingAfterAllocation: 0,
    });
  }

  return preview;
}

/**
 * Create a new payment with allocations
 */
export async function createPayment(
  fastify: FastifyInstance,
  data: {
    subscriberId: string;
    amount: number; // in centavos
    method: 'cash' | 'gcash' | 'bank_transfer' | 'cheque' | 'other';
    referenceNumber?: string;
    paymentDate: Date;
    notes?: string;
    allocations?: Array<{ invoiceId: string; amount: number }>;
    proofFile?: {
      fileName: string;
      filePath: string;
      fileSize: number;
      mimeType: string;
    };
  }
): Promise<CreatePaymentResult> {
  const actorId = fastify.requestUser?.id;
  if (!actorId) throw new Error('User not authenticated');
  const db = fastify.db;

  // Verify subscriber exists
  const subscriber = await db.query.subscribers.findFirst({
    where: eq(subscribers.id, data.subscriberId),
  });
  if (!subscriber) throw new Error('Subscriber not found');

  // Validate allocations if provided
  let allocationsToUse = data.allocations;
  let totalAllocated = 0;

  if (allocationsToUse && allocationsToUse.length > 0) {
    totalAllocated = allocationsToUse.reduce((sum, a) => sum + a.amount, 0);
    if (totalAllocated !== data.amount) {
      throw new Error('Total allocation amount must equal payment amount');
    }

    // Verify all invoices belong to subscriber
    const saIds = (await db.query.serviceAccounts.findMany({
      where: eq(serviceAccounts.subscriberId, data.subscriberId),
    })).map(sa => sa.id);

    for (const alloc of allocationsToUse) {
      const invoice = await db.query.invoices.findFirst({
        where: eq(invoices.id, alloc.invoiceId),
      });
      if (!invoice) throw new Error(`Invoice ${alloc.invoiceId} not found`);
      if (!saIds.includes(invoice.serviceAccountId)) {
        throw new Error(`Invoice ${alloc.invoiceId} does not belong to subscriber`);
      }
      if (invoice.status === 'paid' || invoice.status === 'void' || invoice.status === 'credited') {
        throw new Error(`Cannot allocate to invoice ${invoice.invoiceNumber} with status ${invoice.status}`);
      }
      if (alloc.amount > Number(invoice.balance)) {
        throw new Error(`Allocation amount exceeds invoice balance for ${invoice.invoiceNumber}`);
      }
    }
  } else {
    // Auto-allocate using oldest-first rule
    const preview = await getAllocationPreview(fastify, data.subscriberId, data.amount);
    allocationsToUse = preview
      .filter(p => p.invoiceId && p.allocationAmount > 0)
      .map(p => ({ invoiceId: p.invoiceId, amount: p.allocationAmount }));
    totalAllocated = allocationsToUse.reduce((sum, a) => sum + a.amount, 0);
  }

  // Generate receipt number
  const receiptNumber = await generateReceiptNumber(fastify);

  // Create payment in transaction
  const [payment] = await db.transaction(async (tx) => {
    // Insert payment
    const [newPayment] = await tx.insert(payments).values({
      receiptNumber,
      subscriberId: data.subscriberId,
      amount: data.amount,
      method: data.method,
      referenceNumber: data.referenceNumber,
      paymentDate: data.paymentDate,
      postedBy: actorId,
      status: data.method === 'gcash' ? 'pending' : 'posted', // GCash needs verification
      notes: data.notes,
    }).returning();

    // Insert allocations
    if (allocationsToUse && allocationsToUse.length > 0) {
      for (const alloc of allocationsToUse) {
        await tx.insert(paymentAllocations).values({
          paymentId: newPayment.id,
          invoiceId: alloc.invoiceId,
          amount: alloc.amount,
          allocatedBy: actorId,
        });

        // Update invoice paid amount and balance
        const invoice = await tx.query.invoices.findFirst({
          where: eq(invoices.id, alloc.invoiceId),
        });
        if (invoice) {
          const newPaidAmount = Number(invoice.paidAmount) + alloc.amount;
          const newBalance = Number(invoice.totalAmount) - newPaidAmount;
          let newStatus = invoice.status;
          
          if (newBalance <= 0) {
            newStatus = 'paid';
          } else if (newPaidAmount > 0) {
            newStatus = 'partially_paid';
          }

          await tx.update(invoices)
            .set({
              paidAmount: newPaidAmount,
              balance: newBalance,
              status: newStatus,
              updatedAt: new Date(),
            })
            .where(eq(invoices.id, alloc.invoiceId));
        }
      }
    }

    // Create receipt record
    const [receipt] = await tx.insert(receipts).values({
      receiptNumber,
      paymentId: newPayment.id,
      generatedBy: actorId,
    }).returning();

    // Handle proof attachment
    if (data.proofFile) {
      await tx.insert(paymentProofs).values({
        paymentId: newPayment.id,
        fileName: data.proofFile.fileName,
        filePath: data.proofFile.filePath,
        fileSize: data.proofFile.fileSize,
        mimeType: data.proofFile.mimeType,
        uploadedBy: actorId,
      });
    }

    // Log audit
    await tx.insert(auditLogs).values({
      actorId,
      action: 'payment.create',
      entityType: 'payment',
      entityId: newPayment.id,
      newValues: { receiptNumber, amount: data.amount, method: data.method, subscriberId: data.subscriberId },
      reason: data.notes || `Payment received via ${data.method}`,
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });

    return [newPayment, receipt];
  });

  return {
    payment: {
      id: payment.id,
      receiptNumber: payment.receiptNumber,
      amount: payment.amount,
      status: payment.status,
    },
    allocations: allocationsToUse || [],
    receipt: {
      id: payment.id,
      receiptNumber: payment.receiptNumber,
    },
  };
}

/**
 * Reverse a payment
 */
export async function reversePayment(
  fastify: FastifyInstance,
  paymentId: string,
  reason: string
): Promise<void> {
  const actorId = fastify.requestUser?.id;
  if (!actorId) throw new Error('User not authenticated');
  const db = fastify.db;

  const payment = await db.query.payments.findFirst({
    where: eq(payments.id, paymentId),
    with: {
      allocations: {
        with: { invoice: true },
      },
      reversalPayment: true,
    },
  });

  if (!payment) throw new Error('Payment not found');
  if (payment.status === 'reversed' || payment.status === 'void') {
    throw new Error('Payment already reversed or voided');
  }
  if (payment.reversalPaymentId) {
    throw new Error('Payment already has a reversal');
  }

  // Create reversal payment (negative amount)
  const reversalReceiptNumber = await generateReceiptNumber(fastify);
  
  await db.transaction(async (tx) => {
    // Create reversal payment record
    const [reversalPayment] = await tx.insert(payments).values({
      receiptNumber: reversalReceiptNumber,
      subscriberId: payment.subscriberId,
      amount: -payment.amount, // Negative amount for reversal
      method: payment.method,
      referenceNumber: `REV-${payment.receiptNumber}`,
      paymentDate: new Date(),
      postedBy: actorId,
      status: 'posted',
      notes: `Reversal of ${payment.receiptNumber}: ${reason}`,
      reversalPaymentId: payment.id,
    }).returning();

    // Create reversal record
    await tx.insert(paymentReversals).values({
      originalPaymentId: payment.id,
      reversalPaymentId: reversalPayment.id,
      reason,
      reversedBy: actorId,
      approvedBy: actorId,
      approvedAt: new Date(),
    });

    // Reverse allocations - update invoice balances
    for (const alloc of payment.allocations) {
      const invoice = alloc.invoice;
      const newPaidAmount = Number(invoice.paidAmount) - alloc.amount;
      const newBalance = Number(invoice.totalAmount) - newPaidAmount;
      let newStatus = 'unpaid';
      
      if (newPaidAmount > 0 && newBalance > 0) {
        newStatus = 'partially_paid';
      } else if (newPaidAmount >= Number(invoice.totalAmount)) {
        newStatus = 'paid';
      }

      await tx.update(invoices)
        .set({
          paidAmount: Math.max(0, newPaidAmount),
          balance: newBalance,
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoice.id));

      // Delete the allocation
      await tx.delete(paymentAllocations)
        .where(and(
          eq(paymentAllocations.paymentId, payment.id),
          eq(paymentAllocations.invoiceId, invoice.id)
        ));
    }

    // Update original payment
    await tx.update(payments)
      .set({
        status: 'reversed',
        reversedAt: new Date(),
        reversedBy: actorId,
        reverseReason: reason,
        reversalPaymentId: reversalPayment.id,
      })
      .where(eq(payments.id, payment.id));

    // Log audit
    await tx.insert(auditLogs).values({
      actorId,
      action: 'payment.reverse',
      entityType: 'payment',
      entityId: paymentId,
      oldValues: { receiptNumber: payment.receiptNumber, amount: payment.amount, status: payment.status },
      newValues: { receiptNumber: reversalReceiptNumber, amount: -payment.amount, status: 'reversed' },
      reason,
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });
  });
}

/**
 * Get payment with details
 */
export async function getPaymentWithDetails(fastify: FastifyInstance, paymentId: string) {
  const db = fastify.db;
  
  const payment = await db.query.payments.findFirst({
    where: eq(payments.id, paymentId),
    with: {
      subscriber: true,
      poster: true,
      verifier: true,
      rejecter: true,
      reverser: true,
      proof: true,
      allocations: {
        with: {
          invoice: {
            with: {
              serviceAccount: {
                with: { plan: true },
              },
            },
          },
        },
      },
      reversalPayment: true,
    },
  });

  if (!payment) return null;

  return {
    ...payment,
    amount: Number(payment.amount),
    allocations: payment.allocations.map(a => ({
      ...a,
      amount: Number(a.amount),
      invoice: a.invoice ? {
        ...a.invoice,
        subscriptionCharge: Number(a.invoice.subscriptionCharge),
        installationFee: Number(a.invoice.installationFee),
        reconnectionFee: Number(a.invoice.reconnectionFee),
        discount: Number(a.invoice.discount),
        penalty: Number(a.invoice.penalty),
        adjustments: Number(a.invoice.adjustments),
        totalAmount: Number(a.invoice.totalAmount),
        paidAmount: Number(a.invoice.paidAmount),
        balance: Number(a.invoice.balance),
      } : undefined,
    })),
  };
}

/**
 * List payments with filters
 */
export async function listPayments(fastify: FastifyInstance, params: {
  page: number;
  limit: number;
  subscriberId?: string;
  method?: string;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  referenceNumber?: string;
  receiptNumber?: string;
  postedBy?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  const db = fastify.db;
  const { page, limit, ...filters } = params;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (filters.subscriberId) conditions.push(eq(payments.subscriberId, filters.subscriberId));
  if (filters.method) conditions.push(eq(payments.method, filters.method as any));
  if (filters.status) conditions.push(eq(payments.status, filters.status as any));
  if (filters.dateFrom) conditions.push(gte(payments.paymentDate, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(payments.paymentDate, filters.dateTo));
  if (filters.referenceNumber) conditions.push(sql`${payments.referenceNumber} ILIKE ${'%' + filters.referenceNumber + '%'}`);
  if (filters.receiptNumber) conditions.push(sql`${payments.receiptNumber} ILIKE ${'%' + filters.receiptNumber + '%'}`);
  if (filters.postedBy) conditions.push(eq(payments.postedBy, filters.postedBy));

  const orderColumn = payments[filters.sortBy as keyof typeof payments] || payments.paymentDate;
  const orderFn = filters.sortOrder === 'asc' ? asc : desc;

  const [items, totalResult] = await Promise.all([
    db.query.payments.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      limit,
      offset,
      orderBy: orderFn(orderColumn),
      with: {
        subscriber: true,
        poster: true,
        allocations: {
          with: {
            invoice: {
              with: {
                serviceAccount: { with: { plan: true } },
              },
            },
          },
        },
      },
    }),
    db.select({ count: count() }).from(payments).where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  return {
    items: items.map(p => ({
      ...p,
      amount: Number(p.amount),
      allocations: p.allocations.map(a => ({
        ...a,
        amount: Number(a.amount),
        invoice: a.invoice ? {
          ...a.invoice,
          totalAmount: Number(a.invoice.totalAmount),
          paidAmount: Number(a.invoice.paidAmount),
          balance: Number(a.invoice.balance),
        } : undefined,
      })),
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
 * Submit GCash payment for verification
 */
export async function submitGCashVerification(
  fastify: FastifyInstance,
  data: {
    referenceNumber: string;
    senderName: string;
    senderNumber: string;
    amount: number;
    transactionDate: Date;
    proofFileId: string;
    subscriberId?: string;
  }
) {
  const actorId = fastify.requestUser?.id;
  if (!actorId) throw new Error('User not authenticated');
  const db = fastify.db;

  // Check for duplicate reference number
  const existing = await db.query.gcashVerificationQueue.findFirst({
    where: eq(gcashVerificationQueue.referenceNumber, data.referenceNumber),
  });

  if (existing) {
    throw new Error('GCash reference number already exists in verification queue');
  }

  // Also check payments table for already verified/posted GCash with same reference
  const existingPayment = await db.query.payments.findFirst({
    where: and(
      eq(payments.referenceNumber, data.referenceNumber),
      eq(payments.method, 'gcash'),
      or(eq(payments.status, 'verified'), eq(payments.status, 'posted'))
    ),
  });

  if (existingPayment) {
    throw new Error('GCash reference number already used for a verified payment');
  }

  const [queueItem] = await db.insert(gcashVerificationQueue).values({
    referenceNumber: data.referenceNumber,
    senderName: data.senderName,
    senderNumber: data.senderNumber,
    amount: data.amount,
    transactionDate: data.transactionDate,
    proofAttachmentId: data.proofFileId,
    status: 'pending',
    subscriberId: data.subscriberId,
  }).returning();

  await db.insert(auditLogs).values({
    actorId,
    action: 'gcash.submit',
    entityType: 'gcash_verification',
    entityId: queueItem.id,
    newValues: { referenceNumber: data.referenceNumber, amount: data.amount, senderName: data.senderName },
    reason: 'GCash payment submitted for verification',
    ipAddress: fastify.requestIp,
    userAgent: fastify.requestHeaders?.['user-agent'],
  });

  return queueItem;
}

/**
 * Verify or reject GCash payment
 */
export async function processGCashVerification(
  fastify: FastifyInstance,
  queueId: string,
  action: 'verify' | 'reject',
  rejectReason?: string,
  subscriberId?: string
) {
  const actorId = fastify.requestUser?.id;
  if (!actorId) throw new Error('User not authenticated');
  const db = fastify.db;

  const queueItem = await db.query.gcashVerificationQueue.findFirst({
    where: eq(gcashVerificationQueue.id, queueId),
    with: { proof: true },
  });

  if (!queueItem) throw new Error('GCash verification item not found');
  if (queueItem.status !== 'pending') {
    throw new Error('GCash verification already processed');
  }

  if (action === 'verify') {
    // Create payment from verified GCash
    const targetSubscriberId = subscriberId || queueItem.subscriberId;
    if (!targetSubscriberId) {
      throw new Error('Subscriber must be specified for verified GCash payment');
    }

    const result = await createPayment(fastify, {
      subscriberId: targetSubscriberId,
      amount: queueItem.amount,
      method: 'gcash',
      referenceNumber: queueItem.referenceNumber,
      paymentDate: queueItem.transactionDate,
      notes: `Verified GCash payment from ${queueItem.senderName} (${queueItem.senderNumber})`,
      proofFile: queueItem.proof ? {
        fileName: queueItem.proof.fileName,
        filePath: queueItem.proof.filePath,
        fileSize: queueItem.proof.fileSize,
        mimeType: queueItem.proof.mimeType,
      } : undefined,
    });

    // Update queue item
    await db.update(gcashVerificationQueue)
      .set({
        status: 'verified',
        verifiedAt: new Date(),
        verifiedBy: actorId,
        subscriberId: targetSubscriberId,
      })
      .where(eq(gcashVerificationQueue.id, queueId));

    await db.insert(auditLogs).values({
      actorId,
      action: 'gcash.verify',
      entityType: 'gcash_verification',
      entityId: queueId,
      oldValues: { status: 'pending' },
      newValues: { status: 'verified', paymentId: result.payment.id, receiptNumber: result.payment.receiptNumber },
      reason: `GCash verified and posted as ${result.payment.receiptNumber}`,
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });

    return { verified: true, payment: result.payment };
  } else {
    // Reject
    await db.update(gcashVerificationQueue)
      .set({
        status: 'rejected',
        verifiedAt: new Date(),
        verifiedBy: actorId,
        rejectReason,
      })
      .where(eq(gcashVerificationQueue.id, queueId));

    await db.insert(auditLogs).values({
      actorId,
      action: 'gcash.reject',
      entityType: 'gcash_verification',
      entityId: queueId,
      oldValues: { status: 'pending' },
      newValues: { status: 'rejected', rejectReason },
      reason: rejectReason || 'GCash payment rejected',
      ipAddress: fastify.requestIp,
      userAgent: fastify.requestHeaders?.['user-agent'],
    });

    return { verified: false };
  }
}

/**
 * List GCash verification queue
 */
export async function listGCashQueue(fastify: FastifyInstance, params: {
  page: number;
  limit: number;
  status?: 'pending' | 'verified' | 'rejected';
}) {
  const db = fastify.db;
  const { page, limit, status } = params;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status) conditions.push(eq(gcashVerificationQueue.status, status));

  const [items, totalResult] = await Promise.all([
    db.query.gcashVerificationQueue.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      limit,
      offset,
      orderBy: desc(gcashVerificationQueue.createdAt),
      with: {
        proof: true,
        subscriber: true,
        verifier: true,
      },
    }),
    db.select({ count: count() }).from(gcashVerificationQueue).where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  return {
    items: items.map(item => ({
      ...item,
      amount: Number(item.amount),
      proof: item.proof ? {
        ...item.proof,
        fileSize: Number(item.proof.fileSize),
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