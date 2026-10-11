/**
 * Numbering Utilities - Generate sequential numbers for invoices, receipts, batches
 */

import type { FastifyInstance } from 'fastify';
import { invoices, payments, collectionBatches, applicationSettings, subscribers, serviceAccounts } from '@bcis/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

/**
 * Generate next invoice number
 * Format: INV-YYYYMMDD-NNNN (e.g., INV-20260901-0001)
 */
export async function generateInvoiceNumber(fastify: FastifyInstance): Promise<string> {
  const db = fastify.db;
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `INV-${dateStr}-`;

  // Get the latest invoice number for today
  const latest = await db.select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(sql`${invoices.invoiceNumber} LIKE ${prefix}%`)
    .orderBy(desc(invoices.invoiceNumber))
    .limit(1);

  let sequence = 1;
  if (latest.length > 0) {
    const lastNumber = latest[0].invoiceNumber;
    const lastSequence = parseInt(lastNumber.split('-').pop() || '0', 10);
    sequence = lastSequence + 1;
  }

  return `${prefix}${sequence.toString().padStart(4, '0')}`;
}

/**
 * Generate next receipt number
 * Format: RCPT-YYYYMMDD-NNNN (e.g., RCPT-20260901-0001)
 */
export async function generateReceiptNumber(fastify: FastifyInstance): Promise<string> {
  const db = fastify.db;
  // Get prefix from settings
  const setting = await db.query.applicationSettings.findFirst({
    where: eq(applicationSettings.key, 'receipt_prefix'),
  });
  const prefix = setting?.value || 'RCPT';
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const fullPrefix = `${prefix}-${dateStr}-`;

  const latest = await db.select({ receiptNumber: payments.receiptNumber })
    .from(payments)
    .where(sql`${payments.receiptNumber} LIKE ${fullPrefix}%`)
    .orderBy(desc(payments.receiptNumber))
    .limit(1);

  let sequence = 1;
  if (latest.length > 0) {
    const lastNumber = latest[0].receiptNumber;
    const lastSequence = parseInt(lastNumber.split('-').pop() || '0', 10);
    sequence = lastSequence + 1;
  }

  return `${fullPrefix}${sequence.toString().padStart(4, '0')}`;
}

/**
 * Generate next collection batch number
 * Format: BATCH-YYYYMMDD-NNNN
 */
export async function generateBatchNumber(fastify: FastifyInstance): Promise<string> {
  const db = fastify.db;
  const setting = await db.query.applicationSettings.findFirst({
    where: eq(applicationSettings.key, 'batch_prefix'),
  });
  const prefix = setting?.value || 'BATCH';
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const fullPrefix = `${prefix}-${dateStr}-`;

  const latest = await db.select({ batchNumber: collectionBatches.batchNumber })
    .from(collectionBatches)
    .where(sql`${collectionBatches.batchNumber} LIKE ${fullPrefix}%`)
    .orderBy(desc(collectionBatches.batchNumber))
    .limit(1);

  let sequence = 1;
  if (latest.length > 0) {
    const lastNumber = latest[0].batchNumber;
    const lastSequence = parseInt(lastNumber.split('-').pop() || '0', 10);
    sequence = lastSequence + 1;
  }

  return `${fullPrefix}${sequence.toString().padStart(4, '0')}`;
}

/**
 * Generate subscriber account number
 * Format: BCIS-YYYY-NNNNN
 */
export async function generateSubscriberAccountNumber(fastify: FastifyInstance): Promise<string> {
  const db = fastify.db;
  const today = new Date();
  const year = today.getFullYear();
  const prefix = `BCIS-${year}-`;

  const latest = await db.select({ accountNumber: subscribers.accountNumber })
    .from(subscribers)
    .where(sql`${subscribers.accountNumber} LIKE ${prefix}%`)
    .orderBy(desc(subscribers.accountNumber))
    .limit(1);

  let sequence = 1;
  if (latest.length > 0) {
    const lastNumber = latest[0].accountNumber;
    const lastSequence = parseInt(lastNumber.split('-').pop() || '0', 10);
    sequence = lastSequence + 1;
  }

  return `${prefix}${sequence.toString().padStart(5, '0')}`;
}

/**
 * Generate service account number
 * Format: SA-YYYY-NNNNN
 */
export async function generateServiceAccountNumber(fastify: FastifyInstance): Promise<string> {
  const db = fastify.db;
  const today = new Date();
  const year = today.getFullYear();
  const prefix = `SA-${year}-`;

  const latest = await db.select({ accountNumber: serviceAccounts.accountNumber })
    .from(serviceAccounts)
    .where(sql`${serviceAccounts.accountNumber} LIKE ${prefix}%`)
    .orderBy(desc(serviceAccounts.accountNumber))
    .limit(1);

  let sequence = 1;
  if (latest.length > 0) {
    const lastNumber = latest[0].accountNumber;
    const lastSequence = parseInt(lastNumber.split('-').pop() || '0', 10);
    sequence = lastSequence + 1;
  }

  return `${prefix}${sequence.toString().padStart(5, '0')}`;
}