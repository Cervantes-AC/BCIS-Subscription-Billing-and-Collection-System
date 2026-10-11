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

The seed creates initial roles, plans, and login accounts. In this development seed, the usernames are `admin`, `cashier`, `collector_supervisor`, `accounting`, `technician`, and `viewer`; their initial password is `admin123`. Change these passwords before anyone else accesses the system. The demo data seed is separate and should only be used in a disposable database:

```powershell
pnpm --filter @bcis/db run seed:demo
```

## Run the application

From the project root, start both API and desktop app:

```powershell
pnpm dev
```

The API listens at `http://localhost:3000`. Its health check is `http://localhost:3000/health`, and interactive API documentation is at `http://localhost:3000/documentation`. The Electron desktop window opens separately.

To run either part on its own, use two PowerShell terminals:

```powershell
# Terminal 1: API
pnpm --filter @bcis/api run dev
```

```powershell
# Terminal 2: desktop app
pnpm --filter @bcis/desktop run dev
```

The desktop app defaults to `http://localhost:3000/api/v1`. If the API runs at a different address, set `VITE_API_URL` before building the desktop app; see the deployment guide for a LAN example.

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
pnpm test                 # API service unit tests
pnpm test:integration     # opt-in acceptance integration checks
pnpm test:e2e             # Electron desktop smoke test
```

The integration and desktop end-to-end tests require a migrated, synthetically seeded **disposable test database**. Follow [tests/acceptance/README.md](tests/acceptance/README.md) for the required environment variables and instructions. Never point acceptance tests at production or real subscriber data. The desktop smoke test signs in, visits key screens, and signs out; it does not cover all billing, payment, collection, or backup transactions. The three-PC LAN checklist is in [tests/acceptance/lan-validation.md](tests/acceptance/lan-validation.md).

The documented acceptance scenarios are AT-01 through AT-12. Some require manual or environment-specific validation; a scenario is only complete when its result has been observed and recorded in the acceptance evidence files.

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
| `pnpm test` | Run API unit tests |
| `pnpm test:integration` | Run opt-in API acceptance integration tests |
| `pnpm test:e2e` | Run the desktop Playwright smoke test |

## Troubleshooting

- **API cannot connect to PostgreSQL:** Check that PostgreSQL is running and that `DATABASE_URL` in `.env` has the right database name and credentials. For Docker, check `docker compose ps`.
- **Database or relation does not exist:** Run `pnpm db:migrate`, then `pnpm db:seed`.
- **Port 3000 or 5432 is already in use:** Stop the other service or adjust its port and corresponding configuration.
- **Desktop reports a network error:** Check `http://localhost:3000/health` first. Confirm the desktop app's API URL points to the running API; for custom addresses, rebuild with the matching `VITE_API_URL`.
- **Need to reset a development database:** This deletes existing data. Back it up first, or use a newly created disposable database for testing.

## More documentation

- [Deployment and LAN guide](docs/deployment-guide.md)
- [Acceptance and test instructions](tests/acceptance/README.md)
- [Implementation plan](IMPLEMENTATION_PLAN.md)

This is an educational/laboratory project for Bukidnon Cable and Internet Services.
