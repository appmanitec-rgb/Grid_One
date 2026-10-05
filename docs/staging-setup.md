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
npx prisma generate
npm run db:migrate
npm run db:preflight
npm run build
npm run start
```

Em um PostgreSQL de staging **totalmente vazio**, a cadeia legada de migrations nao
reconstroi o schema: a migration `20260309155103_finance_hr_core` altera a tabela
`service_contracts`, que nao foi criada por migrations anteriores. Para a primeira
instalacao apenas, use o bootstrap controlado abaixo. Ele exige banco vazio com
`stage` ou `staging` no nome, `NODE_ENV=staging`, nome exato e confirmacao explicita.
O bootstrap cria o schema atual e registra as migrations historicas como aplicadas;
depois disso, `npm run db:migrate` pode aplicar migrations novas ja geradas. A
geracao de novas migrations por `prisma migrate dev` com shadow database ainda
depende de reparar/rebaselinar o historico legado; nao trate o bootstrap como
correcao dessa cadeia.

```powershell
$env:NODE_ENV="staging"
$env:DATABASE_URL="postgresql://USUARIO:SENHA@HOST:5432/gridone_stage?schema=public"
$env:DB_NAME="gridone_stage"
$env:EXPECTED_DB_NAME="gridone_stage"
$env:BOOTSTRAP_FRESH_STAGING_DB="yes"
$env:BOOTSTRAP_TARGET_DB_NAME="gridone_stage"
cd backend
npm run db:bootstrap:staging
npm run db:preflight
```

Nao execute esse bootstrap em banco com tabelas ou dados. O script bloqueia ambos.
No deploy seguinte, execute `npm run db:migrate` sem as variaveis de bootstrap.

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
$headers = @{ Authorization = "Bearer $env:STAGING_HEALTH_TOKEN" }
Invoke-RestMethod "$env:E2E_API_URL/health/db" -Headers $headers
Invoke-RestMethod "$env:E2E_API_URL/health/storage" -Headers $headers
```

`/health/db` e `/health/storage` exigem token de usuario ativo. O endpoint de
storage grava, le e remove um objeto temporario no bucket configurado; falha de
permissao ou conteudo divergente retorna erro. Confirme tambem upload e download
de um arquivo ficticio pela aplicacao, sem incluir token no relatorio.

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

Restore deve usar banco vazio e descartavel cujo nome contenha `restore`, `scratch`
ou `disposable`. Defina `DATABASE_URL`, `DB_NAME` e `EXPECTED_DB_NAME` para **esse
banco**, nao para o principal de staging. O script confere nome, arquivo, hash do
manifesto (quando presente) e ausencia de tabelas antes de restaurar:

```powershell
.\scripts\restore-db.ps1 -BackupPath CAMINHO_DO_BACKUP -BackendDir .\backend -TargetDatabase gridone_stage_restore -ConfirmRestore
```

Nunca restaurar sobre o banco principal de staging.

## Rollback

Rollback de aplicacao deve voltar para a tag validada:

```powershell
git checkout v0.17-pilot-ready
```

Rollback de banco deve seguir `docs/rollback-runbook.md`. Nao apagar migrations aplicadas.
