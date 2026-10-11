# Desktop Workflow Validation

- API and database target: local API at `127.0.0.1:3310` connected to synthetic `bcis_acceptance_test`.
- Desktop production renderer build: PASS.
- Electron process/window startup: PASS after removing the inherited `ELECTRON_RUN_AS_NODE` variable from the launch process.
- UI smoke workflow: PASS via Playwright Electron test on 2026-10-11. Admin sign-in, seeded subscriber data load, Dashboard/Subscribers/Billing/Payments/Collections/Receivables/Reports/Administration navigation, Backup & Restore tab, and logout all passed. The run observed no API 4xx/5xx responses.
- Test: `packages/desktop/e2e/workflows.spec.ts` (`pnpm test:e2e`).

This is a read-only operational-screen smoke test apart from creating/revoking its login session. It does not create billing cycles, payments, collection batches, or backups through the UI. Those transactional workflows and real three-PC LAN operation still require separate acceptance runs on disposable data and office PCs.
