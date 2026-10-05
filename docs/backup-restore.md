# Backup e restore PostgreSQL

## Escopo

Procedimento operacional para backup manual, restore manual, backup antes de migration e validacao pos-restore.

Os scripts usam `DATABASE_URL` do backend e exigem ferramentas PostgreSQL instaladas (`pg_dump`, `pg_restore`).

## Backup manual

Via npm:

```powershell
cd backend
npm run db:backup
```

Via wrapper PowerShell:

```powershell
.\scripts\backup-db.ps1
```

O arquivo `.dump` e salvo em `backend/backups` com um manifesto
`.dump.manifest.json` contendo banco, ambiente, tamanho e SHA-256. A pasta e
ignorada pelo Git. Copie dump e manifesto juntos para destino seguro e criptografado.

## Backup antes de migration

```powershell
.\scripts\backup-db.ps1
cd backend
npm run db:migrate
npm run db:preflight
```

Registre:

- data/hora;
- commit;
- nome do arquivo de backup;
- responsavel;
- resultado do preflight.

## Restore manual

O restore e bloqueado por padrao. Ele exige confirmacao explicita.

Via npm:

```powershell
cd backend
$env:DATABASE_URL="postgresql://USUARIO:SENHA@HOST:5432/gridone_stage_restore?schema=public"
$env:DB_NAME="gridone_stage_restore"
$env:EXPECTED_DB_NAME="gridone_stage_restore"
$env:ALLOW_DB_RESTORE="yes"
$env:RESTORE_TARGET_DISPOSABLE="yes"
$env:RESTORE_TARGET_DB_NAME="gridone_stage_restore"
npm run db:restore -- .\backups\ARQUIVO.dump
npm run db:preflight
Remove-Item Env:\ALLOW_DB_RESTORE,Env:\RESTORE_TARGET_DISPOSABLE,Env:\RESTORE_TARGET_DB_NAME
```

Via wrapper PowerShell:

```powershell
.\scripts\restore-db.ps1 -BackupPath .\backend\backups\ARQUIVO.dump -TargetDatabase gridone_stage_restore -ConfirmRestore
```

O restore exige banco vazio com `restore`, `scratch` ou `disposable` no nome;
recusa `gridone_db`, banco com tabelas e dump com manifesto divergente. Nao restaura
sobre o banco principal. Com `pg_restore`/`psql` locais ausentes, configure
`RESTORE_DOCKER_CONTAINER` com o nome do contêiner isolado de staging para usar
as ferramentas PostgreSQL internas; `gridone_db` e recusado pelo validador.

## Validacao pos-restore

Executar:

```powershell
cd backend
npm run db:preflight
npx prisma migrate status
```

Validar endpoints:

```powershell
Invoke-RestMethod http://localhost:3000/health
$headers = @{ Authorization = "Bearer $env:STAGING_HEALTH_TOKEN" }
Invoke-RestMethod http://localhost:3000/health/db -Headers $headers
Invoke-RestMethod http://localhost:3000/health/storage -Headers $headers
```

Validar no app:

- login admin;
- portal do cliente;
- lista de OS;
- laudos;
- contas a receber;
- extrato/conciliacao bancaria.

## Cuidados

- Nunca restore em producao sem janela aprovada.
- Confirmar `DATABASE_URL` e `DB_NAME` antes.
- Preservar backup anterior ao restore.
- Nao armazenar dumps com dados reais em repositorios Git.
- Criptografar backups fora do ambiente local.
