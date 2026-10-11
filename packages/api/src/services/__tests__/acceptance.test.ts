import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAllocationPreview, reversePayment, submitGCashVerification } from '../payments';
import { closeBatch, reconcileBatch } from '../collections';
import authPlugin from '../../plugins/auth';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { invoices as invoiceTable } from '@bcis/db/schema';

vi.mock('../../utils/numbering', () => ({ generateReceiptNumber: vi.fn().mockResolvedValue('RCPT-TEST-0002') }));

const invoices = [
  { id: 'inv-old', invoiceNumber: 'INV-OLD', serviceAccountId: 'sa-1', status: 'unpaid', dueDate: new Date('2026-01-01'), periodStart: new Date('2025-12-01'), periodEnd: new Date('2025-12-31'), totalAmount: 10000, paidAmount: 0, balance: 10000, serviceAccount: { plan: { type: 'internet', name: 'Basic Internet' } }, allocations: [] },
  { id: 'inv-new', invoiceNumber: 'INV-NEW', serviceAccountId: 'sa-1', status: 'unpaid', dueDate: new Date('2026-02-01'), periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-01-31'), totalAmount: 5000, paidAmount: 0, balance: 5000, serviceAccount: { plan: { type: 'cable', name: 'Cable Basic' } }, allocations: [] },
];

function allocationServer(rows = invoices) {
  return {
    db: { query: {
      serviceAccounts: { findMany: vi.fn().mockResolvedValue([{ id: 'sa-1', plan: { type: 'internet', name: 'Basic Internet' } }]) },
      invoices: { findMany: vi.fn().mockResolvedValue(rows) },
    } },
  } as any;
}

afterEach(() => vi.restoreAllMocks());

describe('acceptance: payment allocation', () => {
  it('AT-01 allocation preview applies an exact payment to the invoice balance', async () => {
    const preview = await getAllocationPreview(allocationServer(), 'sub-1', 10000);
    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({ invoiceId: 'inv-old', allocationAmount: 10000, remainingAfterAllocation: 0 });
  });

  it('AT-02 partial payment leaves the exact centavo balance', async () => {
    const preview = await getAllocationPreview(allocationServer([invoices[0]]), 'sub-1', 3750);
    expect(preview[0]).toMatchObject({ allocationAmount: 3750, remainingAfterAllocation: 6250 });
  });

  it('AT-03 identifies an excess payment as advance credit', async () => {
    const preview = await getAllocationPreview(allocationServer([invoices[0]]), 'sub-1', 12500);
    expect(preview).toHaveLength(2);
    expect(preview[1]).toMatchObject({ invoiceNumber: 'ADVANCE', allocationAmount: 2500 });
  });

  it('AT-04 allocates to older due invoices first', async () => {
    const preview = await getAllocationPreview(allocationServer(), 'sub-1', 12000);
    expect(preview.map((item) => [item.invoiceId, item.allocationAmount])).toEqual([['inv-old', 10000], ['inv-new', 2000]]);
  });
});

describe('acceptance: verification, reversal, and reconciliation', () => {
  it('AT-05 rejects a duplicate GCash verification reference', async () => {
    const server = { requestUser: { id: 'cashier-1' }, db: { query: { gcashVerificationQueue: { findFirst: vi.fn().mockResolvedValue({ id: 'queue-1' }) } } } } as any;
    await expect(submitGCashVerification(server, {
      referenceNumber: 'GCASH-REF-001', senderName: 'Demo Sender', senderNumber: '09170000000', amount: 10000,
      transactionDate: new Date(), proofFileId: 'proof-1',
    })).rejects.toThrow('already exists');
  });

  it('AT-06 retains the original payment allocations when creating a reversal', async () => {
    const payment = { id: 'payment-1', receiptNumber: 'RCPT-TEST-0001', subscriberId: 'sub-1', amount: 10000, method: 'cash', status: 'posted', allocations: [{ invoiceId: 'inv-1', amount: 10000, invoice: { id: 'inv-1', dueDate: new Date('2099-01-01'), totalAmount: 10000, paidAmount: 10000, balance: 0 } }], reversalPaymentId: null };
    const insertValues: any[] = [];
    const tx = {
      insert: () => ({ values: (value: any) => { insertValues.push(value); return { returning: async () => [{ id: 'reversal-1', ...value }] }; } }),
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ id: 'inv-1' }] }) }) }),
      delete: vi.fn(() => ({ where: async () => undefined })),
    };
    const server = {
      requestUser: { id: 'admin-1' }, requestIp: '127.0.0.1', requestHeaders: {},
      db: { query: { payments: { findFirst: vi.fn().mockResolvedValue(payment) } }, transaction: (callback: any) => callback(tx) },
    } as any;
    await reversePayment(server, payment.id, 'Duplicate receipt');
    expect(insertValues.some((value) => value.amount === -10000)).toBe(true);
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it('AT-07 reconciles an exact remittance without shortage or overage', async () => {
    const updateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    const tx = { update: () => ({ set: updateSet }), insert: () => ({ values: vi.fn().mockResolvedValue(undefined) }) };
    const server = { requestUser: { id: 'supervisor-1' }, db: {
      query: { collectionBatches: { findFirst: vi.fn().mockResolvedValue({ id: 'batch-1', batchNumber: 'B-1', status: 'remitted', expectedCash: 12000 }) } },
      transaction: (callback: any) => callback(tx),
    } } as any;
    await expect(reconcileBatch(server, 'batch-1', { actualCash: 12000, actualNonCash: 0 })).resolves.toEqual({ shortage: 0, overage: 0 });
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'reconciled', shortage: 0, overage: 0 }));
  });

  it('AT-08 refuses ordinary batch closure while a shortage remains', async () => {
    const server = { requestUser: { id: 'supervisor-1' }, db: { query: { collectionBatches: { findFirst: vi.fn().mockResolvedValue({ id: 'batch-1', status: 'reconciled', shortage: 2500 }) } } } } as any;
    await expect(closeBatch(server, 'batch-1')).rejects.toThrow('Cannot close batch with shortage');
  });

  it('AT-10 rejects a valid authenticated request without the required permission', async () => {
    const fastify: any = {
      register: vi.fn(async () => undefined),
      decorateRequest: vi.fn(),
      addHook: vi.fn(),
      db: { query: { sessions: { findFirst: vi.fn().mockResolvedValue({ user: { id: 'viewer-1', status: 'active', username: 'viewer', email: 'viewer@example.test', fullName: 'Viewer', roleId: 'viewer-role', role: { id: 'viewer-role', name: 'viewer', rolePermissions: [] } } }) } } },
      decorate(name: string, value: any) { this[name] = value; },
      log: { info: vi.fn() },
    };
    await (authPlugin as any)(fastify);
    const code = vi.fn();
    const reply = { sent: false, code: (status: number) => { code(status); return reply; }, send: () => { reply.sent = true; } };
    await fastify.authorize('payment.create')({ cookies: {}, headers: { authorization: 'Bearer test-token' } }, reply);
    expect(code).toHaveBeenCalledWith(403);
    expect(reply.sent).toBe(true);
  });

  it('AT-11 declares a unique database index for each service-account billing-cycle pair', () => {
    const billingIndex = getTableConfig(invoiceTable).indexes.find((index) => index.config.name === 'invoices_unique_service_billing_idx');
    expect(billingIndex?.config.unique).toBe(true);
  });
});
