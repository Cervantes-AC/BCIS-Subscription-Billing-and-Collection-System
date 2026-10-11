# BCIS-Subscription-Billing-and-Collection-System

A comprehensive desktop application for Bukidnon Cable and Internet Services - Subscription Billing, Collection, and Subscriber Ledger System.

## Architecture

```
PC 1 (Owner/Admin) ──┐
PC 2 (Cashier)      ├── LAN ──► Fastify API Server ──► PostgreSQL
PC 3 (Operations)   └┘
```

- **Desktop**: Electron + React + TypeScript + Tailwind CSS
- **API**: Fastify + TypeScript + Drizzle ORM
- **Database**: PostgreSQL 16+

## Quick Start

### Prerequisites

1. **Node.js 20+** and **pnpm 9+**
2. **PostgreSQL 16+** (or use Docker)

### Option 1: Docker (Easiest)

```bash
# Start PostgreSQL + pgAdmin
docker-compose up -d

# Verify
docker ps
# Should show bcis-postgres and bcis-pgadmin running

# pgAdmin: http://localhost:5050 (admin@bcis.local / admin123)
```

### Option 2: Local PostgreSQL

1. Install PostgreSQL 16+
2. Add `C:\Program Files\PostgreSQL\16\bin` to PATH
3. Restart terminal
4. Create database:
```sql
CREATE DATABASE bcis_billing;
CREATE USER postgres WITH PASSWORD 'postgres';
GRANT ALL PRIVILEGES ON DATABASE bcis_billing TO postgres;
```

### Setup Database

```bash
# Install dependencies
pnpm install

# Run migrations
pnpm --filter @bcis/db run migrate

# Seed demo data
pnpm --filter @bcis/db run seed

# Or run all at once with setup script
pnpm tsx scripts/setup-db.ts
# Or with Docker
pnpm tsx scripts/setup-db.ts --use-docker
```

### Start Development

```bash
# Start all (API + Desktop)
pnpm dev

# Or individually:
pnpm --filter @bcis/api run dev      # API on http://localhost:3000
pnpm --filter @bcis/desktop run dev  # Electron desktop app
```

## Demo Credentials

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | Super Admin |
| cashier | admin123 | Cashier |
| collector_supervisor | admin123 | Collection Supervisor |
| accounting | admin123 | Accounting |
| technician | admin123 | Technician |
| viewer | admin123 | Viewer |

## Project Structure

```
BCIS-Subscription-Billing-System/
├── packages/
│   ├── shared/          # Types, Zod schemas, utilities
│   ├── db/              # PostgreSQL + Drizzle ORM
│   ├── api/             # Fastify API server
│   └── desktop/         # Electron + React app
├── scripts/
│   ├── setup-db.ts      # Database setup script
│   └── setup-db.ps1     # PowerShell setup script
├── docker-compose.yml   # PostgreSQL + pgAdmin
├── .env.example         # Environment template
├── pnpm-workspace.yaml
└── package.json
```

## Available Scripts

```bash
# Development
pnpm dev                          # Start API + Desktop
pnpm --filter @bcis/api run dev   # API only
pnpm --filter @bcis/desktop run dev  # Desktop only

# Database
pnpm --filter @bcis/db run generate  # Generate migrations
pnpm --filter @bcis/db run migrate   # Run migrations
pnpm --filter @bcis/db run push      # Push schema changes
pnpm --filter @bcis/db run seed      # Seed demo data
pnpm --filter @bcis/db run studio    # Open Drizzle Studio

# Build
pnpm build                        # Build all packages
pnpm --filter @bcis/desktop run build  # Build desktop app (installer)

# Testing
pnpm test                         # Run all tests
pnpm --filter @bcis/api run test:unit
pnpm --filter @bcis/desktop run test:e2e

# Linting
pnpm lint
pnpm format                       # Prettier format
```

## API Documentation

- **Swagger UI**: http://localhost:3000/documentation
- **Health Check**: http://localhost:3000/health

## Default Ports

| Service | Port |
|---------|------|
| API Server | 3000 |
| PostgreSQL | 5432 |
| pgAdmin | 5050 |
| Desktop Dev Server | 5173 |

## Environment Variables

Copy `.env.example` to `.env` and modify:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bcis_billing
JWT_SECRET=your-secret-key-min-32-chars
PORT=3000
NODE_ENV=development
```

## Troubleshooting

### PostgreSQL Connection Failed
```bash
# Check if PostgreSQL is running
psql --version
# or
docker ps | grep postgres

# Check connection
psql "postgresql://postgres:postgres@localhost:5432/bcis_billing" -c "SELECT 1;"
```

### Migration Errors
```bash
# Reset database (WARNING: destroys data)
dropdb bcis_billing
createdb bcis_billing
pnpm --filter @bcis/db run migrate
pnpm --filter @bcis/db run seed
```

### Port Already in Use
```bash
# Kill process on port 3000
npx kill-port 3000
# or change PORT in .env
```

## Acceptance Tests (AT-01 to AT-12)

All mandatory tests are implemented:
- AT-01: Exact payment → invoice PAID, ledger balanced
- AT-02: Partial payment → correct remaining balance
- AT-03: Advance payment → credit preserved
- AT-04: Oldest-first arrears allocation
- AT-05: Duplicate GCash reference blocked
- AT-06: Payment reversal preserves history
- AT-07: Collector balanced remittance
- AT-08: Collector shortage displayed
- AT-09: Concurrent users (3 PCs)
- AT-10: Server-side authorization
- AT-11: Duplicate billing prevention
- AT-12: Backup/restore integrity

## License

Educational/Laboratory Project - BCIS Subscription Billing System

