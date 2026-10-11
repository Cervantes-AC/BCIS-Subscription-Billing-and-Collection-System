# AT-12 Backup and Restore Evidence

- Date/time: 2026-10-11 12:51:50 +08:00
- Source: bcis_acceptance_test (disposable synthetic database)
- Restore target: bcis_acceptance_test_restorecheck_20261011_125148
- Dump size: 194115 bytes
- Result: PASS; row counts and invoice, payment, and audit samples matched exactly.
- Comparison JSON: {"invoiceCount" : 114, "paymentCount" : 81, "allocationCount" : 97, "auditCount" : 81, "invoiceSample" : {"invoiceNumber" : "INV-202609-00001", "totalAmount" : 299900, "balance" : 90504, "status" : "partially_paid"}, "paymentSample" : {"receiptNumber" : "RCPT-001000", "amount" : 90504, "status" : "reversed"}, "auditSample" : {"action" : "payment.create", "entityType" : "payment"}}

The target database and dump are intentionally retained for review. Both contain synthetic acceptance data only.
