import { afterAll, describe, expect, it } from 'vitest';
import { and, eq, gte } from 'drizzle-orm';
import { closeDb, getDb } from '@bcis/db';
import { invoices, users } from '@bcis/db/schema';
import { createPayment, reversePayment } from '../payments';

const enabled = process.env.BCIS_ACCEPTANCE_DB === '1';

describe.skipIf(!enabled)('database acceptance: AT-09 concurrent payment posting', () => {
  afterAll(async () => {
    await closeDb();
  });

  it('keeps concurrent allocations within the invoice balance and issues unique receipts', async () => {
    const db = getDb();
    const actors = await db.query.users.findMany({ where: eq(users.status, 'active'), limit: 3 });
    const invoice = await db.query.invoices.findFirst({
      where: and(eq(invoices.status, 'unpaid'), gte(invoices.balance, 1000)),
      orderBy: invoices.dueDate,
      with: { serviceAccount: true },
    });

    expect(actors).toHaveLength(3);
    expect(invoice).toBeDefined();
    if (!invoice) return;

    const startingBalance = Number(invoice.balance);
    const amount = Math.floor(startingBalance * 0.4);
    expect(amount).toBeGreaterThan(0);
    const requests = actors.map((actor) => {
      const context = { db, requestUser: { id: actor.id }, requestIp: '127.0.0.1', requestHeaders: {} } as any;
      return createPayment(context, {
        subscriberId: invoice.serviceAccount.subscriberId,
        amount,
        method: 'cash',
        paymentDate: new Date(),
        allocations: [{ invoiceId: invoice.id, amount }],
      }).then((result) => ({ context, result }));
    });

    const outcomes = await Promise.allSettled(requests);
    const posted = outcomes.filter((outcome): outcome is PromiseFulfilledResult<Awaited<(typeof requests)[number]>> => outcome.status === 'fulfilled');
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');

    expect(posted, JSON.stringify(outcomes.map((outcome) => outcome.status === 'rejected' ? { message: String(outcome.reason), query: (outcome.reason as any)?.query, cause: (outcome.reason as any)?.cause } : outcome.value.result.payment.receiptNumber))).toHaveLength(2);
    expect(rejected).toHaveLength(1);
    const receipts = posted.map(({ value }) => value.result.payment.receiptNumber);
    expect(new Set(receipts).size).toBe(receipts.length);

    const afterPosting = await db.query.invoices.findFirst({ where: eq(invoices.id, invoice.id) });
    expect(afterPosting).toBeDefined();
    expect(Number(afterPosting!.balance)).toBe(startingBalance - amount * posted.length);
    expect(Number(afterPosting!.balance)).toBeGreaterThanOrEqual(0);
    expect(Number(afterPosting!.paidAmount) + Number(afterPosting!.balance)).toBe(Number(afterPosting!.totalAmount));

    // Reverse the synthetic posted entries so the disposable seeded invoice is reusable.
    for (const { value } of posted) {
      await reversePayment(value.context, value.result.payment.id, 'AT-09 test cleanup');
    }
    const restored = await db.query.invoices.findFirst({ where: eq(invoices.id, invoice.id) });
    expect(Number(restored!.balance)).toBe(startingBalance);
  }, 60_000);
});
