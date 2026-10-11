# AT-12 Backup and Restore Evidence

- Date/time: 2026-10-11 13:23:46 +08:00
- Source: bcis_acceptance_test (disposable synthetic database)
- Restore target: bcis_acceptance_test_restorecheck_20261011_132344
- Dump size: 194982 bytes
- Result: PASS; row counts and invoice, payment, and audit samples matched exactly.
- Comparison JSON: {"invoiceCount" : 114, "paymentCount" : 85, "allocationCount" : 99, "auditCount" : 85, "invoiceSample" : {"invoiceNumber" : "INV-202609-00001", "totalAmount" : 299900, "balance" : 90504, "status" : "partially_paid"}, "paymentSample" : {"receiptNumber" : "RCPT-001000", "amount" : 90504, "status" : "reversed"}, "auditSample" : {"action" : "payment.create", "entityType" : "payment"}}

The target database and dump are intentionally retained for review. Both contain synthetic acceptance data only.
