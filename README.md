# Homi

Homi is a shared household app for expenses, balances, and tasks. The interface is English, left to right.

This phase contains the repository layout, shared money utilities, the ledger rules, and the SQL migration. The migration has not been applied. The app is not deployed.

## Layout

- `client/` — web app. Screens come in a later phase.
- `server/` — API. Routes come in a later phase.
- `shared/` — shekel parsing, percentage splits, and the ledger.
- `db/migrations/` — PostgreSQL schema. Apply only after explicit approval.

## Scripts

```bash
npm install
npm test
npm run typecheck
```

Database credentials belong in `server/.env`, which is gitignored. `.env.example` lists the key names only.
