# Three-PC LAN Validation

Status: **Pending physical validation**. The API is configured for `0.0.0.0`; this workspace has only one available PC, so it cannot establish the required three independent desktop sessions.

Run this on the office LAN after starting the API host and installing the desktop client on three PCs. Keep PostgreSQL accessible only from the API host.

| Check | PC 1 | PC 2 | PC 3 | Evidence |
| --- | --- | --- | --- | --- |
| `http://<API-host>:3000/health` opens | ☐ | ☐ | ☐ | |
| Sign in with distinct authorized accounts | ☐ | ☐ | ☐ | |
| Search the same seeded subscriber | ☐ | ☐ | ☐ | |
| Simultaneous payment attempts preserve invoice balance and unique receipts | ☐ | ☐ | ☐ | |
| Sign out; confirm a protected request requires authentication | ☐ | ☐ | ☐ | |

Record date, API host name, client build, account roles (never passwords), test invoice, receipt references, and observed results. Use synthetic/test records for the concurrency check.
