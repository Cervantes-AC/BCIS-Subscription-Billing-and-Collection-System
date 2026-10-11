# Desktop Workflow Validation

- API and database target: local API at `127.0.0.1:3310` connected to synthetic `bcis_acceptance_test`.
- Desktop production renderer build: PASS.
- Electron process/window startup: PASS after removing the inherited `ELECTRON_RUN_AS_NODE` variable from the launch process.
- UI workflow result: NOT RUN. The desktop control tool rejected interaction with the Electron window, so no UI operation is marked passed.

The full UI workflow remains to be executed on a workstation where the operator can use the built client. Cover login, subscriber/service lookup, billing generation, payment and receipt, collection/remittance, reports, administration, backup, and logout using synthetic accounts/data. Record outcomes and screenshots here after observation. This is separate from API/service tests and database restore evidence.
