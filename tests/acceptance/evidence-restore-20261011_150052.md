# AT-12 Backup and Restore Evidence

- Date/time: 2026-10-11 15:00:54 +08:00
- Source: bcis_acceptance_test_20261011 (disposable synthetic database)
- Restore target: bcis_acceptance_test_20261011_restorecheck_20261011_150052
- Dump size: 192159 bytes
- Result: PASS; row counts and invoice, payment, and audit samples matched exactly.
- Comparison JSON: {"invoiceCount" : 111, "paymentCount" : 74, "allocationCount" : 93, "auditCount" : 74, "invoiceSample" : {"invoiceNumber" : "INV-202609-00001", "totalAmount" : 99900, "balance" : 0, "status" : "overdue"}, "paymentSample" : {"receiptNumber" : "RCPT-001000", "amount" : 149900, "status" : "posted"}, "auditSample" : {"action" : "payment.create", "entityType" : "payment"}}

The target database and dump are intentionally retained for review. Both contain synthetic acceptance data only.
