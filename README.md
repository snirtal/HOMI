# Homi

Homi is a shared household app for expenses, balances, and tasks. The interface is English, left to right.

The web app can be deployed. Neon PostgreSQL is the only database, and the SQL files in `db/migrations/` have not been applied. Until `DATABASE_URL` is set, local `npm run dev` keeps accounts in memory. The deployed API refuses to start without that variable.

## Layout

- `client/` — web app.
- `server/` — API. Deployed storage is Neon PostgreSQL. Tests use memory.
- `shared/` — shekel parsing, percentage splits, and the ledger.
- `db/migrations/` — PostgreSQL schema. Apply only after explicit approval.

## Scripts

```bash
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

Open http://127.0.0.1:5173/ . The API listens on http://127.0.0.1:8787/ . The production build does not start either server.

Database credentials belong in `server/.env`, which is gitignored. `.env.example` lists the key names only.
