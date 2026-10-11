# BCIS Subscription Billing System - Implementation Completion Plan

## Current State Analysis

✅ **Already Implemented:**
- Database schema (23 tables with proper relationships, indexes, constraints)
- Database migration (0000_past_freak.sql)
- Authentication & RBAC (JWT, roles, permissions, sessions)
- Subscribers CRUD + Search
- Plans CRUD
- Service Accounts CRUD
- Billing Cycles & Invoice Generation (with duplicate prevention)
- Payments with allocation preview (oldest-first rule)
- Payment Reversal workflow
- GCash Verification Queue
- Collection Batches (full lifecycle: open → in_progress → submitted → remitted → reconciled → closed)
- AR Aging & Overdue Accounts
- Suspension Candidates
- Reports (XLSX: Monthly Collection, AR Aging, Collector Remittance, Billing vs Collection)
- PDF Statement of Account
- Desktop UI: Dashboard, Subscribers, Billing, Payments, Collections, Receivables, Reports
- Electron shell with security (contextIsolation, preload API)

⚠️ **Partially Implemented / Needs Work:**
- Admin page (users, roles, permissions, settings, backup/restore, audit logs)
- Suspension/Reconnection service endpoints (stubs in receivables routes)
- Collection route sheet view in desktop
- Collector assignment UI
- Backup/Restore workflow in UI
- Audit log viewer
- Seed data for demo
- Acceptance tests (AT-01 through AT-12)
- Documentation (technical, user manual, deployment guide)
- Three-PC LAN deployment validation

---

## Phase 1: Database Setup & Seed Data (Priority: HIGH)
- [ ] Start PostgreSQL via Docker
- [ ] Run migrations
- [ ] Create seed script with demo data (5 users, 7 plans, 50 subscribers, 60+ service accounts, 3 collectors, 3 areas, 3 billing months, mixed payments, 10+ overdue, reversals, suspensions)
- [ ] Verify data integrity

## Phase 2: Complete Missing API Endpoints (Priority: HIGH)
- [ ] Implement Suspension/Reconnection service
- [ ] Add missing admin endpoints (users, roles, permissions, settings, backup, audit)
- [ ] Add route sheet endpoint
- [ ] Add collector assignment endpoints
- [ ] Verify all routes registered

## Phase 3: Complete Desktop Admin Page (Priority: HIGH)
- [ ] Create AdminPage.tsx with tabs:
  - Users management
  - Roles & Permissions
  - Application Settings
  - Backup/Restore
  - Audit Logs
- [ ] Add Admin to navigation sidebar

## Phase 4: Fix Desktop Components (Priority: MEDIUM)
- [ ] Add route sheet view component
- [ ] Add collector assignment UI
- [ ] Add backup/restore UI
- [ ] Add audit log viewer
- [ ] Fix Suspension/Reconnection integration

## Phase 5: Acceptance Tests (Priority: HIGH)
- [ ] Unit tests for financial calculations (billing, payments, allocations)
- [ ] Integration tests for API endpoints
- [ ] E2E tests for critical workflows (AT-01 through AT-12)
- [ ] Run all tests and document results

## Phase 6: Documentation (Priority: MEDIUM)
- [ ] Technical Documentation (architecture, ERD, API, security, deployment)
- [ ] User Manual (login, subscribers, billing, payments, collections, reports)
- [ ] Deployment Guide (Docker, LAN setup, 3-PC config, backup/restore)
- [ ] API Documentation (Swagger/OpenAPI)

## Phase 7: Three-PC LAN Deployment Validation (Priority: HIGH)
- [ ] Configure API server for LAN access (0.0.0.0)
- [ ] Update desktop app API URL configuration
- [ ] Test concurrent access from multiple clients
- [ ] Verify database connection pooling
- [ ] Test backup/restore procedure

---

## Detailed Task Breakdown

### 1. Seed Data Script
Create `packages/db/src/seeds/demo-data.ts` with:
- 5 users: admin, cashier, collection_supervisor, auditor, technician
- 7 plans: 3 Internet, 2 Cable, 2 Combo
- 3 collection areas
- 2 collectors assigned to areas
- 50 subscribers across areas
- 60+ service accounts
- 3 billing cycles (Sep, Oct, Nov 2026)
- Invoices for all active service accounts
- Mixed payments: Cash, GCash, partial, exact, advance
- 10+ overdue accounts across aging buckets
- 1 payment reversal
- 2 suspension/reconnection scenarios

### 2. Missing Service: Suspension/Reconnection
Create `packages/api/src/services/suspension.ts` with:
- `suspendServiceAccount()` - create suspension record, update service account status
- `reconnectServiceAccount()` - create reconnection record, handle fee, assign technician
- `getSuspensionHistory()` - for service account
- `liftSuspension()` - when payment received

### 3. Admin API Routes
Complete `packages/api/src/routes/admin.ts` with:
- User management (CRUD, password reset, role assignment)
- Role & Permission management
- Application Settings CRUD
- Backup/Restore endpoints
- Audit Log viewer (paginated, filtered)
- System health/status

### 4. Admin Desktop Page
Create `packages/desktop/src/renderer/src/pages/AdminPage.tsx` with:
- Users tab: table with create/edit/delete, role assignment
- Roles tab: permissions matrix
- Settings tab: key-value editor
- Backup tab: create backup, list history, restore
- Audit tab: paginated log viewer with filters

### 5. Acceptance Tests
Create test files covering:
- AT-01: Exact payment → balance 0, invoice PAID
- AT-02: Partial payment → PARTIALLY_PAID, correct allocation
- AT-03: Advance payment → credit handling
- AT-04: Oldest-first arrears allocation
- AT-05: Duplicate GCash reference blocked
- AT-06: Payment reversal → history preserved, balances restored
- AT-07: Collector balanced remittance → difference 0
- AT-08: Collector shortage → visible, cannot silently close
- AT-09: Concurrent users → no corruption
- AT-10: Authorization → server rejects unauthorized
- AT-11: Duplicate billing → prevented
- AT-12: Backup/restore → integrity check passes

### 6. Documentation
- `docs/technical-documentation.md`
- `docs/user-manual.md`
- `docs/deployment-guide.md`
- `docs/erd.png` (generate from schema)

---

## Quick Start Commands

```bash
# 1. Start database
docker-compose up -d postgres

# 2. Run migrations
pnpm db:migrate

# 3. Seed demo data
pnpm db:seed

# 4. Start API server
pnpm --filter @bcis/api dev

# 5. Start desktop app (in another terminal)
pnpm --filter @bcis/desktop dev

# 6. Build for production
pnpm build
pnpm build:desktop
```

---

## Critical Gaps to Address

1. **Suspension/Reconnection API endpoints** - Currently stubbed in receivables.ts
2. **Admin page** - Completely missing from desktop
3. **Backup/Restore** - API exists but no UI, no automated backup scheduling
4. **Audit Log viewer** - API exists but no UI
5. **Route Sheet** - API exists but no desktop view/print
6. **Three-PC testing** - Need to verify LAN deployment works
7. **Seed data** - No demo data for testing
8. **Acceptance tests** - None implemented yet
9. **Documentation** - None created yet

---

## File Structure to Create/Modify

### New Files:
- `packages/db/src/seeds/demo-data.ts`
- `packages/api/src/services/suspension.ts`
- `packages/desktop/src/renderer/src/pages/AdminPage.tsx`
- `packages/desktop/src/renderer/src/components/RouteSheetView.tsx`
- `packages/desktop/src/renderer/src/components/AuditLogViewer.tsx`
- `packages/desktop/src/renderer/src/components/BackupRestorePanel.tsx`
- `tests/acceptance/` (multiple test files)
- `docs/technical-documentation.md`
- `docs/user-manual.md`
- `docs/deployment-guide.md`

### Files to Modify:
- `packages/api/src/routes/admin.ts` - complete admin endpoints
- `packages/api/src/routes/receivables.ts` - connect suspension/reconnection services
- `packages/api/src/routes/index.ts` - ensure all routes registered
- `packages/desktop/src/renderer/src/router.tsx` - add admin route
- `packages/desktop/src/renderer/src/components/Sidebar.tsx` - add Admin nav item
- `packages/desktop/src/renderer/src/App.tsx` - import AdminPage
- `docker-compose.yml` - verify PostgreSQL config
- `.env.example` - ensure all required vars documented

---

## Acceptance Criteria Checklist

- [ ] Application starts without manual edits
- [ ] Three client PCs can connect to API/database
- [ ] No secrets in repository
- [ ] Migrations run from clean database
- [ ] Seed data is synthetic
- [ ] RBAC demonstrated
- [ ] Monthly billing prevents duplicates
- [ ] Partial/exact/advance payments correct
- [ ] Payment reversal preserves history
- [ ] Receipt numbers unique, voided not reused
- [ ] Collector shortage/overage visible
- [ ] AR aging reconciles to invoices
- [ ] PDF/XLSX reports calculate correctly
- [ ] Backup/restore tested
- [ ] Unit/integration/E2E tests pass
- [ ] Documentation complete
- [ ] Release build created
- [ ] Defense ready