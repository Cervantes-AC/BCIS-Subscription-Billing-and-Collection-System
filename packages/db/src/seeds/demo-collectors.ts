import { eq } from 'drizzle-orm';
import { users } from '../schema';
import type { DatabaseTransaction, User } from '../index';

export const DEMO_COLLECTOR_ACCOUNTS = [
  { username: 'demo_collector_01', email: 'demo.collector01@bcis.local', fullName: 'Demo Collector 1' },
  { username: 'demo_collector_02', email: 'demo.collector02@bcis.local', fullName: 'Demo Collector 2' },
  { username: 'demo_collector_03', email: 'demo.collector03@bcis.local', fullName: 'Demo Collector 3' },
] as const;

/** Ensure the disposable demo dataset has three separate, least-privilege collector users. */
export async function ensureDemoCollectors(
  tx: DatabaseTransaction,
  collectorRoleId: string,
  passwordHash: string,
): Promise<User[]> {
  const collectors: User[] = [];

  for (const account of DEMO_COLLECTOR_ACCOUNTS) {
    await tx.insert(users).values({
      ...account,
      passwordHash,
      roleId: collectorRoleId,
      status: 'active',
    }).onConflictDoNothing({ target: users.username });

    const collector = await tx.query.users.findFirst({ where: eq(users.username, account.username) });
    if (!collector || collector.roleId !== collectorRoleId) {
      throw new Error(`Demo collector ${account.username} is missing or assigned to a different role`);
    }
    collectors.push(collector);
  }

  if (new Set(collectors.map((collector) => collector.id)).size !== DEMO_COLLECTOR_ACCOUNTS.length) {
    throw new Error('Demo seed requires three distinct field collector accounts');
  }

  return collectors;
}
