# AT-09 Concurrent Payment Evidence

- Date: 2026-10-11
- Target: `bcis_acceptance_test`, a disposable PostgreSQL database populated with synthetic seed data
- Scenario: Three distinct active user contexts concurrently attempted allocations of 40% of one unpaid invoice's starting balance.
- Result: PASS. Two requests posted and one was rejected; the two receipt numbers were unique. Invoice balance never went below zero, `paidAmount + balance = totalAmount`, and reversing both synthetic payments restored the starting balance.
- Test: `packages/api/src/services/__tests__/acceptance.integration.test.ts`

This service-level database test verifies concurrent posting and cleanup. It does not replace a separate-PC desktop session test.
