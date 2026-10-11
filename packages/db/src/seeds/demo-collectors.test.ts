import { describe, expect, it, vi } from 'vitest';
import { users } from '../schema';
import type { DatabaseTransaction, User } from '../index';
import { DEMO_COLLECTOR_ACCOUNTS, ensureDemoCollectors } from './demo-collectors';

function createSeedTransaction(existingUsers: User[]) {
  const conflictInsert = vi.fn().mockResolvedValue([]);
  const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing: conflictInsert });
  const tx = {
    insert: vi.fn().mockReturnValue({ values: insertValues }),
    query: { users: { findFirst: vi.fn() } },
  };
  existingUsers.forEach((user) => tx.query.users.findFirst.mockResolvedValueOnce(user));
  return { tx, insertValues, conflictInsert };
}

const demoUsers = DEMO_COLLECTOR_ACCOUNTS.map((account, index) => ({
  id: `collector-${index + 1}`,
  username: account.username,
  roleId: 'field-collector-role',
})) as User[];

describe('demo field collector seeding', () => {
  it('creates three separate active users using the least-privilege collector role', async () => {
    const { tx, insertValues, conflictInsert } = createSeedTransaction(demoUsers);

    const collectors = await ensureDemoCollectors(tx as unknown as DatabaseTransaction, 'field-collector-role', 'hashed-demo-password');

    expect(collectors.map((collector) => collector.id)).toEqual(['collector-1', 'collector-2', 'collector-3']);
    expect(new Set(collectors.map((collector) => collector.id)).size).toBe(3);
    expect(insertValues).toHaveBeenCalledTimes(3);
    expect(conflictInsert).toHaveBeenCalledTimes(3);
    for (const [index, account] of DEMO_COLLECTOR_ACCOUNTS.entries()) {
      expect(insertValues).toHaveBeenNthCalledWith(index + 1, {
        ...account,
        passwordHash: 'hashed-demo-password',
        roleId: 'field-collector-role',
        status: 'active',
      });
    }
  });

  it('refuses to treat an existing account with a different role as a collector', async () => {
    const existing = [{ ...demoUsers[0], roleId: 'administrator-role' }];
    const { tx } = createSeedTransaction(existing);

    await expect(ensureDemoCollectors(tx as unknown as DatabaseTransaction, 'field-collector-role', 'hashed-demo-password'))
      .rejects.toThrow('Demo collector demo_collector_01 is missing or assigned to a different role');
  });
});
