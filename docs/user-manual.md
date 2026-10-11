# User Manual

## Sign in

Start the BCIS desktop client and sign in with an account created by an administrator. The initial development seed creates `admin` with the temporary password `admin123`; change it before any shared or production use. Your role controls which screens and server actions are available.

After loading demo data into a disposable database, the demo seed adds three field-collector accounts: `demo_collector_01`, `demo_collector_02`, and `demo_collector_03`. Their initial password is `admin123`. These are synthetic demonstration users; do not use these accounts or passwords for a shared deployment.

## Daily work

### Subscribers and services

Open **Subscribers** to search or register a subscriber, update contact/address details, and review service accounts. Use **Plans** and **Service Accounts** to maintain rates and active service details. Archive or terminate accounts through status workflows so history remains available.

### Billing

Open **Billing**, create/select the period, generate invoices, review totals, then finalize the cycle. Check the preview and period before finalizing. The database prevents a second invoice for the same service account and billing cycle.

### Payments and GCash

Search for the subscriber, enter the amount in pesos, choose the payment method, and review the allocation preview. The preview applies payment to the oldest unpaid balance first; any amount beyond current balances is shown as advance credit in the preview. Post cash and other approved methods to issue a receipt. GCash entries stay pending until a permitted user reviews the reference, amount, sender details, and proof and verifies or rejects them. Never treat an uploaded screenshot as automatic payment confirmation.

Use **Reverse** for an already posted payment correction and enter a reason. Keep the original receipt and reversal reference together for audit review.

### Collections

Open **Collections** to create a batch for a collector, area, and collection date. Review the included accounts and print the route sheet before field work. Record each collected amount and method. On return, submit the cash and non-cash remittance, count the actual totals, and reconcile. A shortage or overage remains visible. A batch with a shortage cannot be closed through the standard workflow.

### Receivables and reports

Use **Receivables** to review overdue accounts, aging buckets, and suspension candidates. Confirm the subscriber and outstanding invoices before operational action. **Reports** provides collection, aging, billing-versus-collection, and collector outputs. Exported files contain financial data; store them in an access-controlled location.

### Administration

Administrators can manage users, roles, settings, audit history, and backups. Create a backup before a major upgrade. Restore replaces the database contents; verify the selected backup and coordinate with all office users before starting. Restore testing should be performed against a disposable database first.

## Common troubleshooting

| Symptom | Check |
| --- | --- |
| Cannot sign in | Ask an administrator to confirm the account is active and reset its password if needed. |
| API unavailable | Confirm the API host is running, port 3000 is reachable, and the client `VITE_API_URL` points to the API host. |
| Database unavailable | Check PostgreSQL service status and `DATABASE_URL` on the API host; use `/health` and server logs. |
| Report/backup command fails | Confirm server-side PostgreSQL client tools are installed and output/backup directories are writable. |
| GCash reference rejected as duplicate | Search the queue and posted payments; references must not be reused. |

Use synthetic subscriber records in demos. Do not enter live subscriber, phone, or GCash data into a lab instance.
