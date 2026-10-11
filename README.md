# BCIS Subscription Billing and Collection System

A Windows desktop application for managing cable and internet subscribers, recurring bills, payments, collections, receivables, reports, and administration. The Electron desktop app connects to a Fastify API, which stores data in PostgreSQL.

## How the pieces connect

```text
Electron desktop app  ──HTTP──>  Fastify API  ──>  PostgreSQL
      (React UI)                  (port 3000)       (port 5432)
```

The desktop app and API can run on one development computer. For multiple office PCs, keep PostgreSQL and the API on a host computer, then configure each desktop build to use that host's API address. See [docs/deployment-guide.md](docs/deployment-guide.md) for LAN setup.

## Requirements

- Windows 10/11 (the instructions below use PowerShell)
- Node.js 20.19 or newer
- pnpm 9 or newer
- PostgreSQL 16 or newer, either installed locally or run with Docker Desktop
- Git, if cloning the repository

Check the installed tools:

```powershell
node --version
pnpm --version
docker --version
```

Docker is only required if you choose the Docker database option.

## First-time setup

Open PowerShell in the project folder (the folder containing this README), then install dependencies and create your local environment file:

```powershell
pnpm install
Copy-Item .env.example .env
```

Edit `.env` and set `DATABASE_URL` for your PostgreSQL database. For local development, the default in `.env.example` is:

```text
postgresql://postgres:postgres@localhost:5432/bcis_billing
```

Change `JWT_SECRET` to a private random value of at least 32 characters. Do not commit or share `.env`.

### Start PostgreSQL with Docker

If Docker Desktop is installed and running, start the database from the project folder:

```powershell
docker compose up -d postgres
```

The Compose file configures a local development database named `bcis_billing`, with user `postgres` and password `postgres`. These sample credentials are for a local development machine only. To stop the database later, run `docker compose down`; the database data is kept in a Docker volume. To remove that data too, use `docker compose down -v` (this permanently deletes the local database volume).

Alternatively, install PostgreSQL 16 locally and update `DATABASE_URL` in `.env` to match the database, username, and password you created.

### Create tables and initial accounts

With PostgreSQL running and `.env` configured, run:

```powershell
pnpm db:migrate
pnpm db:seed
```

The seed creates initial roles, plans, and login accounts. In this development seed, the usernames are `admin`, `cashier`, `collector_supervisor`, `accounting`, `technician`, and `viewer`; their initial password is `admin123`. Change these passwords before anyone else accesses the system. The demo data seed also creates `demo_collector_01`, `demo_collector_02`, and `demo_collector_03` with the least-privilege field-collector role; their initial password is `admin123`. Run the demo seed only in a disposable database:

```powershell
pnpm --filter @bcis/db run seed:demo
```

## Run the application

From the project root, start both API and desktop app:

```powershell
pnpm dev
```

The API listens on port 3000. For local checks, use `http://127.0.0.1:3000/health`; interactive API documentation is at `http://127.0.0.1:3000/documentation`. The Electron desktop window opens separately.

To run either part on its own, use two PowerShell terminals:

```powershell
# Terminal 1: API
pnpm --filter @bcis/api run dev
```

```powershell
# Terminal 2: desktop app
pnpm --filter @bcis/desktop run dev
```

The desktop app defaults to `http://127.0.0.1:3000/api/v1` on the same computer. If the API runs at a different address, set `VITE_API_URL` before building the desktop app; see the deployment guide for a LAN example.

## Build and code checks

Run these from the project root:

```powershell
pnpm build
pnpm lint
pnpm -r --if-present typecheck
```

`pnpm build` builds shared code, database package, API, and desktop app. To package just the desktop app:

```powershell
pnpm build:desktop
```

## Tests

```powershell
pnpm test                 # API and database seed unit tests
pnpm test:integration     # opt-in acceptance integration checks
pnpm test:e2e             # Electron desktop smoke test
```

The integration and desktop end-to-end tests require a migrated, synthetically seeded **disposable test database**. Follow [tests/acceptance/README.md](tests/acceptance/README.md) for the required environment variables and instructions. Never point acceptance tests at production or real subscriber data. The desktop smoke test signs in, visits key screens, and signs out; it does not cover all billing, payment, collection, or backup transactions. The three-PC LAN checklist is in [tests/acceptance/lan-validation.md](tests/acceptance/lan-validation.md).

The documented acceptance scenarios are AT-01 through AT-12. Some require manual or environment-specific validation; a scenario is only complete when its result has been observed and recorded in the acceptance evidence files.

## System demonstration and defense

Use this section as a guide for explaining the system. Match claims about testing to the latest acceptance evidence and test output; a successful build does not by itself prove every workflow.

### Required live demo sequence

Use a seeded demo environment with synthetic subscriber data. Before the defense, confirm that the required accounts, service plans, invoices, payment methods, printer or receipt preview, and report exports are available. Demonstrate each workflow only after verifying it in that environment.

1. Log in with an administrator account and show the dashboard.
2. Create a synthetic subscriber or open one with an Internet or Cable service account.
3. Generate or display that month's invoice and show the corresponding ledger debit.
4. Post an exact or partial Cash payment, then print or preview its receipt.
5. Post or verify a GCash payment with proof, and show that a duplicate reference is rejected.
6. Show the subscriber ledger and Statement of Account.
7. Open an overdue subscriber and demonstrate AR aging and filtering.
8. Create or open a collector batch, record collections, remit Cash, and reconcile any difference.
9. Reverse a payment and show the resulting audit trail.
10. Export at least one management report to PDF or XLSX.
11. Sign in with a lower-privileged account and demonstrate role restrictions.
12. Create a backup and explain the restore procedure, including the result of a restore test.
13. If the laboratory network is available, demonstrate simultaneous use from multiple office clients.

Record which steps were completed and any environment-specific limitations in the acceptance evidence. Do not present an untested workflow as validated; the test coverage and LAN checklist are described above.

### Architecture and major modules

BCIS uses a three-layer architecture. The Electron desktop application presents a React interface. It sends HTTP requests to the Fastify API under `/api/v1`. The API validates requests, applies business rules, and reads or writes PostgreSQL through Drizzle ORM. The desktop application does not connect directly to the database.

- `packages/desktop` contains the Electron main/preload code and React screens for login, subscribers, service accounts, billing, payments, collections, reports, and administration.
- `packages/api` contains authentication, authorization, route handlers, request validation, and business services.
- `packages/db` contains the Drizzle schema, migrations, seeds, and database access.
- `packages/shared` contains types and utilities used by multiple packages, including currency conversion and formatting.

### Database relationships and business rules

A subscriber can have multiple service accounts. Each service account uses a plan and can have invoices for billing cycles. An invoice contains line items and adjustments, and can receive one or more payment allocations. A payment may cover multiple invoices; any unapplied excess is recorded as subscriber credit. Collection batches group accounts assigned for collection and track collected amounts and remittances. The schema definitions are in `packages/db/src/schema`.

Amounts are stored as integer centavos to avoid floating-point currency errors; shared helpers convert between pesos and centavos. Monthly invoice generation uses the service account's current rate when set, otherwise the plan's monthly rate. An installation fee applies only when the activation date falls within the billing cycle. The current generator sets reconnection fee and penalty to zero. It prevents duplicate account invoices for a cycle, with a database uniqueness constraint as a second safeguard.

Payments can be allocated manually or automatically to oldest due balances first. Manual allocations must add up to the payment amount and belong to the same subscriber. Allocation is limited to the invoice's outstanding balance. Excess is credited to the subscriber. Payment and invoice updates run transactionally, with conditional balance updates to guard against concurrent over-allocation. GCash payments remain pending until verified. Reversals preserve the original payment and create a linked reversal record. Collection batches cannot be closed with an unexplained shortage.

### How the desktop and server communicate

The renderer uses the shared API client in `packages/desktop/src/renderer/src/lib/api.ts`. It sends JSON requests to the Fastify routes registered in `packages/api/src/routes/index.ts`; the API returns JSON responses and status codes. The desktop uses the configured API base URL (by default `http://127.0.0.1:3000/api/v1`). For office PCs, the API host must be reachable on the LAN and each desktop must be configured with that host's address; see the deployment guide.

### Security measures

The API hashes passwords with bcrypt, enforces role-based access checks, validates input with shared Zod schemas, rate-limits login attempts, supports configurable account lockout, and records audit events for important actions. Sessions use opaque random access and refresh tokens stored and checked server-side. Session cookies are `httpOnly`, `sameSite` and configured `secure` in production. Electron enables context isolation and disables Node integration in the renderer; privileged functions are exposed through the preload bridge. These controls reduce risk but do not replace secure deployment, strong unique credentials, network protection, and database backups.

### Testing and current validation limits

The project provides unit/service tests, opt-in API acceptance checks, an Electron smoke test, and a separate LAN validation checklist. The desktop smoke test covers sign-in, loading data, navigation, and sign-out; it does not exercise every financial transaction in the UI. Integration checks require a disposable database with synthetic data. Consult the acceptance evidence before claiming a scenario is complete. The three-PC LAN check and any acceptance scenarios without recorded evidence still require validation in their target environment.

For a demonstration, explain which checks were run, show their results, and identify the remaining environment-specific checks. Do not use real subscriber data in acceptance testing.

### Source-code tour

For a short code walkthrough, start at the desktop API client to show how a screen makes a request, follow the corresponding route from `packages/api/src/routes/index.ts`, then show the service that applies the business rule and the relevant Drizzle table in `packages/db/src/schema`. For billing and payment calculations, point to their API service implementations and the shared currency helpers in `packages/shared/src/types/index.ts`.

### Use of AI tools

AI tools assisted development by helping explain and review code, troubleshoot reported errors, and suggest implementation, testing, and documentation changes. Suggestions were reviewed against the project and checked with available build, typecheck, lint, or test commands as applicable. The developer remains responsible for the requirements, reviewing the generated suggestions, validating behavior, and presenting an accurate account of what was completed. Describe the actual tools and contributions used by your team during the defense.

## Useful commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start API and desktop in development |
| `pnpm db:migrate` | Apply database migrations |
| `pnpm db:seed` | Create initial roles, plans, and users |
| `pnpm --filter @bcis/db run seed:demo` | Add synthetic demo records (test databases only) |
| `pnpm db:studio` | Open Drizzle Studio for database inspection |
| `pnpm build` | Build all packages |
| `pnpm lint` | Run ESLint across workspace packages |
| `pnpm test` | Run API and database seed unit tests |
| `pnpm test:integration` | Run opt-in API acceptance integration tests |
| `pnpm test:e2e` | Run the desktop Playwright smoke test |

## Troubleshooting

- **API cannot connect to PostgreSQL:** Check that PostgreSQL is running and that `DATABASE_URL` in `.env` has the right database name and credentials. For Docker, check `docker compose ps`.
- **Database or relation does not exist:** Run `pnpm db:migrate`, then `pnpm db:seed`.
- **Port 3000 or 5432 is already in use:** Stop the other service or adjust its port and corresponding configuration.
- **Desktop reports a network error:** Check `http://127.0.0.1:3000/health` first. Confirm the desktop app's API URL points to the running API; for custom addresses, rebuild with the matching `VITE_API_URL`.
- **Desktop window is blank or does not open:** Check the desktop terminal for startup errors. The dev launcher clears `ELECTRON_RUN_AS_NODE` automatically; if launching Electron another way, clear it in PowerShell with `$env:ELECTRON_RUN_AS_NODE = $null` and restart the desktop process.
- **Need to reset a development database:** This deletes existing data. Back it up first, or use a newly created disposable database for testing.

## More documentation

- [Deployment and LAN guide](docs/deployment-guide.md)
- [Acceptance and test instructions](tests/acceptance/README.md)
- [Implementation plan](IMPLEMENTATION_PLAN.md)

This is an educational/laboratory project for Bukidnon Cable and Internet Services.
