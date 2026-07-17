# Staging setup

## Objetivo

Este runbook prepara a homologacao do MANITEC GridOne em staging. Staging deve ser um ambiente separado de desenvolvimento e producao, com banco, storage, secrets e URLs proprios.

## Arquitetura minima

- Frontend Next.js exposto em URL HTTPS estavel.
- Backend NestJS exposto em URL HTTPS estavel.
- PostgreSQL exclusivo de staging.
- Bucket S3-compatible exclusivo de staging.
- Destino seguro para backups.
- Logs estruturados por stdout ou coletor externo.
- Alertas para aplicacao, banco, storage, backup e erros repetidos.

## Variaveis de ambiente

Use os templates:

- `backend/.env.staging.example`
- `frontend/.env.staging.example`

Regras:

- Nao commitar `.env` real.
- `NODE_ENV=staging`.
- `FILE_STORAGE_DRIVER=s3|minio|supabase`.
- `DATABASE_URL` deve apontar para PostgreSQL exclusivo de staging.
- `JWT_SECRET` deve ser forte e diferente de dev/producao.
- `CORS_ORIGINS` deve conter somente o frontend de staging.
- E2E remoto deve usar `E2E_TARGET_ENV=staging`, `E2E_USE_EXISTING_SERVER=true` e `E2E_CONFIRM_STAGING=true`.

## Deploy controlado

Backend:

```powershell
npm ci
npm run env:check
npm run db:preflight
npx prisma generate
npm run db:migrate
npm run build
npm run start
```

Frontend:

```powershell
npm ci
npm run lint
npm run build
npm run start
```

## Validacoes pos-deploy

Validar sem imprimir secrets:

```powershell
Invoke-RestMethod "$env:E2E_API_URL/health"
Invoke-RestMethod "$env:E2E_API_URL/health/db"
Invoke-RestMethod "$env:E2E_API_URL/health/storage"
```

Executar smoke remoto:

```powershell
$env:E2E_TARGET_ENV="staging"
$env:E2E_USE_EXISTING_SERVER="true"
$env:E2E_CONFIRM_STAGING="true"
npm run e2e:staging
```

## Storage

Validar no provedor real:

- upload de evidencia;
- download interno autorizado;
- download no portal;
- geracao de PDF;
- link publico;
- revogacao;
- checksum;
- MIME type;
- arquivo inexistente;
- tentativa de path traversal;
- ausencia de `storageKey` nas respostas publicas.

## Backup e restore

Backup deve ser executado somente no banco de staging:

```powershell
.\scripts\backup-db.ps1 -BackendDir .\backend
```

Restore deve usar banco descartavel:

```powershell
.\scripts\restore-db.ps1 -BackupPath CAMINHO_DO_BACKUP -BackendDir .\backend -ConfirmRestore
```

Nunca restaurar sobre o banco principal de staging.

## Rollback

Rollback de aplicacao deve voltar para a tag validada:

```powershell
git checkout v0.17-pilot-ready
```

Rollback de banco deve seguir `docs/rollback-runbook.md`. Nao apagar migrations aplicadas.
