# Deployment Guide

## Requirements

- Windows 10/11 office clients and a Windows API host on the same trusted LAN.
- Node.js 20 or newer and pnpm 9 for source-based setup.
- PostgreSQL 16 or newer on the API host. Docker Compose is an optional local development shortcut.
- PostgreSQL `pg_dump` and `pg_restore` client utilities on the API host for backup/restore.

## Configure the API host

1. Install PostgreSQL and create an application database and least-privilege application role. Do not use the sample `postgres/postgres` credentials for a shared environment.
2. Copy `.env.example` to `.env` on the API host. Set `DATABASE_URL`, a unique random `JWT_SECRET` of at least 32 characters, `HOST=0.0.0.0`, `PORT=3000`, `NODE_ENV=production`, the allowed client origins, and secure attachment/backup directories.
3. Install dependencies and build packages from the repository root:

   ```powershell
   pnpm install --frozen-lockfile
   pnpm build
   ```

4. Apply migrations and seed initial roles/users/plans/areas:

   ```powershell
   pnpm db:migrate
   pnpm db:seed
   ```

5. For a disposable demo database only, load synthetic data with `pnpm --filter @bcis/db run seed:demo` after the base seed. Do not run demo seeds against production data.
6. Start the API with `pnpm --filter @bcis/api start`. Confirm `/health` locally before opening the firewall.
7. Allow inbound TCP 3000 from the office LAN only. Keep PostgreSQL TCP 5432 restricted to the API host. Do not expose either port to the public internet.

## Configure the desktop clients

Build the client with the API host's LAN address, for example:

```powershell
$env:VITE_API_URL = 'http://192.168.1.20:3000/api/v1'
pnpm build:desktop
```

Replace the example address with a DHCP reservation/static address from the lab network. Install the resulting Windows package on all three PCs. In the API `.env`, list the renderer origins allowed by the configured app; `CORS_ORIGIN` accepts comma-separated exact origins and the Electron `null` origin. Rebuild client packages whenever the API URL changes.

## Three-PC validation checklist

Run this on the actual lab network and record the client names, API address, timestamp, and evidence:

1. From PCs 1, 2, and 3, sign in at the same time using distinct accounts.
2. From different PCs, search the same synthetic subscriber and confirm consistent data.
3. From two cashier sessions, attempt simultaneous payments against one synthetic invoice. Confirm no over-allocation or negative balance; record the receipt and invoice rows.
4. Generate the same billing cycle twice and verify the unique service-account/cycle constraint prevents duplicate invoices.
5. Verify an unauthorized role receives HTTP 403 from a protected API action, even if the request is sent outside the UI.
6. Disconnect one client and reconnect; confirm the API and other clients remain usable.
7. Check that PostgreSQL is reachable only from the API host and that no client has a database URL.

The application host and three physical Windows clients are required for this validation; unit tests cannot substitute for it.

## Backup and restore

Create a backup from **Administration → Backup & Restore**. Confirm a non-empty dump file and a successful history record. Restore the file into a new, disposable database using the supported admin restore workflow or `pg_restore`; then compare key table counts and verify login, invoice totals, payment allocations, and audit history. Never validate restore by overwriting the only copy of a live database. Retain encrypted off-host copies and periodically repeat restore checks.

## Operations and security

- Change the seeded administrator password before sharing the system.
- Keep `.env`, proof attachments, exported reports, and backups out of source control.
- Restrict server and backup directory access to authorized operators.
- Use HTTPS at a reverse proxy or a protected VPN when traffic crosses an untrusted network.
- Review logs and audit entries after incidents. Back up before migrations and release upgrades.
