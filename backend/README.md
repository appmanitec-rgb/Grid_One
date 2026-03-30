# Manitec GridOne API (Backend)

## Setup

```bash
npm install
cp .env.example .env
npm run prisma:generate:local
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

## Required Environment Variables

- `DATABASE_URL`
- `DB_NAME`
- `JWT_SECRET`
- `CORS_ORIGINS`
- `SEED_ADMIN_PASSWORD`
- `SEED_MASTER_PASSWORD`

## Optional Automation Scheduler Variables

- `AUTOMATION_ENABLED` (default: `true`)
- `AUTOMATION_RUN_ON_BOOT` (default: `false`)
- `AUTOMATION_TIMEZONE` (default: `America/Sao_Paulo`)
- `AUTOMATION_DAILY_CRON` (default: `0 5 * * *`)
- `AUTOMATION_HOURLY_ENABLED` (default: `true`)
- `AUTOMATION_HOURLY_CRON` (default: `15 * * * *`)
- `AUTOMATION_PREVENTIVE_DAYS_AHEAD` (default: `45`)

## Run

```bash
npm run start:dev
```

Local start and seed scripts auto-regenerate Prisma Client if `node_modules` was previously built with `prisma generate --no-engine`.

API default port: `3000`

## Production Hardening Included

- Global validation pipe (`whitelist`, `forbidNonWhitelisted`, `transform`)
- `helmet` enabled
- CORS restricted by `CORS_ORIGINS`
- Global rate limiting (`@nestjs/throttler`)
- JWT secret required (`JWT_SECRET`)
- Access policy guard enabled by module (`RequireAccessPolicy`)
- Health endpoint: `GET /health`

## Automatic Daily Operations

When scheduler is enabled, the backend executes:

- Daily full cycle: delinquency sync, preventive order automation, receivables sync from contract invoices, receivables overdue update, payables overdue update.
- Hourly light cycle: delinquency sync + receivables sync from contract invoices.

## Database Operations

```bash
npm run db:status
npm run db:migrate
npm run db:backup
ALLOW_DB_RESTORE=yes npm run db:restore -- backups/<file>.dump
```

## Seed

```bash
npm run seed
npm run seed:flow
```

Seed uses credentials from env (`SEED_*`) and no hardcoded passwords.

## Test and Build

```bash
npm run lint
npm run test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
```
