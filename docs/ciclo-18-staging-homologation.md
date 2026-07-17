# Ciclo 18 - Staging homologation

## 1. Resumo executivo

O Ciclo 18 preparou o projeto para homologacao real em staging, mas a homologacao externa nao foi executada porque a infraestrutura real nao foi disponibilizada neste ambiente.

Resultado: **NAO APROVADO PARA PILOTO**.

Motivo: faltam PostgreSQL separado de staging, bucket S3-compatible real, destino seguro de backup, URLs estaveis de staging, servico externo de logs/alertas e banco descartavel para restore.

## 2. Commit e tag de origem

- Commit base: `51b94df chore: ciclo 17 hardening producao piloto operacional`
- Tag base: `v0.17-pilot-ready`
- Estado inicial: arvore limpa

## 3. Infraestrutura disponivel

Disponivel no repositorio:

- templates de ambiente de producao;
- scripts locais de backup/restore;
- healthchecks `/health`, `/health/db`, `/health/storage`;
- adapter S3-compatible ja implementado;
- runner E2E local;
- testes automatizados locais.

Nao evidenciado neste ambiente:

- URL real do frontend de staging;
- URL real do backend de staging;
- PostgreSQL exclusivo de staging;
- bucket S3-compatible real;
- credenciais reais de storage;
- destino seguro para backups;
- servico externo de logs e alertas;
- conta administrativa real de homologacao.

## 4. Itens bloqueados por falta de infraestrutura

- Deploy real em staging.
- Migrations em banco de staging.
- Homologacao de upload/download em S3 real.
- Backup real do banco de staging.
- Restore em banco descartavel.
- Healthchecks externos.
- Smoke E2E remoto contra staging.
- Alertas externos ativos.
- Decisao de go-live.

## 5. Deploy de staging

Nao executado. Foi criada documentacao em `docs/staging-setup.md` com arquitetura, variaveis, comandos de deploy, validacoes pos-deploy e rollback.

## 6. Migrations

Nao houve migration nova neste ciclo.

`npx prisma migrate status` foi executado localmente e falhou por ausencia do PostgreSQL local em `localhost:5433`.

## 7. Storage externo

Nao homologado contra provedor real.

Preparado:

- `backend/.env.staging.example` exige storage externo em staging;
- healthcheck nao expoe bucket, path, chaves ou `storageKey`;
- docs listam testes obrigatorios de upload, download, PDF, checksum, MIME type, revogacao e path traversal.

## 8. Backup

Backup real nao executado. `docs/staging-backup-restore-report.md` registra bloqueio e manifesto esperado.

## 9. Restore

Restore real nao executado. Politica mantida:

- nunca restaurar sobre banco principal;
- usar banco descartavel;
- exigir `scripts/restore-db.ps1 -ConfirmRestore`.

## 10. Healthchecks

Healthchecks existentes foram mantidos. O relatorio de health nao expoe secrets.

Validacao remota: nao executada por falta de backend de staging.

## 11. Logs

Foi padronizado log HTTP estruturado por stdout:

- `requestId`;
- timestamp;
- ambiente;
- versao;
- metodo;
- rota sanitizada;
- status;
- duracao;
- usuario por ID;
- IP.

O interceptor mascara tokens, secrets, `DATABASE_URL`, `storageKey` e caminhos sensiveis de laudos/downloads.

## 12. Alertas

Foi criado `docs/monitoring-alerting.md` com alertas criticos e avisos.

Monitoramento externo nao foi configurado porque nenhum destino real foi fornecido.

## 13. Politica allowOpenIssues

Foi formalizada em `docs/financial-closing-policy.md`.

Implementacao ajustada:

- financeiro comum nao pode fechar conciliacao com pendencias abertas usando `allowOpenIssues`;
- `ADMIN` e `MANAGER` podem fechar com ressalva;
- motivo continua obrigatorio;
- auditoria existente registra fechamento/reabertura.

## 14. E2E remoto

Foi criado suporte a staging:

- script `npm run e2e:staging`;
- spec `frontend/e2e/staging-smoke.spec.ts`;
- `E2E_USE_EXISTING_SERVER=true`;
- `E2E_TARGET_ENV=staging`;
- `E2E_CONFIRM_STAGING=true`;
- allowlist de hosts via `E2E_STAGING_HOST_ALLOWLIST`;
- bloqueio quando o alvo remoto nao parece staging.

O smoke remoto nao foi executado contra ambiente real.

## 15. Rollback

Foi criado `docs/rollback-runbook.md` com criterios, responsaveis, ordem de acoes, preservacao de evidencias e retorno para `v0.17-pilot-ready`.

## 16. Checklist de go-live

Foi criado `docs/go-live-checklist.md`.

O checklist ainda nao esta aprovado porque depende de staging real, backup real, restore real, storage real e monitoramento externo.

## 17. Testes executados

Backend:

- `npm run env:check`: passou.
- `npm run db:preflight`: bloqueado, PostgreSQL local `localhost:5433` indisponivel.
- `npx prisma migrate status`: bloqueado, PostgreSQL local `localhost:5433` indisponivel.
- `npm run lint`: passou.
- `npm run build`: passou.
- `npm test -- --runInBand`: passou, 29 suites / 167 testes.
- `npm run seed:flow`: bloqueado, PostgreSQL local `localhost:5433` indisponivel.

Frontend:

- `npm run lint`: passou.
- `npm run build`: passou com rede liberada para Google Fonts.
- `npm run e2e`: bloqueado no `db:preflight`, PostgreSQL local `localhost:5433` indisponivel.
- `npm run e2e:staging`: bloqueou corretamente sem `E2E_CONFIRM_STAGING=true`.

Infraestrutura:

- `docker compose up -d postgres`: bloqueado, Docker daemon indisponivel.

## 18. Evidencias

Novas evidencias automatizadas:

- teste unitario para logs estruturados e mascaramento;
- teste unitario para fechamento bancario com ressalva restrito a gestor/admin;
- E2E local atualizado para validar que financeiro comum nao fecha com ressalva;
- E2E staging smoke preparado, mas nao executado remotamente.

## 19. Riscos restantes

- Storage S3 real ainda nao homologado.
- Backup/restore real ainda nao homologado.
- Monitoramento externo ainda nao ativo.
- Healthcheck externo ainda nao validado.
- E2E remoto ainda nao executado.
- Politica `allowOpenIssues` precisa validacao operacional humana.
- LGPD/juridico ainda precisa revisao humana.

## 20. Pendencias

- Provisionar PostgreSQL exclusivo de staging.
- Provisionar bucket S3-compatible exclusivo de staging.
- Provisionar destino seguro de backup.
- Provisionar banco descartavel para restore.
- Definir URLs HTTPS de backend/frontend.
- Configurar CORS de staging.
- Configurar coleta externa de logs.
- Configurar alertas.
- Criar usuarios e dados ficticios de E2E em staging.
- Executar smoke remoto.

## 21. Decisao

**NAO APROVADO PARA PILOTO**.

O sistema esta preparado tecnicamente para homologacao de staging, mas nao esta homologado em staging real.

## 22. Recomendacao para Ciclo 19

Executar a homologacao real com infraestrutura disponivel:

1. Provisionar staging.
2. Aplicar migrations.
3. Configurar S3-compatible real.
4. Executar upload/download/PDF/link publico/revogacao.
5. Gerar backup.
6. Restaurar em banco descartavel.
7. Ativar logs e alertas.
8. Rodar `npm run e2e:staging`.
9. Preencher checklist de go-live.
10. Reavaliar decisao de piloto.
