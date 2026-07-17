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

O arquivo `.dump` e salvo em `backend/backups`.

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
$env:ALLOW_DB_RESTORE="yes"
npm run db:restore -- .\backups\ARQUIVO.dump
npm run db:preflight
Remove-Item Env:\ALLOW_DB_RESTORE
```

Via wrapper PowerShell:

```powershell
.\scripts\restore-db.ps1 -BackupPath .\backend\backups\ARQUIVO.dump -ConfirmRestore
```

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
Invoke-RestMethod http://localhost:3000/health/db
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
