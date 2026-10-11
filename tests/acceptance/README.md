# Acceptance Test Package

These scenarios are the required AT-01 through AT-12. They use synthetic data and must be run against a disposable PostgreSQL database; do not run against live subscriber data. The test environment is configured with `DATABASE_URL` and is migrated/seeded using the commands in the root README. For each run, capture date, build/commit, database reset method, test output, and any defect.

| ID | Acceptance | Evidence / pass condition |
| --- | --- | --- |
| AT-01 | Exact payment | Post a payment equal to one invoice balance. Invoice balance is 0, status is `paid`, and one receipt/allocation exists. |
| AT-02 | Partial payment | Post less than the balance. Allocation equals payment amount; invoice is `partially_paid` and balance is the exact centavo remainder. |
| AT-03 | Advance payment | Post more than total open balances. All open invoices are paid oldest first and the excess appears in `subscriber_credits` and the Payments screen credit balance. |
| AT-04 | Oldest-first | With two due invoices, confirm the earlier due invoice is paid before the later one. |
| AT-05 | Duplicate GCash | Submit the same reference twice. The second submission is rejected and only one queue record exists. |
| AT-06 | Reversal | Reverse a posted payment. Original payment/receipt remains, a linked negative reversal exists, and invoice balances return to their pre-payment values. |
| AT-07 | Balanced remittance | Remit and reconcile expected amounts. Difference is zero and an authorized supervisor can close the batch. |
| AT-08 | Collector shortage | Reconcile below expected cash. Shortage is visible and ordinary close is rejected. |
| AT-09 | Concurrent users | Post concurrent payments from three sessions. Balances remain non-negative and allocation totals equal posted amounts. |
| AT-10 | Authorization | Send a protected mutation as a role without permission. Server responds 403 and no row changes. |
| AT-11 | Duplicate billing | Generate the same service account/cycle twice. Only one invoice exists; the duplicate request reports a conflict or skips it. |
| AT-12 | Backup/restore | Create a backup, restore to a disposable database, and compare table counts and invoice/payment/audit samples. |

The three-PC LAN checklist is in `docs/deployment-guide.md`. Keep a signed or timestamped execution log here for submission evidence. A scenario should be marked passed only after the result is observed against the application/database; a written procedure is not test evidence.

## Executable checks

The regular service suite is `pnpm --filter @bcis/api test:unit`. It currently covers ten service-level cases. The concurrency check requires a disposable, migrated, synthetically seeded database and is opt-in:

```powershell
$env:DATABASE_URL = '<disposable PostgreSQL URL>'
$env:BCIS_ACCEPTANCE_DB = '1'
pnpm --filter @bcis/api test:integration
```

To verify a real backup/restore cycle, set `BCIS_DISPOSABLE_DATABASE_URL` to that disposable database URL and run:

```powershell
./tests/acceptance/restore-check.ps1
```

The script refuses source database names without `test`, `acceptance`, or `disposable`, writes comparison evidence, and retains the dump and restored database for inspection. See [AT-09 evidence](evidence-AT09.md), [latest AT-12 restore evidence](evidence-restore-20261011_132344.md), and the [three-PC checklist](lan-validation.md).
